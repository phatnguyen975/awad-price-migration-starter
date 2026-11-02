# Migration ledger

## G2 Freeze — 2026-11-03

The human explicitly approved G2 and authorized pushing main and v1–v4 in chat.
The agent completed the freeze checks at main commit
`9363c8262da8528eb9fd593249f63bc4d8ebe89d` before pushing.

- Result: PASS; working tree was clean and the local branch was main.
- Exactly four annotated tags exist; v1 equals the freshly fetched upstream/main.
- History follows the required commit sequence; v1 → v2 → v3 → v4 ancestry passed.
- S0–S8 rehearsal passed with zero failed requests; see docs/rehearsal-summary.md.
- All four sibling worktrees were recreated and their HEADs verified against their tags.
- Tests passed: v1=4, v2=6, v3=7, v4=7, main=7.
- Raw freeze verification: `.ia2/freeze-check.txt` (local, ignored scratch evidence).

Frozen tag commits:

| Tag | Commit |
| --- | --- |
| v1 | `2b889bde433190c17744f30d3900d38ab333a756` |
| v2 | `717724874239e236f8d6ae3417286d82130c5411` |
| v3 | `10230e3b8d3804dcf9dae8e18612b55b3ae073b1` |
| v4 | `01f6a26479df3eaeda2adaaba3df234ae0816601` |

The agent ran these authorized Git commands after the freeze checks passed:

```bash
git push origin main
git push origin v1 v2 v3 v4
```

Both succeeded against the human's fork,
`git@github.com:phatnguyen975/awad-price-migration-starter.git`.
No tag was moved and no history was rewritten. Application code, scripts,
migrations and tests are frozen; later ledger and evidence commits may advance
main without moving the version tags.

Official run: not started. Official instances, traffic counters and check labels
are not applicable to this gate entry. Every official command must be run by the
human; the agent has run no official-mode command and created no root log file.

## S0 Baseline — 2026-11-02T21:53:56.469Z
- Instances: v1 / v1 | git 3ca58e0
- Command (run by the human): node scripts/ia2/run.js official s0 --reset
- traffic-log.txt lines: 1–3 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S0-baseline → CONSISTENT
- Notes: none
