---
name: plan-first
description: Use before implementing any non-trivial change (new feature, multi-file change, architectural decision). Explore, plan, and get approval before writing code.
---

# Plan First

1. **Explore.** Read the files the change touches and their tests. Identify existing
   patterns and utilities you should reuse. Do not propose code you haven't grounded
   in the actual codebase.
2. **Plan.** Present a short plan: goal, files to change, approach, test strategy,
   and anything you'll deliberately NOT do. Keep it under ~15 lines.
3. **Get approval.** Wait for the user to approve or adjust the plan before writing
   any implementation code.
4. **Execute in slices.** Implement in small increments, each leaving the project
   in a working, tested state.

Skip this workflow only for trivial fixes (typos, single obvious bug, config tweak).
