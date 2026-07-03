---
name: git-hygiene
description: Use when committing, branching, or preparing changes for review. Commit granularity, message style, branch discipline, secret hygiene.
---

# Git Hygiene

- **Branches.** Anything non-trivial happens on a feature branch (`feat/…`, `fix/…`),
  never directly on main.
- **Commits.** One logical change per commit. The project must build and pass tests
  at every commit. Message format: imperative summary line under 72 chars
  (`feat: add rate limiter to login endpoint`), body only when the why isn't obvious.
- **Never commit:** secrets or credentials (the senpai secret gate blocks these),
  generated artifacts, dependencies, editor junk, commented-out code.
- **Before committing:** run the checks (`/check`), read your own staged diff
  (`git diff --cached`) top to bottom.
- **Force pushes** to shared branches are forbidden (the harness blocks main/master);
  use `--force-with-lease` on your own feature branches only.
