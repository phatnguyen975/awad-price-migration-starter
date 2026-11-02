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
