---
name: plan-first
description: Use before implementing any non-trivial change (new feature, multi-file change, architectural decision). Explore, plan, and get approval before writing code.
---

# Plan First

Use this before any non-trivial change: new feature, multi-file edit, or design
decision.

1. **Explore.** Read the touched files and tests. Reuse the repo’s existing
   patterns instead of inventing new ones.
2. **Plan.** Share a short plan: goal, files, approach, test strategy, and what
   you will explicitly leave unchanged.
3. **Get approval.** Wait for the user to accept or adjust the plan before you
   write implementation code.
4. **Execute in slices.** Make each slice shippable and testable before moving on.

Skip this workflow only for trivial edits like typos, a single obvious bug, or a
small config tweak.
