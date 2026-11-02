# AGENTS.md — IA#2 zero-downtime migration (menu_items.price → price_vnd)

> **Owner:** 23127449 — Nguyễn Tấn Phát  
> **Deadline:** Thursday 2026-11-05 22:00 (Asia/Ho_Chi_Minh)

This repository is a fork of the course starter. The task is to change `menu_items.price` (thousands of dong, float) into `menu_items.price_vnd` (dong, integer) while two instances keep serving traffic, then drop `price`. No failed request at any point, and a way back at every step until the one named as the point of no return. The graded result is one repository: tags, migrations, scripts, logs and documents.

## Read first

- `docs/ia2-requirements.md` — the rubric. Never edit it. If anything here conflicts with it, the rubric wins.
- `README.md` — the starter's own documentation.
- `.agents/skills/<name>/SKILL.md` — the detailed, step-by-step instructions. Before starting a task, read the matching skill in full, together with any skill it points to:

| Skill                    | Use it for                                                               |
| ------------------------ | ------------------------------------------------------------------------ |
| `ia2-preflight`          | checking the machine and the starter, writing `docs/inventory.md`        |
| `ia2-git-flow`           | every commit, tag, worktree, the freeze, push, cleanup                   |
| `ia2-tooling`            | the `traffic.js` patch and the orchestrator `scripts/ia2/run.js`         |
| `ia2-code-versions`      | the application versions v2, v3, v4 and their tests                      |
| `ia2-migration-backfill` | migrations 002 and 003, the backfill script, down-tests                  |
| `ia2-run-steps`          | the step playbook S0–S8, in rehearsal and in the official run            |
| `ia2-evidence-submit`    | ledger, `MIGRATION.md`, `AI-LOG.md`, the audit, self-assessment, the zip |

## Where you are

You have no memory between sessions. At the start of each session work out the phase from the repository, then confirm it with the human before acting: `git tag`, `git log --oneline`, `git status`, `docs/ledger.md`, `.ia2/state-*.json` if present, which files from the table below exist.

| Phase | What                                                                                                   | Skills                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 0     | setup in the repo: `ia2-preflight` steps 1–2, tag `v1`, commit the instruction files, tooling          | `ia2-preflight`, `ia2-git-flow`, `ia2-tooling`                                 |
| 1     | preflight reading and inventory, then build: migration 002, v2, backfill, v3, v4, migration 003, tests | `ia2-preflight`, `ia2-code-versions`, `ia2-migration-backfill`, `ia2-git-flow` |
| 2     | rehearsal by the agent, fixes, freeze                                                                  | `ia2-run-steps`, `ia2-git-flow`                                                |
| 3     | official run by the human, guided by the agent                                                         | `ia2-run-steps`, `ia2-evidence-submit`                                         |
| 4     | documents, audit, self-assessment, replay check, zip                                                   | `ia2-evidence-submit`, `ia2-git-flow`                                          |

## Roles and modes

- **Agent:** writes code, migrations, scripts and documents; runs the rehearsal; guides and validates the official run.
- **Human:** runs every official command, approves the gates, owns the content and the submission.
- **rehearsal:** the agent runs it, on scratch databases and ports, with output under `.ia2/rehearsal/` (git-ignored).
- **official:** the human runs it, on `data/app.db`, ports 3001/3002, with `traffic-log.txt` and `check-log.txt` at the repository root.
- Never run an official-mode command. Never write the root log files. Never touch `data/app.db` by hand (no SQL, no manual restart of an instance). Print the exact command, wait for the human, then read the results.

## Gates

Stop and wait for an explicit "go" from the human at each of these. Do not infer approval from silence or from an earlier "go".

- **G0** end of Phase 0 (setup reviewed)
- **G1** end of Phase 1 (build reviewed)
- **G2** the freeze: rehearsal passed end to end, tags final, before any push and before the first official step
- **G3a** before step S6 (the point of no return) and **G3b** before step S7 (the drop)
- **G4** before building the zip

## Invariants

- `price_vnd = Math.round(price * 1000)` and `price = price_vnd / 1000`. One shared helper, never truncate, never write the formula elsewhere.
- Every item reply on every endpoint carries a numeric `price` (thousands of dong) and, from v2 on, an integer `priceVnd`. Order totals and `order_items.unit_price` stay in thousands of dong.
- One schema change or one behaviour change per commit and per step, never both. No in-place rename or type change.
- Every migration has a `.down.sql`, contains no `BEGIN`/`COMMIT`, and is never edited after it has been applied anywhere. `price_vnd` stays nullable with no default until the end.
- `npm run migrate` applies **all** pending files of the checkout it runs from: run it only from the checkout the git-flow skill names for that step.
- Restart one instance at a time, with `SIGTERM` (never `SIGKILL`), and wait for its recovery before touching the other.
- The backfill runs only when no instance runs a version that writes `price` alone.
- `price` is dropped only after v4, which neither reads nor writes it, runs on every instance.

## Evidence integrity

- The logs are raw command output. Never write, edit, trim, reorder or "tidy" `traffic-log.txt` or `check-log.txt`.
- The official run is one continuous traffic run for the whole sequence, stopped only at the end with `SIGINT`.
- Every step gets a ledger entry and a row in `MIGRATION.md`; every check run carries a label.
- Report honestly. An expected but unusual result (for example `INCONSISTENT` after S6) is explained in the notes, not hidden; an unexpected one is a failure.
- **Stop and report, do not continue,** on: any failure counter above 0, an `INCONSISTENT` that the playbook does not expect, an unknown state, a precondition that does not hold, or anything in the starter or the rubric that differs from what the skills say.

## Git

Follow `ia2-git-flow`: one branch, Conventional Commits, files staged by name, exactly four annotated tags `v1`–`v4`, sibling worktrees recreated for every run, history rewritten only before G2, push only after G2, no force-push (the one exception is in `ia2-run-steps`, and needs the human's approval).

## Files

- Never edit: `scripts/seed.js`, `scripts/check.js`, `scripts/migrate.js`, `README.md`, `migrations/001*`. `scripts/traffic.js` only through the patch described in `ia2-tooling`.
- `src/` and `test/` change only to create v2, v3 and v4. Keep every original assertion on `price`.
- During the official run `src/`, `scripts/`, `migrations/` and `test/` are frozen.

## Working style

- Talk to the human in Vietnamese. Everything written into the repository (documents, commits, logs, comments, templates) is in English.
- After every step report: what ran · PASS or FAIL · evidence (file and line range) · the exact next command for the human.
- If the starter, the rubric or a skill does not say, say so and ask. Do not assume.
- Keep diffs small and explainable: the human must be able to explain every line at the oral.

## AI-LOG

- Keep `AI-LOG.md` as you work: append one entry right after each task is done (a commit group, a rehearsal run, a gate), never only at the end.
- Fill it from what actually happened in the session and in git history, using the template in `ia2-evidence-submit`. Never invent. Run `git log` and `git diff` first, to catch edits the human made themselves.
- Fields: Asked for = the instruction you received. Kept = output used as generated. Changed = output revised after feedback, and why. Rejected = drafts or approaches dropped, and why. By hand = what the human did without the agent (every official command, reviews, decisions, edits made outside the chat).
- Write `nothing` for an empty field. Do not pad or flatter.
- State plainly that the rehearsal ran on scratch databases and that the human ran every official command.
- No secrets, keys, personal data or other people's work in prompts, files or logs.
