# AI log

## 2026-11-03 — Phase 0 preflight and instructions

```
Tool: Codex
Asked for: Read the IA2 instructions, complete Phase 0 setup and tooling, smoke test, and stop at G0.
Kept: Machine and repository checks; upstream remote configuration; this log entry.
Changed: The scaffolding allowlist includes .gitattributes after the human explicitly confirmed it.
Rejected: nothing
By hand: The human supplied the instruction files and confirmed the additional .gitattributes file. No official command has been run.
```

HEAD equals upstream/main at 2b889bde433190c17744f30d3900d38ab333a756.
Node v24.16.0, Linux, Git 2.43.0, GitHub authentication, four free ports,
scratch migration and health probe, clean SIGTERM shutdown, sibling worktree
creation/removal, and all four starter tests passed. HTTP tests require execution
outside the restricted sandbox. No rehearsal or official run has occurred yet.

## 2026-11-03 — Runtime traffic control

```
Tool: Codex
Asked for: Apply the exact NEW_CLIENTS_FILE patch described in ia2-tooling.
Kept: The readFileSync import, mutable NEW_CLIENTS value, and the prescribed runtime polling block.
Changed: nothing
Rejected: nothing
By hand: nothing
```

The scratch smoke test logged exactly one `new clients → 0.3` change.
Before that change, all failure counters were zero through 20.3 seconds.
After the change, v1 rejected the new-client contract as expected by the skill:
711 contract failures, with error/stale/unavailable all zero. This is a deliberate
negative smoke test, not a successful full migration rehearsal or official run.
Raw evidence: `.ia2/rehearsal/traffic-log.txt`, lines 2–15.

## 2026-11-03 — Orchestrator and Phase 0 smoke test

```
Tool: Codex
Asked for: Implement the orchestrator, smoke test Phase 0, and stop at G0.
Kept: scripts/ia2/run.js with mode isolation, worktree checks, ordered steps, rolling deployment, check policies, ledger, backups, down-tests, and probes.
Changed: During review, port binding errors were classified as precondition failures; step names and command summaries were added to output.
Rejected: nothing
By hand: The human approved sandbox escalation requests. No official command has been run.
```

The agent ran the smoke rehearsal on a scratch database, using ports 4001/4002
and output under `.ia2/`. Setup verified v1 and reported missing v2–v4.
Down-test 001 applied and reverted the schema; raw output was copied to
`.ia2/preflight/down-test-001.txt` (lines 1–11) before the required S0 reset.
S0 used IA2_SEED=2000 and passed; `S0-baseline` was CONSISTENT
(`.ia2/rehearsal/check-log.txt`, lines 1–5). Teardown stopped traffic with SIGINT
before stopping both servers with SIGTERM. A missing-v2 guard returned exit 2.
S1–S8 have not been exercised because v2–v4 do not exist yet.
Every official command must be run by the human; none has been run so far.

Tooling disclosure for the later MIGRATION.md: the traffic patch allows the
new-client share to change during one continuous run; the orchestrator encodes
the playbook and records raw checks and per-step ledger evidence. Both belong
to the `chore(tooling): add orchestrator and traffic control` commit.

Final verification: all four original tests passed again, syntax and whitespace
checks passed, and status reported traffic and both rehearsal servers stopped.
Only the prescribed traffic patch and the new scripts/ia2 directory change
executable code. Phase 0 is ready for G0 review; no G0 approval has been given,
no push has occurred, and Phase 1 has not started.

## 2026-11-03 — G0 approval and Phase 1 inventory

```
Tool: Codex
Asked for: Complete inventory, build migrations and v2/v3/v4 with tests and smoke runs, and stop at G1.
Kept: docs/inventory.md based on the starter files, git history, and observed Phase 0 checks.
Changed: nothing
Rejected: nothing
By hand: The human approved G0 and authorized Phase 1 in chat.
```

All required starter files were read. No unexpected difference was found.
The earlier smoke rehearsal used scratch databases; no official command has run.

## 2026-11-03 — Expand migration 002

```
Tool: Codex
Asked for: Add migration 002 with its down migration and verify it before committing.
Kept: Nullable INTEGER price_vnd with positive CHECK and no default; down drops only the new column.
Changed: nothing
Rejected: nothing
By hand: nothing
```

On scratch expand.db, migrate applied 001 and 002, seed inserted 2000 rows,
down reverted 002, status showed 002 pending, and check ended CONSISTENT.
All four original tests passed with 002 present, demonstrating v1 compatibility.
Lock: the runner takes SQLite BEGIN IMMEDIATE, reserving the writer; readers
continue under WAL. Duration: one ALTER statement and constraint validation
(proportional to existing rows), not an assumed fixed time. Running v1 expects
only price, which remains available. The down loses price_vnd data.
