// IA#2 step runner. Official commands are typed by the human; rehearsal uses scratch paths.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync,
  openSync, closeSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [mode, command, ...args] = process.argv.slice(2);
const help = `Usage: node scripts/ia2/run.js <rehearsal|official> <command> [options]
Commands: setup, s0 --reset, s1..s5, s6 --go, s7 --go, s8,
          down-test <001|002|003> [--from <file>], status,
          teardown [--force] [--worktrees], all (rehearsal only)
Rehearsal permits --again. IA2_SEED may lower the smoke-test seed (minimum 2000).
Exit: 0 PASS, 1 FAIL, 2 unmet precondition (no changes).`;
if (!mode || process.argv.includes('--help')) { console.log(help); process.exit(0); }
if (!['rehearsal', 'official'].includes(mode) || !command) { console.error(help); process.exit(2); }
if (mode === 'official' && !process.stdin.isTTY && process.env.IA2_ALLOW_NON_TTY !== '1') {
  console.error('Official mode requires a human terminal.'); process.exit(2);
}
const work = resolve(root, mode === 'rehearsal' ? '.ia2/rehearsal' : '.ia2');
const db = resolve(root, mode === 'rehearsal' ? '.ia2/rehearsal/app.db' : 'data/app.db');
const trafficLog = resolve(root, mode === 'rehearsal' ? '.ia2/rehearsal/traffic-log.txt' : 'traffic-log.txt');
const checkLog = resolve(root, mode === 'rehearsal' ? '.ia2/rehearsal/check-log.txt' : 'check-log.txt');
const ledger = resolve(root, mode === 'rehearsal' ? '.ia2/rehearsal/ledger.md' : 'docs/ledger.md');
const control = resolve(work, 'new-clients');
const stateFile = resolve(root, `.ia2/state-${mode}.json`);
const ports = mode === 'rehearsal' ? [4001, 4002] : [3001, 3002];
const tree = v => resolve(root, `../ia2-${v}`);
const initial = () => ({ mode, paths: { work, db, trafficLog, checkLog, ledger, control },
  instances: { A: { port: ports[0] }, B: { port: ports[1] } }, traffic: {}, steps: {} });
let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : initial();
let labels = [], notes = [], checks = [];
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : '';
const lines = file => read(file).split('\n').filter((x, i, a) => i < a.length - 1 || x);
const save = () => { mkdirSync(dirname(stateFile), { recursive: true }); writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function need(ok, message) { if (!ok) { const e = Error(message); e.precondition = true; throw e; } }
function run(bin, argv, cwd = root, database = db, allowFailure = false) {
  const r = spawnSync(bin, argv, { cwd, env: { ...process.env, DB_PATH: database }, encoding: 'utf8' });
  const output = (r.stdout ?? '') + (r.stderr ?? '');
  if (r.error || (!allowFailure && r.status !== 0)) throw Error(`${bin} ${argv.join(' ')}: ${output || r.error}`);
  return { output, stdout: r.stdout ?? '', code: r.status };
}
const git = (...argv) => run('git', argv).stdout.trim();
const npm = (name, cwd = root, database = db, extra = []) => run('npm', ['run', '--silent', name, ...extra], cwd, database);
function verify(v) {
  need(existsSync(tree(v)), `Missing worktree ${v}; run setup.`);
  need(git('-C', tree(v), 'rev-parse', 'HEAD') === git('rev-parse', `${v}^{commit}`), `Stale worktree ${v}`);
}
function alive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
async function until(fn, ms, message) {
  const end = Date.now() + ms;
  do { if (await fn()) return; await sleep(100); } while (Date.now() < end);
  throw Error(message);
}
async function freePorts() {
  for (const port of ports) await new Promise((ok, bad) => {
    const s = net.createServer();
    s.once('error', error => { error.precondition = true; bad(error); });
    s.listen(port, () => s.close(ok));
  });
}
function detach(argv, cwd, env, name) {
  mkdirSync(work, { recursive: true });
  const fd = openSync(resolve(work, name), 'a');
  const child = spawn(process.execPath, argv, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); child.unref(); return child.pid;
}
async function stop(pid, signal = 'SIGTERM') {
  if (!alive(pid)) return;
  process.kill(pid, signal);
  await until(() => !alive(pid), 15000, `Process ${pid} did not stop after ${signal}`);
}
function scan(from = 1) {
  const all = lines(trafficLog), stretch = all.slice(from - 1);
  assert(!stretch.some(l => /^\s*[\d.]+s\s+(ERROR|CONTRACT|STALE|UNAVAILABLE)\b/.test(l)), 'Traffic failure line');
  const tick = [...all].reverse().find(l => /ok=\d+.*error=/.test(l));
  assert(tick, 'No traffic counters yet');
  const counters = Object.fromEntries([...tick.matchAll(/(ok|error|contract|stale|unavailable|rerouted)=(\d+)/g)].map(m => [m[1], Number(m[2])]));
  for (const key of ['error', 'contract', 'stale', 'unavailable']) assert.equal(counters[key], 0, `${key} is nonzero`);
  return counters;
}
async function deploy(key, version) {
  verify(version);
  const instance = state.instances[key], from = lines(trafficLog).length + 1;
  const replacing = !!instance.pid;
  await stop(instance.pid);
  if (replacing) await sleep(1000);
  instance.pid = detach(['src/server.js'], tree(version), { PORT: String(instance.port), DB_PATH: db }, `server-${instance.port}.log`);
  instance.version = version; save();
  const target = `http://localhost:${instance.port}`;
  await until(async () => { try { return (await fetch(target + '/health', { signal: AbortSignal.timeout(1000) })).status === 200; } catch { return false; } }, 15000, `${target} health timeout`);
  if (alive(state.traffic.pid)) {
    await until(() => lines(trafficLog).slice(from - 1).some(l => l.endsWith(`${target} back`)), 15000, `${target} back not observed`);
    await sleep(10000);
    const stretch = lines(trafficLog).slice(from - 1);
    assert.equal(stretch.filter(l => l.includes(`${target} down (`)).length, 1);
    assert.equal(stretch.filter(l => l.endsWith(`${target} back`)).length, 1);
    scan(from);
  }
}
function check(label, policy, database = db) {
  const r = run('npm', ['run', '--silent', 'check'], root, database, true);
  const verdict = r.stdout.trim().split('\n').at(-1);
  appendFileSync(checkLog, `===== CHECK ${label} | ${new Date().toISOString()} | A=${state.instances.A.version ?? '-'} B=${state.instances.B.version ?? '-'} | git ${git('rev-parse', '--short', 'HEAD')} =====\n${r.output}exit=${r.code}\n`);
  labels.push(label); checks.push(`${label} → ${verdict}`);
  if (verdict?.startsWith('INCONSISTENT') && policy === 'any') notes.push(`${label}: ${verdict} (expected by playbook)`);
  assert([0, 1].includes(r.code) && /^(CONSISTENT|INCONSISTENT)/.test(verdict), `Check crashed: ${label}`);
  if (policy !== 'any') {
    assert.equal(r.code, 0, label);
    assert(policy === 'strict' ? verdict === 'CONSISTENT' : verdict.startsWith('CONSISTENT'), `${label}: ${verdict}`);
  }
  return verdict;
}
async function setup() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  need(major > 22 || (major === 22 && minor >= 13), 'Node >=22.13 required');
  need(!alive(state.traffic.pid) && !Object.values(state.instances).some(i => alive(i.pid)), 'Teardown before setup');
  await freePorts();
  const tags = git('tag').split('\n');
  for (const v of ['v1', 'v2', 'v3', 'v4']) {
    if (!tags.includes(v)) { console.log(`Missing ${v}; not yet built`); continue; }
    if (existsSync(tree(v))) run('git', ['worktree', 'remove', tree(v)]);
    run('git', ['worktree', 'add', '--detach', tree(v), v]); verify(v);
    console.log(`${v} verified ${git('rev-parse', `${v}^{commit}`)}`);
  }
}
async function downTest(n, from) {
  need(['001', '002', '003'].includes(n), 'down-test requires 001, 002, or 003');
  verify('v1'); if (n === '002') verify('v2');
  if (n === '003') need(from && existsSync(from), '003 requires --from <pre-drop backup>');
  mkdirSync(work, { recursive: true });
  const scratch = resolve(work, `down-test-${n}-${Date.now()}.db`);
  if (n === '003') copyFileSync(from, scratch);
  appendFileSync(checkLog, `===== DOWN-TEST ${n} | DB_PATH=${scratch} =====\n`);
  const record = (name, cwd, extra = []) => {
    appendFileSync(checkLog, `$ npm run ${name}${extra.length ? ' ' + extra.join(' ') : ''} (cwd=${cwd})\n`);
    const r = npm(name, cwd, scratch, extra); appendFileSync(checkLog, r.output); return r;
  };
  if (n === '001') {
    record('migrate', tree('v1')); record('migrate:status', tree('v1'));
    record('migrate:down', tree('v1')); record('migrate:status', tree('v1'));
  } else {
    if (n === '002') { record('migrate', tree('v1')); record('seed', tree('v1'), ['--', '1000']); }
    const cwd = n === '002' ? tree('v2') : root;
    record('migrate', cwd); record('migrate:down', cwd); record('migrate:status', cwd);
    check(n === '002' ? 'S1-down-test-002' : 'S7-down-test-003', 'strict', scratch);
  }
}
async function startTraffic() {
  writeFileSync(control, '0\n');
  state.traffic = { pid: detach(['scripts/traffic.js'], root, { DB_PATH: db, TARGETS: ports.map(p => `http://localhost:${p}`).join(','), LOG: trafficLog, NEW_CLIENTS: '0', NEW_CLIENTS_FILE: control, IDS: '2000', DURATION: '0' }, 'traffic-output.log'), firstLine: 1 };
  save();
  await until(() => /ok=\d+/.test(read(trafficLog)), 15000, 'Traffic first tick timeout');
  assert.equal(lines(trafficLog).filter(l => l.startsWith('=== traffic start') && l.endsWith('new clients 0')).length, 1);
  scan();
}
async function stopTraffic() {
  if (!state.traffic.pid) return;
  await stop(state.traffic.pid, 'SIGINT');
  await until(() => /RESULT: /.test(read(trafficLog)), 5000, 'Traffic RESULT missing');
  state.traffic.pid = null; save();
}
async function backfill(partial = false) {
  assert(Object.values(state.instances).every(i => ['v2', 'v3', 'v4'].includes(i.version)), 'v1 writers still present');
  const r = run(process.execPath, ['scripts/backfill-price-vnd.js', '--i-confirm-no-v1-writers', ...(partial ? ['--stop-after', '10'] : [])], tree('v3'));
  console.log(r.output);
  appendFileSync(checkLog, `===== BACKFILL | ${new Date().toISOString()} =====\n${r.output}`);
  const match = r.stdout.trim().split('\n').at(-1).match(/^(DONE|STOPPED) updated=(\d+) batches=(\d+)$/);
  assert(match, 'Unrecognized backfill summary');
  assert.equal(match[1], partial ? 'STOPPED' : 'DONE');
  return Number(match[2]);
}
async function backup() {
  const { open } = await import('../../src/db.js');
  const file = resolve(work, `backup-s7-${Date.now()}.db`);
  let start = Date.now(); const connection = open(db);
  try { connection.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`); } finally { connection.close(); }
  const backupMs = Date.now() - start;
  start = Date.now(); const restored = resolve(work, `restored-${Date.now()}.db`);
  copyFileSync(file, restored); check('S7-backup', 'any', restored);
  const restoreMs = Date.now() - start;
  notes.push(`VACUUM INTO backup=${backupMs}ms; restore copy and check=${restoreMs}ms; file=${file}`);
  console.log(notes.at(-1)); return file;
}
async function probe() {
  for (const port of ports) {
    const call = async (method, path, body, status) => {
      const r = await fetch(`http://localhost:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(5000) });
      assert.equal(r.status, status); return r.json();
    };
    const item = x => assert.equal(typeof x.price, 'number');
    item(await call('GET', '/menu/1', null, 200));
    const page = await call('GET', '/menu?limit=5', null, 200); assert(Array.isArray(page)); page.forEach(item);
    const created = await call('POST', '/menu', { name: 'IA2 probe', price: 45.5 }, 201); item(created);
    item(await call('PATCH', `/menu/${created.id}`, { price: 46 }, 200));
    const order = await call('POST', '/orders', { items: [{ menuItemId: 1, qty: 1 }] }, 201);
    assert.equal(typeof order.total, 'number');
  }
  notes.push('Old-client probe passed on both instances: GET item/list, POST item, PATCH item, POST order');
}
const required = { s0: ['v1'], s1: ['v1', 'v2'], s2: ['v2'], s3: ['v3'], s4: ['v3'], s5: ['v2', 'v3'], s6: ['v4'], s7: ['v4'], s8: [] };
const names = ['Baseline', 'Expand', 'Dual write', 'Backfill', 'Read price_vnd',
  'Rollback drill', 'Point of no return', 'Contract', 'Finish'];
async function step(id, options = args) {
  const index = Number(id.slice(1));
  need(required[id], `Unknown step ${id}`);
  need(!(state.steps[id]?.status === 'PASS') || (mode === 'rehearsal' && options.includes('--again')), `${id} already PASSed`);
  need(index === 0 || state.steps[`s${index - 1}`]?.status === 'PASS', 'Previous step must PASS');
  need(!Object.values(state.steps).some(s => s.status === 'FAIL' || s.status === 'RUNNING') || (id === 's0' && options.includes('--reset')), 'Failed or interrupted run; reset instead of continuing');
  if (id === 's6' || id === 's7') need(options.includes('--go'), `${id} requires --go`);
  for (const v of required[id]) verify(v);
  if (id === 's7') need(Object.values(state.instances).every(i => i.version === 'v4' && alive(i.pid)), 'Both instances must run v4');
  if (id !== 's0') need(alive(state.traffic.pid) && Object.values(state.instances).every(i => alive(i.pid)), 'Traffic and both instances must run');
  if (id === 's0') {
    need(!alive(state.traffic.pid) && !Object.values(state.instances).some(i => alive(i.pid)), 'Teardown before reset');
    need(options.includes('--reset') || ![db, trafficLog, checkLog].some(existsSync), 'Existing database/logs; --reset required');
    if (mode === 'official') need(git('status', '--short') === '', 'Official s0 requires a clean checkout');
    const count = Number(process.env.IA2_SEED ?? 20000);
    need(Number.isInteger(count) && count >= 2000, 'IA2_SEED must be an integer >=2000 (traffic IDS)');
    await freePorts();
    if (options.includes('--reset')) {
      if (mode === 'rehearsal') rmSync(work, { recursive: true, force: true });
      else {
        if (existsSync(dirname(db))) for (const f of readdirSync(dirname(db))) if (f === 'app.db' || f.startsWith('app.db-')) rmSync(resolve(dirname(db), f));
        for (const f of [trafficLog, checkLog]) rmSync(f, { force: true });
      }
    }
    state = initial();
  }
  mkdirSync(work, { recursive: true }); mkdirSync(dirname(ledger), { recursive: true });
  labels = []; notes = []; checks = [];
  const first = lines(trafficLog).length + 1;
  state.steps[id] = { status: 'RUNNING', started: new Date().toISOString(), firstLine: first }; save();
  try {
    if (id !== 's0') scan(first);
    switch (id) {
      case 's0':
        console.log(npm('migrate', tree('v1')).output);
        console.log(npm('seed', tree('v1'), db, ['--', String(process.env.IA2_SEED ?? 20000)]).output);
        await deploy('A', 'v1'); await deploy('B', 'v1'); await startTraffic(); check('S0-baseline', 'strict'); break;
      case 's1': {
        const r = npm('migrate', tree('v2')); console.log(r.output); assert(/applied\s+002_add_price_vnd/.test(r.stdout));
        check('S1-expand', 'null-ok'); await downTest('001'); await downTest('002'); break;
      }
      case 's2':
        await deploy('A', 'v2'); check('S2-A-v2', 'any');
        await deploy('B', 'v2'); check('S2-both-v2', 'any');
        writeFileSync(control, '0.3\n');
        await until(() => read(trafficLog).includes('new clients → 0.3'), 3000, 'New-client share not observed'); break;
      case 's3':
        check('S3-before-backfill', 'any'); await backfill(true); check('S3-partial', 'any');
        await backfill(); check('S3-after-backfill', 'strict'); assert.equal(await backfill(), 0, 'Backfill must be idempotent'); break;
      case 's4':
        await deploy('A', 'v3'); check('S4-A-v3', 'strict'); await deploy('B', 'v3'); check('S4-both-v3', 'strict'); break;
      case 's5':
        check('S5-before', 'strict'); await deploy('A', 'v2'); await deploy('B', 'v2'); check('S5-on-v2', 'strict');
        await deploy('A', 'v3'); await deploy('B', 'v3'); check('S5-after', 'strict'); break;
      case 's6':
        await deploy('A', 'v4'); check('S6-A-v4', 'any'); await deploy('B', 'v4'); check('S6-both-v4', 'any'); break;
      case 's7': {
        const file = await backup(); await downTest('003', file);
        const r = npm('migrate'); console.log(r.output); assert(/applied\s+003_drop_price/.test(r.stdout));
        check('S7-after-drop', 'strict'); await probe(); break;
      }
      case 's8': {
        // Keep observing while settling, so a failure stops the step immediately.
        for (let i = 0; i < 30; i++) { await sleep(1000); scan(first); }
        await stopTraffic();
        const all = lines(trafficLog);
        assert.equal(all.at(-1), 'RESULT: zero failed requests');
        assert.equal(all.filter(l => l.startsWith('=== traffic start')).length, 1);
        assert.equal(all.filter(l => / down \(/.test(l)).length, 10);
        assert.equal(all.filter(l => / back$/.test(l)).length, 10);
        for (const instance of Object.values(state.instances)) { await stop(instance.pid); instance.pid = null; }
        break;
      }
    }
    const counters = scan(first), last = lines(trafficLog).length;
    const actualCommand = `node scripts/ia2/run.js ${mode} ${id}${options.length ? ' ' + options.join(' ') : ''}`;
    appendFileSync(ledger, `\n## ${id.toUpperCase()} ${names[index]} — ${new Date().toISOString()}\n- Instances: ${state.instances.A.version} / ${state.instances.B.version} | git ${git('rev-parse', '--short', 'HEAD')}\n- Command (run by ${mode === 'official' ? 'the human' : 'the agent on a scratch database'}): ${actualCommand}\n- traffic-log.txt lines: ${first}–${last} | counters at the end: ${counters.error} / ${counters.contract} / ${counters.stale} / ${counters.unavailable}\n- check-log label: ${checks.length ? checks.join('; ') : 'none'}\n- Notes: ${notes.join('; ') || 'none'}\n`);
    Object.assign(state.steps[id], { status: 'PASS', finished: new Date().toISOString(), lastLine: last, labels, notes }); save();
    console.log(`STEP ${id.toUpperCase()} PASS\nall rules passed\ntraffic-log.txt lines ${first}–${last} | check-log labels written: ${labels.join(', ') || 'none'}\nNEXT: ${index === 8 ? 'review evidence' : `node scripts/ia2/run.js ${mode} s${index + 1}${[5, 6].includes(index) ? ' --go' : ''}`}`);
  } catch (e) {
    Object.assign(state.steps[id], { status: 'FAIL', error: e.message, lastLine: lines(trafficLog).length }); save();
    console.error(`STEP ${id.toUpperCase()} FAIL\n${e.message}\ntraffic-log.txt lines ${first}–${lines(trafficLog).length} | check-log labels written: ${labels.join(', ')}\ndo not continue; follow ia2-run-steps, section on failures`);
    e.precondition = false; throw e;
  }
}
async function teardown(options) {
  need(!alive(state.traffic.pid) || options.includes('--force'), 'Traffic is running; --force ends the run');
  if (alive(state.traffic.pid)) await stopTraffic();
  for (const i of Object.values(state.instances)) { await stop(i.pid); i.pid = null; }
  save();
  if (options.includes('--worktrees')) for (const v of ['v1', 'v2', 'v3', 'v4']) if (existsSync(tree(v))) run('git', ['worktree', 'remove', tree(v)]);
}
try {
  switch (command) {
    case 'setup': await setup(); break;
    case 'status':
      console.log(JSON.stringify({ ...state, instances: Object.fromEntries(Object.entries(state.instances).map(([k, v]) => [k, { ...v, alive: alive(v.pid) }])), traffic: { ...state.traffic, alive: alive(state.traffic.pid) } }, null, 2)); break;
    case 'down-test': await downTest(args[0], args.includes('--from') ? resolve(args[args.indexOf('--from') + 1]) : undefined); break;
    case 'teardown': await teardown(args); break;
    case 'all':
      need(mode === 'rehearsal', 'all is rehearsal only');
      for (const v of ['v1', 'v2', 'v3', 'v4']) need(git('tag').split('\n').includes(v), `Missing ${v}`);
      await setup(); for (let i = 0; i <= 8; i++) await step(`s${i}`, i === 0 ? ['--reset'] : i === 6 || i === 7 ? ['--go'] : []); break;
    default: need(/^s[0-8]$/.test(command), 'Unknown command'); await step(command);
  }
  if (!/^s[0-8]$/.test(command) && command !== 'all') {
    console.log(`STEP ${command.toUpperCase()} PASS\nall rules passed\ntraffic-log.txt lines 1–${lines(trafficLog).length} | check-log labels written: ${labels.join(', ') || 'none'}\nNEXT: ${command === 'setup' ? `node scripts/ia2/run.js ${mode} s0 --reset` : `node scripts/ia2/run.js ${mode} status`}`);
  }
} catch (e) { console.error(e.message); process.exitCode = e.precondition ? 2 : 1; }
