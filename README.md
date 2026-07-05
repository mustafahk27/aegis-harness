# Aegis Harness

Personal coding harness for [pi](https://pi.dev): makes the agent work like an
experienced engineer (plan-first, TDD, debugging, clean code, git hygiene) and hard-blocks unsafe output
(secrets, dangerous commands, commits that fail checks, untested completions).

## Install

    npm install            # dev toolchain for tests/typecheck
    ./install.sh           # copies into ~/.pi/agent/
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

- Engineering persona appended to the system prompt (plan-first, TDD, debugging, clean code, security rules)
- Skills: `plan-first`, `tdd`, `git-hygiene`, `secure-coding`, `security-review`
- Hard gates:
  - dangerous commands blocked (sudo, pipe-to-shell, rm -rf outside project,
    force-push to main, chmod 777) — cannot be disabled
  - secret scanning on every write/edit and on staged diffs (fail-closed)
  - `git commit` runs the project's lint + tests + gitleaks + semgrep first
  - done gate: agent can't conclude a code change without a passing test run

## Policy file

Drop an `aegis-harness.config.json` file in a target repo to tune the harness
without editing code. A good workflow is:

1. Copy `aegis-harness.config.example.json` into the target repo.
2. Rename it to `aegis-harness.config.json`.
3. Adjust only the knobs your team wants to change.

Supported config shape:
- `profile`: choose a preset baseline for the repo (`balanced`, `strict`, or `light`).
- `displayName` / `uiKey`: rename the harness in UI messages and status text.
- `dangerousCommands`: enable/disable individual command gates and protected branches.
- `secrets.rules` / `secrets.placeholderPatterns`: add or relax secret detectors.
- `checks.timeoutMs` / `checks.extraChecks`: tune check runtime and add repo-specific checks.
- `tests.*`: change how the harness recognizes test commands for the repo.

Profiles are applied first, then your repo config overrides them. That keeps the
baseline easy to understand while still letting teams tune only the pieces they need.

The bundled example file is intentionally close to the defaults, so teams can
start from a known-safe baseline and only override what they need.

Commands:
- `/check` runs the full check suite.
- `/secreview` reviews the current uncommitted diff.
- `/gates on|off|status` toggles commit/secret/done gates for the session.
- `/status` shows the active policy, config source, and missing optional tools.
- `/why` gives a short preview of the last block.
- `/explain` gives the full block reason and fix.

## Development

    npm install            # install dev dependencies
    npx vitest run         # full unit suite (91+ tests)
    npx tsc --noEmit       # typecheck

    # shortcuts defined in package.json
    npm test               # vitest unit suite
    npm run typecheck

Edit `extension/lib/policy.ts` first; `extension/lib/policy.js` is the synced runtime copy used by Pi installs.
Then rerun `npm run sync:policy`, `npm test`, `npm run typecheck`, and `./install.sh`, followed by `/reload` inside pi.
