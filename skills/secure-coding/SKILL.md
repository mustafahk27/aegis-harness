---
name: secure-coding
description: Use when writing code that handles external input, auth, files, subprocesses, SQL, HTTP, or new dependencies. Language-specific secure patterns for TypeScript/Node and Python.
---

# Secure Coding

## Universal
- Validate external input at the boundary: type, length, range, format. Reject
  invalid data instead of trying to clean it up later.
- Use parameterized queries only. Never build SQL/NoSQL queries with string concatenation.
- Keep secrets out of source code; load them from the environment or a secret manager.
- Apply least privilege everywhere: file modes, DB users, API scopes, container users.
- Fail closed on auth or validation errors.
- Never log secrets, tokens, passwords, or full PII.
- Pin new dependencies to exact versions; prefer stdlib or well-maintained packages;
  check package names for typosquatting before installing.

## TypeScript / Node
- Use `execFile`/`spawn` with argument arrays. Never `exec` with interpolated strings.
- Avoid `eval`, `new Function`, and dynamic `require` on external data.
- Resolve paths and verify the result stays inside the allowed root before reading
  or writing.
- Guard against prototype pollution: never deep-merge untrusted objects; block
  `__proto__` and `constructor` keys.
- Validate or allowlist URLs before fetching, and set timeouts.
- Use `crypto.timingSafeEqual` for comparing secrets and HMACs.

## Python
- Subprocesses: `subprocess.run([...])` with list args, `shell=False`.
- Never `eval`/`exec` on external data; never `pickle.loads` untrusted bytes;
  use `yaml.safe_load`, never `yaml.load`.
- Path handling: `Path.resolve()` then check `.is_relative_to(allowed_root)`.
- Use `secrets` module (not `random`) for tokens; `hmac.compare_digest` for comparisons.
- SQL: driver placeholders (`%s`/`?`) or an ORM — never f-strings.
