---
name: git-hygiene
description: Use when committing, branching, or preparing changes for review. Commit granularity, message style, branch discipline, secret hygiene.
---

# Git Hygiene

- **Use branches.** Anything non-trivial happens on a feature branch (`feat/…`, `fix/…`),
  never directly on `main`.
- **Keep commits small.** One logical change per commit, and every commit should
  leave the project passing tests.
- **Write clear messages.** Use an imperative summary line under 72 chars
  (`feat: add rate limiter to login endpoint`); add a body only when the reason
  is not obvious from the diff.
- **Never commit:** secrets, generated artifacts, vendored dependencies, editor junk,
  or commented-out code.
- **Before committing:** run `/check` and read `git diff --cached` end to end.
- **Force pushes** to shared branches are forbidden; use `--force-with-lease`
  only on your own feature branches.
