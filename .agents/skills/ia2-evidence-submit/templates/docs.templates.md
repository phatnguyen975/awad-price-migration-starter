# docs/inventory.md

```markdown
# Inventory

Checked on <date>, starter commit <sha>, Node <version>, OS <name>.

## Machine

| Check   | Result              |
| ------- | ------------------- |
| <check> | <what you observed> |

## Repository state

<remotes, whether HEAD equals upstream/main, uncommitted files, tags, npm test result>

## Facts confirmed

| Area                                    | Fact   | Where seen             |
| --------------------------------------- | ------ | ---------------------- |
| <schema / app / tests / scripts / repo> | <fact> | <file:line or command> |

## Write paths and read paths of price

- Writers of menu_items: <statement, endpoint, file:line>
- Readers of price: <statement or code path, endpoint, file:line>

## Differences from the expected list

<each difference and why it matters, or "none">
```

# docs/rehearsal-summary.md

```markdown
# Rehearsal Summary

## Result

<PASS or FAIL, date, tags used (sha)>

## Steps

| Step   | Result      | Key log lines             | Time      |
| ------ | ----------- | ------------------------- | --------- |
| <step> | <PASS/FAIL> | <the lines that prove it> | <seconds> |

## Numbers to expect in the official run

<requests ok, down/back lines, backup time, restore time>

## Problems found and fixed

- <problem> → <cause> → <fix and commit>
```

# docs/explain.md

```markdown
# Explain

## <criterion name>

**Q:** <a question a reviewer could ask>
**A:** <short answer in plain words, citing the file or log line>
```
