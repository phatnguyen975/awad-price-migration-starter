# Independent replay verification

Date: 2026-11-03 (Asia/Ho_Chi_Minh). Node v24.16.0, Linux/WSL.
The agent cloned the committed repository at `3a682e3` into
`/tmp/ia2-replay.3MN81r/repo` with --no-hardlinks. No orchestrator was invoked.
The exact executed script is docs/replay.sh; it matches the ignored execution
copy `.ia2/manual-replay.sh`. The raw `bash -x` output, without rewriting or
trimming, is docs/replay-check.log. Raw replay traffic is docs/replay-traffic-log.txt.

## Results

| Verification | Actual evidence |
| --- | --- |
| v1 tests, 4 passed | replay-check.log 12–34 |
| v2 tests, 6 passed | replay-check.log 35–57 |
| v3 tests, 7 passed | replay-check.log 58–81 |
| v4 tests, 7 passed | replay-check.log 82–105 |
| main tests after 003, 7 passed | replay-check.log 106–129 |
| All four worktrees created from matching tags | replay-check.log 130–163 |
| 001 seed/serve, then expand while v1 serves | replay-check.log 164–249 |
| v2 rolling deploy, share raised to 0.3 | replay-check.log 250–328 |
| Partial/resumed backfill and zero on repeat | replay-check.log 329–428 |
| v3 switch and v3/v2/v3 rollback with strict checks | replay-check.log 429–651 |
| v4 switch, backup and 003 | replay-check.log 652–749 |
| Actual post-drop HTTP requests and JSON responses | replay-check.log 750–761 |
| Shutdown and independently asserted totals | replay-check.log 762–786 |
| Replay worktrees removed | replay-check.log 787–797 |

Actual final traffic: 81009 successful requests, error=0, contract=0, stale=0,
unavailable=0, rerouted=82, RESULT: zero failed requests. One header, one change
to 0.3 and 10 down/back pairs were asserted from the actual replay traffic file.
Counts differ from official because random seed and run duration differ.

This replay supplements the human-run official evidence; it does not replace it.
Official down-tests of 001/002/003 are in root check-log.txt. The independent
replay tests all tagged applications and the migration sequence but does not
claim to repeat all guard/down-test scenarios or every undo combination.
The process would exit nonzero on test failures, missing health, wrong HTTP
status/body, bad strict verdict, nonzero traffic counters or wrong restart count.
A printed PASS line alone is not the basis of the audit.

The root traffic-log.txt and check-log.txt remained byte-identical to evidence
commit `3a682e3`. Their SHA256 hashes are recorded in docs/evidence-audit.json.
Temporary replay databases are not submission artifacts. No official command
was run by the agent and no access to data/app.db was needed.
