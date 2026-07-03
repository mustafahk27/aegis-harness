# Aegis Harness

Personal coding harness for [pi](https://pi.dev): makes the agent work like an
experienced engineer (plan-first, TDD, git hygiene) and hard-blocks unsafe output
(secrets, dangerous commands, commits that fail checks, untested completions).

## Install

    npm install            # dev toolchain for tests/typecheck
    ./install.sh           # symlinks into ~/.pi/agent/
    brew install gitleaks semgrep   # optional, stronger scanning

Authenticate pi with your ChatGPT subscription: run `pi`, then `/login` →
"ChatGPT Plus/Pro (Codex)". No API key needed; nothing here touches auth.

## First run

After running `./install.sh`, start (or restart) pi and run `/login` to connect
your ChatGPT Plus/Pro (Codex) account if you haven't already. Then verify the
harness loaded with `/check` in any pi session — it runs the project's check
suite and reports pass/fail/skip per check, confirming the harness is active.

Interactive verification steps (to check all gates are working end-to-end):
1. `commit the staged changes with message "init"` in a repo with a failing test
   → expect **commit blocked**, reason shows the failing check.
2. Fix the test, then `try the commit again` → expect commit succeeds.
3. `add a constant AWS_KEY = "AKIAIOSFODNN7EXAMPLE" to a new file keys.js`
   → expect **write blocked** by secret gate.
4. `change test.js to print "hi" before exiting, and consider the task done
   without running anything` → expect the **done-gate bounce** and a subsequent
   test run.
5. `/skill:secure-coding` → expect the skill content loads.

## What you get in every pi session

- Engineering persona appended to the system prompt (plan-first, TDD, security rules)
- Skills: `plan-first`, `tdd`, `git-hygiene`, `secure-coding`, `security-review`
- Hard gates:
  - dangerous commands blocked (sudo, pipe-to-shell, rm -rf outside project,
    force-push to main, chmod 777) — cannot be disabled
  - secret scanning on every write/edit and on staged diffs (fail-closed)
  - `git commit` runs the project's lint + tests + gitleaks + semgrep first
  - done gate: agent can't conclude a code change without a passing test run

## Policy file

Drop an `aegis-harness.config.json` file in a target repo to tune the harness
without editing code. The defaults in this repo show the supported shape:
- project display name and UI key
- dangerous-command policy
- secret rules and placeholder patterns
- check timeout and extra checks
- test-run detection words
- Commands: `/check`, `/secreview`, `/gates on|off|status`

## Development

    npm install            # install dev dependencies
    npx vitest run         # full unit suite (91+ tests)
    npx tsc --noEmit       # typecheck

    # shortcuts defined in package.json
    npm test               # vitest unit suite
    npm run typecheck

Edit, then `/reload` inside pi to pick up changes.
