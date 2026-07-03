# pi-harness — Design Spec

Date: 2026-07-03
Status: Approved design, pending implementation plan

## Goal

A personal coding harness built **on top of stock pi** (https://pi.dev) that makes the
agent code like an experienced software engineer and enforces safe/secure output —
without forking pi and without changing how pi is billed or authenticated.

## Non-goals / constraints

- **No fork.** pi is installed from npm and updated normally. This repo is pure
  configuration (extensions, skills, prompt templates) that pi auto-loads from
  `~/.pi/agent/`.
- **Subscription auth only.** Models come from the user's ChatGPT Plus/Pro
  subscription via pi's `/login` → "ChatGPT Plus/Pro (Codex)" OAuth flow. The harness
  never requires `OPENAI_API_KEY` and never consumes API credits.
- **No guarantee of zero vulnerabilities.** The harness layers prompt discipline,
  mandatory self-review, and automated scanning so problems are caught in multiple
  passes — the same defense-in-depth posture a good engineering team takes.

## Architecture overview

```
pi-harness/                      (this repo, versioned)
├── install.sh                   symlinks the dirs below into ~/.pi/agent/
├── extensions/
│   ├── persona.ts               system-prompt injection (before_agent_start)
│   ├── gates.ts                 hard gates (tool_call blocking, turn_end)
│   └── lib/
│       ├── stack.ts             per-project stack detection
│       ├── secrets.ts           secret-pattern scanning (+ gitleaks wrapper)
│       └── checks.ts            lint/test/scan runners
├── skills/
│   ├── plan-first/
│   ├── tdd/
│   ├── git-hygiene/
│   ├── secure-coding/
│   └── security-review/
├── prompts/                     reusable prompt templates
└── test/                        vitest unit tests + fixture-repo smoke test
```

pi loads extensions from `~/.pi/agent/extensions/` (global) — install.sh symlinks
this repo's `extensions/`, `skills/`, and `prompts/` there. Editing the repo +
`/reload` in pi makes changes live.

## Components

### 1. Persona extension (`persona.ts`)

Uses `before_agent_start` to append an engineering-discipline section to the system
prompt:

- **Plan-first:** for non-trivial tasks, explore the codebase, present a short plan,
  and get user approval before writing code.
- **TDD:** write or extend tests alongside implementation; never claim completion
  with failing tests.
- **Git hygiene:** small focused commits, meaningful messages, feature branches,
  never commit secrets or generated junk.
- **Secure-by-default coding rules:** validate all external input, parameterized
  queries only, no secrets in source, least privilege, pin and scrutinize new
  dependencies, no hand-rolled crypto, safe file/path handling, no `eval`/dynamic
  code execution on user input.

### 2. Skills (markdown, loaded on demand by pi's skill mechanism)

- `plan-first` — the explore → plan → approval workflow in detail.
- `tdd` — red/green/refactor loop, what counts as adequate coverage for a change.
- `git-hygiene` — branching, commit granularity, message style, secret hygiene.
- `secure-coding` — generic checklist plus deep sections for **TypeScript/Node**
  (prototype pollution, injection, path traversal, SSRF, unsafe deserialization,
  `child_process` misuse) and **Python** (`eval`/`exec`/`pickle`, subprocess/shell
  injection, YAML load, path handling).
- `security-review` — a structured self-review the agent performs on its own diff
  before declaring work complete (threat-model the change, walk the checklist,
  report findings).

### 3. Gates extension (`gates.ts`) — hard enforcement

Implemented with pi's `tool_call` blocking hook (`return { block: true, reason }`).

- **Dangerous-command gate:** blocks `rm -rf` targeting paths outside the project,
  `curl … | sh`-style pipe-to-shell, `sudo`, and force-push to main/master.
- **Secret gate:** scans file writes and `git commit`/`git add` staged content for
  credential patterns. Uses **gitleaks** when installed; falls back to built-in
  regexes (AWS keys, private key blocks, generic `api_key=`/`token=` patterns) with
  a visible warning. Fails **closed**.
- **Commit gate:** intercepts `git commit`, runs the stack-detected check suite
  first (lint + tests + secret scan + semgrep if installed). Blocks the commit with
  the failing output as the reason.
- **Done gate:** tracks test executions during the session (via observed tool
  calls). On `turn_end`, if code files changed but no passing test run occurred,
  injects a bounce-back message instead of letting the agent conclude.

### 4. Stack detection (`lib/stack.ts`)

Runs per project (cached per session):

- `package.json` → detect package manager (lockfile), lint/test scripts, eslint,
  vitest/jest.
- `pyproject.toml` / `requirements*.txt` → ruff, pytest, pip-audit, bandit.
- Anything else → generic safety net only (secret scan + `semgrep --config auto`
  when available).

TS/Node and Python get first-class treatment; the harness still functions (with the
generic net) in any repo.

### 5. Slash commands

- `/check` — run the full check suite manually.
- `/secreview` — run the security-review skill against the current diff on demand.
- `/gates on|off|status` — escape hatch when a gate misfires; state changes are
  announced loudly in the session and reset to **on** at session start.

## Error handling

- Secret and dangerous-command gates **fail closed** (block on scanner error).
- Missing optional tools (gitleaks, semgrep) degrade to built-in fallbacks with a
  visible warning at session start — never a silent pass.
- Check-suite runs have timeouts; a timed-out check blocks the commit gate and
  reports which check hung.
- Gate blocks always include an actionable reason so the agent can fix and retry.

## Testing

- **Unit tests (vitest):** detection and scanning logic is written as pure functions
  (command classification, secret regexes, stack detection from fixture file trees)
  and tested directly.
- **Smoke test:** a script launches pi in a fixture repo and asserts that a planted
  secret write is blocked and a `git commit` with failing tests is blocked.

## Recommended companion tools (installed separately, optional)

`gitleaks`, `semgrep` via Homebrew. The harness detects their presence; nothing
breaks without them.
