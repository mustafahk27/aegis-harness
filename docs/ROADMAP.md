# Aegis Harness Roadmap

This roadmap keeps Aegis Harness focused on one goal: becoming the most useful,
trusted, and shareable coding harness for developers who use Pi.

## North Star

Make Pi behave like a disciplined senior engineer:

- plans before non-trivial changes
- debug-first when things break
- refactor without accidental behavior drift
- review with clear risks and fixes
- stay token-light, explainable, and repo-aware

## P0 — Adoption and clarity

These are the highest-value changes for open-source adoption:

1. **One-page product story**
   - clear README
   - crisp “what this is / why it exists”
   - quickstart and demo flow

2. **Concise, obvious UX**
   - short status text
   - discoverable `/mode`, `/why`, `/explain`, `/status`
   - readable block reasons with next-step fixes

3. **Token-efficient prompts**
   - keep the base persona tight
   - load only mode-specific add-ons
   - avoid repeating the same guidance every turn

## P1 — Trust and depth

These make the harness feel serious and reliable:

- stronger integration tests around real Pi sessions and command flows
- safer defaults for policy loading and config overrides
- more precise secret / dangerous-command explanations
- better handling of “why was this blocked?” questions
- mode-aware behavior that stays small but meaningful

## P2 — Polish and differentiation

These help the project stand out:

- screenshots or terminal transcripts in docs
- sample repos or demo sessions
- CI badges and release notes
- a short architecture diagram
- a “why this is different from a generic agent” doc

## Branch strategy

Use one branch per meaningful change:

- `feat/<area>` for new capability
- `fix/<area>` for bug fixes
- `docs/<area>` for docs-only work
- `test/<area>` for coverage improvements

Keep commits small and grouped by the behavior they change.

## What “better” means

We are winning if a developer can say:

- “This agent feels disciplined.”
- “I understand what it blocked and why.”
- “I can tune it for my repo without touching code.”
- “It saves me time instead of adding noise.”
- “I’d recommend this to another engineer.”
