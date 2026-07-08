# Aegis Harness Demo

This is the fastest way to understand why Aegis Harness exists and why a developer might prefer it over a generic coding agent.

## The story

Aegis Harness makes Pi feel like a disciplined engineering partner:

- it plans before changing code
- it stays test-first and debug-first
- it blocks risky commands and unsafe output
- it explains blocks clearly
- it supports repo-specific policy tuning
- it keeps working modes lightweight and focused

## 5-minute walkthrough

### 1) Start Pi in a project

Open any project where the harness is installed and start `pi`.

Then ask:

```text
/status
```

You should see:

- the active policy profile
- the current working mode
- whether gates are on or off
- whether optional scanning tools are available

### 2) Pick a working mode

Ask:

```text
/mode
```

Choose one of:

- `feature`
- `debug`
- `refactor`
- `review`

This changes the working guidance without changing the core harness behavior.

### 3) Trigger a safe block

Try something risky:

```text
sudo ls
```

The harness should block it and explain:

- what was blocked
- why it matters
- how to fix or narrow the action

### 4) Ask for the reason

After a block, ask:

```text
/why
```

For the deeper version:

```text
/explain
```

This is the “explainable safety” part of the harness.

### 5) Try a real change

Make a code change and finish without running tests.

The done-gate should nudge the agent back toward:

- running tests
- fixing failures
- adding coverage if needed

## What makes it different

Many coding agents can help write code. Aegis Harness is opinionated about **how** the agent should behave:

- plan-first for real changes
- debug first when something breaks
- refactor carefully
- review diffs with risk awareness
- keep prompts and blocks short enough to stay useful

That combination is what makes it feel like a senior engineer guardrail instead of a generic assistant.

## What to show in a screenshot

If you want to present the project publicly, the strongest screenshots are:

- `/status` showing the current mode and policy
- a blocked command with a clear reason
- `/why` and `/explain`
- `/mode` selection with the four modes

## Suggested demo script

Use this exact flow in a screencast or README snippet:

```text
/status
/mode
sudo ls
/why
/explain
```

That sequence shows the full value proposition in under a minute.

## 60-second transcript

Here is a compact transcript you can reuse in a demo or screenshot:

```text
You: /status
Pi: Policy, mode, gates, and config appear in one readable snapshot.

You: /mode
Pi: The mode picker appears with feature, debug, refactor, and review.

You: sudo ls
Pi: Blocked — why it was blocked and how to fix it are shown clearly.

You: /why
Pi: A short explanation of the last block.

You: /explain
Pi: A fuller explanation with the fix path.
```

It’s short, repeatable, and easy for a viewer to understand quickly.
