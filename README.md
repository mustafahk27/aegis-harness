# Aegis Harness

[![CI](https://github.com/mustafahk27/aegis-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/mustafahk27/aegis-harness/actions/workflows/ci.yml)

Aegis Harness is my personalized coding harness for [pi](https://pi.dev). It shapes Pi to behave more like an experienced software engineer: it plans before changing code, prefers tests and debugging over guesswork, keeps diffs clean, and refuses risky or out-of-scope actions.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the prioritized path to make this project more useful, trustworthy, and shareable.
For a quick public-facing walkthrough, see [`docs/DEMO.md`](docs/DEMO.md).

## What it does

- Adds a project-specific engineering persona to each Pi session
- Encourages plan-first work for non-trivial tasks
- Pushes TDD, debugging, and clean-code habits
- Blocks risky commands, secret-like values, and untested completion flows
- Adds working modes for `/mode feature`, `/mode debug`, `/mode refactor`, and `/mode review` — or just `/mode` to open a picker
- Surfaces clearer block reasons plus `/why` and `/explain`
- Adds lightweight checks like `/check`, `/secreview`, `/gates`, and `/status`
- Supports per-repo policy tuning without editing the extension itself

## How to use it

1. Install dependencies: `npm install`
2. Run the installer: `./install.sh`
3. Optional stronger scanning: `brew install gitleaks semgrep`
4. Start `pi`, log in if needed, then reload the session with `/reload` or restart Pi

## Quick checks

Try these in a target project to see the harness working:

- Run `/check`
- Ask for `/status`
- Try `sudo ls`
- Try writing a fake AWS key
- Make a code change and finish without tests
- Trigger a block, then ask `/why` or `/explain`
- Switch modes with `/mode debug`, `/mode refactor`, or `/mode review`
- Type `/mode` with no argument to choose from a picker

## Policy config

You can tune behavior per repo with `aegis-harness.config.json`.

Supported knobs include:

- `profile`: `balanced`, `strict`, or `light`
- `displayName` / `uiKey`
- `dangerousCommands`
- `secrets.rules` / `secrets.placeholderPatterns`
- `checks.timeoutMs` / `checks.extraChecks`
- `tests.*`

Profiles apply first, then repo-specific config overrides them.

## Development

- `npm test`
- `npm run typecheck`
- `npm run sync:policy`
- `./install.sh` then `/reload` in Pi

Edit `extension/lib/policy.ts` first; `extension/lib/policy.js` is the synced runtime copy used by Pi installs.
