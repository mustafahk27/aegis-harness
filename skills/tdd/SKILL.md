---
name: tdd
description: Use when implementing any feature or bugfix. Red-green-refactor discipline; defines what adequate testing means for a change.
---

# Test-Driven Development

1. **Red.** Write a failing test that captures the desired behavior. Run it and
   confirm it fails for the right reason (missing behavior, not a typo).
2. **Green.** Write the minimal implementation that makes the test pass. Run it.
3. **Refactor.** Clean up while keeping tests green.

Rules:
- Bug fixes start with a test that reproduces the bug.
- Test behavior through public interfaces, not internals.
- Cover the unhappy paths: invalid input, empty input, boundary values, errors.
- A change is not done until the full suite passes. The Aegis Harness done gate will
  bounce you if you finish without a passing test run — run tests before concluding.
- If code is genuinely untestable (UI glue, wiring), say so explicitly instead of
  writing a vacuous test.
