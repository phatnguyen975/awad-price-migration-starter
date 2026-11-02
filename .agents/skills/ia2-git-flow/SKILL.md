---
name: ia2-git-flow
description: Git discipline for the IA#2 zero-downtime migration project - the commit sequence, annotated tags v1 to v4, sibling worktrees, fixing history before the freeze (G2), pushing, and cleaning up before the zip. Use whenever you commit, tag, create, recreate or remove a worktree, rewrite history, push, check which checkout should run a command, or prepare the repository for submission. Also use when the human mentions tag, worktree, freeze, rebase, push, v1, v2, v3 or v4, even if they do not name this skill.
---

# ia2-git-flow

Graders check out the tags and replay the run. If a tag points at the wrong commit, or a worktree is stale, the logs cannot be reproduced and criteria 4 and 5 score 0. Treat the rules below as part of the evidence, not as housekeeping.

## At a glance

- One branch, `main`, on the human's fork. No feature branches.
- Exactly four tags, `v1`..`v4`, annotated. Rollback reuses a tag; it never creates one.
- History may be rewritten and tags moved only **before the freeze (G2)**. After G2 nothing moves, unless the human explicitly reopens the freeze after a code defect is found in the official run (see `ia2-run-steps`, "Failures"); then sections 5 to 7 apply again from the start.
- Worktrees are siblings of the repo (`../ia2-v1` ..), created from tags, recreated at the start of every run, never edited.
- Push only after G2.

## 1. Commit rules

- Conventional Commits in English: `type(scope): subject`, one logical change per commit. Types used: `chore`, `feat`, `fix`, `test`, `docs`.
- A schema change and a behaviour change never share a commit.
- Stage files by name (`git add <paths>`). Do not use `git add -A` or `git add .`: logs, `.ia2/` state and scratch files must not slip in.
- Before committing code: `npm test` passes against the migrations that exist in that commit. Before committing a migration: its down-test has been run on a scratch database.
- Check `git config user.name` and `git config user.email` are set before the first commit.

## 2. Commit sequence

| #   | Commit                                                 | Contains                                                                    | Tag      |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| 1   | the starter commit, as received                        | nothing of yours                                                            | **`v1`** |
| 2   | `chore(agent): add agent instructions`                 | `AGENTS.md`, `.agents/`, `docs/ia2-requirements.md`, `.gitignore`           |          |
| 3   | `chore(tooling): add orchestrator and traffic control` | `scripts/traffic.js` patch, `scripts/ia2/`                                  |          |
| 4   | `docs: preflight inventory`                            | `docs/inventory.md`                                                         |          |
| 5   | `feat(db): expand price_vnd`                           | `migrations/002_*.up.sql` and `.down.sql`                                   |          |
| 6   | `feat(v2): dual write and priceVnd API`                | `src/money.js`, `src/app.js`, `test/app.test.js`                            | **`v2`** |
| 7   | `feat(db): add price_vnd backfill`                     | `scripts/backfill-price-vnd.js`                                             |          |
| 8   | `feat(v3): read price_vnd`                             | `src/`, `test/`                                                             | **`v3`** |
| 9   | `feat(v4): use price_vnd only`                         | `src/`, `test/`                                                             | **`v4`** |
| 10  | `feat(db): contract, drop price`                       | `migrations/003_*.up.sql` and `.down.sql`                                   |          |
| 11  | `docs: rehearsal summary`                              | `docs/rehearsal-summary.md`                                                 |          |
| 12  | per step in the official run: `docs(ledger): <step>`   | `docs/ledger.md` only                                                       |          |
| 13  | `docs: official run evidence`                          | `traffic-log.txt`, `check-log.txt`, `docs/ledger.md`                        |          |
| 14  | `docs: migration plan, AI log, self-assessment`        | `MIGRATION.md`, `AI-LOG.md`, `SELF_ASSESSMENT_REPORT.md`, `docs/explain.md` |          |

`AI-LOG.md` entries are committed together with the work they describe, except the final review in commit 14.

Commit 1 already exists. Create `v1` on `HEAD` **before** committing anything of yours. The scaffolding files the human copied in are still untracked at that moment, so the tag points at the pristine starter.

Why this order: the backfill script is added after `v2` and before `v3`, so it exists from `v3` on and is run from the `v3` worktree. `003` comes after `v4`, so every tag contains only `001` and `002` and passes `npm test` on its own migrations.

## 3. Tags

- Create with `git tag -a v2 -m "v2: dual write and priceVnd API"` on the exact commit from the table.
- Verify a tag with `git rev-parse v2^{commit}` (annotated tags need the `^{commit}`).
- Each tag must pass `npm test` on its own migrations: `v1` has `001`; `v2`..`v4` have `001`+`002`; `main` has `001`+`002`+`003`.
- Before G2 a tag may be moved with `git tag -f -a vN -m "..." <sha>`. After G2 never.
- Never create other tags (no `rehearsal-*`, no `step-*`): the grader expects `v1`..`v4`.

## 4. Worktrees

Create from tags, outside the repo directory:

```
git worktree add --detach ../ia2-v1 v1     # likewise v2, v3, v4
```

**Recreate at the start of every run** (rehearsal and official). Moving a tag does not move a worktree that was created from it, so an old worktree silently runs old code:

```
git worktree remove --force ../ia2-vN && git worktree add --detach ../ia2-vN vN
test "$(git -C ../ia2-vN rev-parse HEAD)" = "$(git rev-parse vN^{commit})"   # must hold, for every N
```

Never edit, commit or stash inside a worktree; they are read-only run directories.

Where each command runs. This matters because `npm run migrate` applies **every** pending migration file in the checkout it runs from:

| Command                                              | Run from    |
| ---------------------------------------------------- | ----------- |
| serve version N (`npm start`)                        | `../ia2-vN` |
| `migrate` for `001`, and `seed`                      | `../ia2-v1` |
| `migrate` for `002`                                  | `../ia2-v2` |
| backfill                                             | `../ia2-v3` |
| `migrate` for `003`                                  | `main`      |
| `npm run traffic`, `npm run check`, the orchestrator | `main`      |

Always pass `DB_PATH` as an absolute path when running from a worktree; `db.js` resolves it against the current directory.

## 5. Fixing a commit before the freeze

1. Commit the fix with `git commit --fixup=<sha of the commit it belongs to>`.
2. Fold it in without an editor: `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <parent of that commit>`.
3. **Conflicts are normal here**: later commits (v3, v4) usually touch the same files as the fixed one, so the rebase can stop several times. At each stop resolve the files, `git add <files>`, then `GIT_EDITOR=true git rebase --continue`; repeat until `git status` no longer says a rebase is in progress. If a resolution is not obvious, run `git rebase --abort` and ask the human. Never use `--skip`.
4. Only when the rebase is finished: every commit after the fixed one has a **new SHA**, and tags do not follow. Re-create **all** tags that sit on rewritten commits, finding each new SHA by its subject (`git log --format='%h %s'`), then `git tag -f -a vN -m "..." <new sha>`.
5. Verify the tags before going on: `git log -1 --format=%s vN^{commit}` shows the expected subject for each of v2, v3, v4; the three SHAs are different; and `git merge-base --is-ancestor v1 v2`, `v2 v3`, `v3 v4` all succeed. Retagging in the middle of a rebase puts two tags on the same commit.
6. Recreate all worktrees (section 4) and re-run `npm test` on every tag and on `main`.
7. Never push between steps 1 and 6.

## 6. Freeze (G2)

Run only when the human says "go official". Every line must pass:

- `git status --short` prints nothing.
- `git tag` lists exactly `v1 v2 v3 v4`, all annotated (`git cat-file -t vN` prints `tag`).
- `git rev-parse v1^{commit}` equals `git rev-parse upstream/main`.
- Worktrees recreated and verified; `npm test` passes in each of the four worktrees and on `main`.
- `git log --oneline` follows the sequence in section 2, and `git merge-base --is-ancestor` holds for v1→v2, v2→v3, v3→v4.

Then push (section 7) and record the four tag SHAs in the ledger. From here no tag moves and no history is rewritten.

## 7. Push

- Only after G2: `git push origin main` and `git push origin v1 v2 v3 v4`. Name the tags explicitly.
- Confirm first that `origin` is the human's fork (`git remote -v`). Never push to `upstream`.
- Later pushes (ledger, evidence, docs) are plain `git push origin main`. Never `--force`, `--force-with-lease`, or `--delete` on tags, except pushing tags moved while the human has reopened the freeze.
- If a tag reaches the remote before G2, or a push is rejected, stop and ask the human.

## 8. During the official run

`main` is frozen: do not edit `src/`, `scripts/`, `migrations/` or `test/`. Commit only `docs/ledger.md` (and `AI-LOG.md`), by name. The two log files are written while the run is in progress; commit them once, after S8.

## 9. Cleanup and before the zip

1. `git worktree remove ../ia2-v1` .. `../ia2-v4`, then `git worktree prune`. `git worktree list` must show only the main checkout, and `.git/worktrees` must be absent or empty; otherwise the zipped `.git` refers to directories that will not exist on the grader's machine.
2. `git status --short` is empty and `git log origin/main..main` is empty (everything pushed).
3. Do not commit `.ia2/`, `data/` or `*.db` (they are ignored; confirm with `git check-ignore -v .ia2/state.json data/app.db`, which must print a matching rule for both).

## Never

Force-push; rewrite history or move a tag after G2; create tags other than `v1`..`v4`; `git add -A`; commit inside a worktree; run `migrate` from a checkout that holds migrations later than the intended step; push before G2.
