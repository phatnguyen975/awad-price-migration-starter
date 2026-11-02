#!/usr/bin/env bash
set -euo pipefail
SOURCE_REPO="$PWD"
REPLAY_BASE=$(mktemp -d /tmp/ia2-replay.XXXXXX)
git clone --no-hardlinks "$SOURCE_REPO" "$REPLAY_BASE/repo"
cd "$REPLAY_BASE/repo"
ROOT="$PWD"
RUN="$REPLAY_BASE/run"
mkdir -p "$RUN"
export DB_PATH="$RUN/app.db"
for version in v1 v2 v3 v4; do
  git checkout --detach "$version"
  npm test
 done
git checkout main
npm test
for version in v1 v2 v3 v4; do
  git worktree add --detach "../ia2-$version" "$version"
  test "$(git -C "../ia2-$version" rev-parse HEAD)" = "$(git rev-parse "$version^{commit}")"
done
TARGETS=http://localhost:4001,http://localhost:4002
TRAFFIC_PID=
cleanup() {
  if [ -n "$TRAFFIC_PID" ] && kill -0 "$TRAFFIC_PID" 2>/dev/null; then
    kill -INT "$TRAFFIC_PID"; wait "$TRAFFIC_PID" || true
  fi
  for port in 4001 4002; do
    if [ -s "$RUN/server-$port.pid" ]; then
      pid=$(cat "$RUN/server-$port.pid")
      if kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid"; wait "$pid" || true; fi
    fi
  done
}
trap cleanup EXIT
health() {
  for attempt in {1..150}; do
    if curl --fail --silent "http://localhost:$1/health"; then return 0; fi
    sleep 0.1
  done
  return 1
}
deploy() {
  local port="$1" version="$2" old_pid from
  if [ -f "$RUN/traffic-log.txt" ]; then from=$(wc -l < "$RUN/traffic-log.txt"); else from=0; fi
  if [ -s "$RUN/server-$port.pid" ]; then
    old_pid=$(cat "$RUN/server-$port.pid")
    kill -TERM "$old_pid"
    wait "$old_pid"
    sleep 1
  fi
  (cd "$ROOT/../ia2-$version"; exec env PORT="$port" DB_PATH="$DB_PATH" node src/server.js) > "$RUN/server-$port.log" 2>&1 &
  printf '%s\n' "$!" > "$RUN/server-$port.pid"
  health "$port"
  sleep 10
  if [ -n "$TRAFFIC_PID" ]; then
    python3 - "$RUN/traffic-log.txt" "$from" "$port" <<'PY'
import sys,re
from pathlib import Path
all=Path(sys.argv[1]).read_text().splitlines(); tail=all[int(sys.argv[2]):];target='http://localhost:'+sys.argv[3]
assert sum(target+' down (' in x for x in tail)==1
assert sum(x.endswith(target+' back') for x in tail)==1
assert not any(re.match(r'^\s*[\d.]+s\s+(ERROR|CONTRACT|STALE|UNAVAILABLE)\b',x) for x in all)
for x in all:
 for k in ['error','contract','stale','unavailable']:
  m=re.search(r'\b'+k+r'=(\d+)',x)
  if m: assert int(m[1])==0
PY
  fi
}
check() {
  local label="$1" policy="$2" code=0
  printf '\nCHECK %s (%s)\n' "$label" "$policy"
  npm run --silent check > "$RUN/check-$label.txt" || code=$?
  cat "$RUN/check-$label.txt"
  test "$code" -le 1
  if [ "$policy" = strict ]; then test "$code" -eq 0; test "$(tail -1 "$RUN/check-$label.txt")" = CONSISTENT; fi
}
(cd ../ia2-v1; npm run migrate; npm run seed -- 20000)
deploy 4001 v1
deploy 4002 v1
printf '0\n' > "$RUN/new-clients"
TARGETS="$TARGETS" LOG="$RUN/traffic-log.txt" NEW_CLIENTS=0 NEW_CLIENTS_FILE="$RUN/new-clients" DURATION=0 node scripts/traffic.js > "$RUN/traffic-output.txt" 2>&1 &
TRAFFIC_PID=$!
TRAFFIC_WRAPPER=$!
sleep 6
check S0 strict
(cd ../ia2-v2; npm run migrate)
check S1 any
deploy 4001 v2
check S2-A any
deploy 4002 v2
check S2-both any
printf '0.3\n' > "$RUN/new-clients"
sleep 2
grep 'new clients → 0.3' "$RUN/traffic-log.txt"
check S3-before any
(cd ../ia2-v3; node scripts/backfill-price-vnd.js --i-confirm-no-v1-writers --stop-after 10)
check S3-partial any
(cd ../ia2-v3; node scripts/backfill-price-vnd.js --i-confirm-no-v1-writers)
check S3 strict
(cd ../ia2-v3; node scripts/backfill-price-vnd.js --i-confirm-no-v1-writers) > "$RUN/idempotence.txt"
cat "$RUN/idempotence.txt"
test "$(tail -1 "$RUN/idempotence.txt")" = 'DONE updated=0 batches=0'
deploy 4001 v3
check S4-A strict
deploy 4002 v3
check S4 strict
check S5-before strict
deploy 4001 v2
deploy 4002 v2
check S5-v2 strict
deploy 4001 v3
deploy 4002 v3
check S5-after strict
deploy 4001 v4
check S6-A any
deploy 4002 v4
check S6 any
node --input-type=module - "$RUN/backup.db" <<'JS'
import { open } from './src/db.js';
const db=open();try{db.exec(`VACUUM INTO '${process.argv[2].replaceAll("'","''")}'`);}finally{db.close();}
JS
npm run migrate
check S7 strict
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
for(const port of [4001,4002]){
 const call=async(method,path,body,status)=>{const r=await fetch(`http://localhost:${port}${path}`,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)});const d=await r.json();console.log(JSON.stringify({port,method,path,status:r.status,body:d}));assert.equal(r.status,status);return d;};
 const item=d=>{assert.equal(typeof d.price,'number');assert(Number.isInteger(d.priceVnd));assert(d.price>0);};
 item(await call('GET','/menu/1',null,200));
 const list=await call('GET','/menu?limit=5',null,200);assert.equal(list.length,5);list.forEach(item);
 const added=await call('POST','/menu',{name:'Replay probe',price:29},201);item(added);
 item(await call('PATCH',`/menu/${added.id}`,{price:30},200));
 const order=await call('POST','/orders',{items:[{menuItemId:1,qty:1}]},201);assert.equal(typeof order.total,'number');
}
JS
sleep 30
kill -INT "$TRAFFIC_PID"
wait "$TRAFFIC_WRAPPER"
TRAFFIC_PID=
cleanup
trap - EXIT
python3 - "$RUN/traffic-log.txt" <<'PY'
import sys,re
from pathlib import Path
lines=Path(sys.argv[1]).read_text().splitlines()
assert lines[-1]=='RESULT: zero failed requests'
assert sum(x.startswith('=== traffic start') for x in lines)==1
assert sum(' down (' in x for x in lines)==10
assert sum(x.endswith(' back') for x in lines)==10
assert sum('new clients → 0.3' in x for x in lines)==1
for x in lines:
 for k in ['error','contract','stale','unavailable']:
  m=re.search(r'\b'+k+r'=(\d+)',x)
  if m:assert int(m[1])==0
print('INDEPENDENT REPLAY AUDIT PASS')
print(lines[-2]);print(lines[-1])
PY
for version in v1 v2 v3 v4; do git worktree remove "../ia2-$version"; done
git worktree prune
printf 'REPLAY_DIRECTORY=%s\n' "$REPLAY_BASE"
