# MIGRATION.md — <one-line summary of the change>

Start state: <schema, code version on each instance, and what traffic runs before step 1>.

Legend. `DEPLOY <port> <ver>` = <the exact shell commands that restart the instance on <port> with version <ver>, copy-paste ready>.
Instances: <A = port, B = port>. <rule for rolling restarts>.

## Plan

One row per step that changes the schema, the code or the data. Every cell is concrete: no "see above", no "roll back".

| Step                                                         | Schema after                                | Code (A / B)                                                                                          | Undo (exact command)                                           | Earlier versions that can still run safely                                       |
| ------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| <id — what changes — the tag or migration file that does it> | <tables and columns present after the step> | <version on A> / <version on B>; for a rolling step also the mixed state, e.g. `<vX / vY → vX / vX>` | <copy-paste command that reverses this step, or "none: <why>"> | <versions that still work against this schema; add the condition if conditional> |
| …                                                            | …                                           | …                                                                                                     | …                                                              | …                                                                                |

## Tags and files

- `<tag>` → `<sha>` — <what that code version does>
- `<migration file>` → `<sha>`
- `<backfill script>` → `<sha>`

## Point of no return

<the step after which you cannot go back to an earlier version>. <Why it cannot be undone: what stops working, what is lost.>

## Rollback drill

<what was rolled back, from which version to which, and forward again; line range of traffic-log.txt; check-log labels before and after>

- Why it is safe: <reason>.
- Which later rollback is not safe: <from → to>, and <what goes wrong, with the evidence>.

## Backfill

<batch size, pause, transaction per batch; the row-selection rule and why; why it is re-runnable; the condition under which it may start>

## Failures and what caused them

<each failed request and its cause, or "none">

## Backup and restore

<method, backup time, restore time>

## How to replay

<exact commands, in order, to reproduce the run from the tags: checkouts or worktrees, database path, which checkout runs each migration, how traffic is started>

## PostgreSQL notes

<how this plan changes on PostgreSQL: locks, timeouts, concurrent index and constraint options>

## Tooling changes

<any change made to the provided scripts: what, why, commit>
