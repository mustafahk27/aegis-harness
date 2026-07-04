---
name: tdd
description: Use when implementing any feature or bugfix. Red-green-refactor discipline; defines what adequate testing means for a change.
---

# Test-Driven Development

1. **Red.** Write a failing test that captures the desired behavior. Confirm the
   failure is for missing behavior, not for a typo or broken setup.
2. **Green.** Write the smallest implementation that makes the test pass.
3. **Refactor.** Clean up while keeping the suite green.

Rules:
- Bug fixes start with a test that reproduces the bug.
- Test behavior through public interfaces, not internals.
- Cover unhappy paths: invalid input, empty input, boundary values, and errors.
- A change is not done until the full suite passes. Run tests before concluding.
- If code is genuinely untestable (UI glue, wiring), say so explicitly instead of
  writing a vacuous test.
