---
name: secure-coding
description: Use when writing code that handles external input, auth, files, subprocesses, SQL, HTTP, or new dependencies. Language-specific secure patterns for TypeScript/Node and Python.
---

# Secure Coding

## Universal
- Validate ALL external input at the boundary: type, length, range, format. Reject,
  don't sanitize-and-hope.
- Parameterized queries only. Never build SQL/NoSQL queries via string concatenation.
- Secrets come from the environment or a secret manager — never source code.
- Least privilege everywhere: file modes, DB users, API scopes, container users.
- Fail closed: on auth or validation errors, deny.
- Never log secrets, tokens, passwords, or full PII.
- Pin new dependencies to exact versions; prefer stdlib or well-maintained packages;
  check the package name for typosquatting before installing.

## TypeScript / Node
- Subprocesses: `execFile`/`spawn` with argument arrays. Never `exec` with
  interpolated strings.
- No `eval`, `new Function`, or dynamic `require` on any external data.
- Path handling: `path.resolve` then verify the result is inside the allowed root
  before reading/writing (blocks `../` traversal).
- Guard against prototype pollution: never deep-merge untrusted objects; block
  `__proto__`/`constructor` keys.
- HTTP clients: validate/allowlist URLs before fetching (SSRF); set timeouts.
- Use `crypto.timingSafeEqual` for comparing secrets/HMACs.

## Python
- Subprocesses: `subprocess.run([...])` with list args, `shell=False`.
- Never `eval`/`exec` on external data; never `pickle.loads` untrusted bytes;
  use `yaml.safe_load`, never `yaml.load`.
- Path handling: `Path.resolve()` then check `.is_relative_to(allowed_root)`.
- Use `secrets` module (not `random`) for tokens; `hmac.compare_digest` for comparisons.
- SQL: driver placeholders (`%s`/`?`) or an ORM — never f-strings.
