---
name: security-review
description: Use before declaring significant work complete, or when asked to review a diff for security (e.g. via /secreview). Structured security self-review of a changeset.
---

# Security Review

Review the target diff (default: `git diff HEAD`) as a hostile reviewer. Do not
review from memory — read the actual diff and the surrounding code of anything
suspicious.

1. **Map the attack surface of the change.** What external input reaches this code
   (user input, HTTP, files, env, DB contents)? What does the code trust?
2. **Walk the checklist against every hunk:**
   - Injection: SQL/NoSQL built from strings, shell interpolation, eval/exec.
   - Path traversal: any file path influenced by external input.
   - SSRF: any outbound request with an externally influenced URL.
   - AuthN/AuthZ: endpoints or functions missing permission checks; IDs accepted
     without ownership verification (IDOR).
   - Secrets: credentials, tokens, or keys in code, logs, or error messages.
   - Data exposure: PII/secrets in logs, verbose errors leaking internals.
   - Unsafe deserialization: pickle, yaml.load, JSON.parse into trusted structures
     that get deep-merged.
   - Crypto misuse: hand-rolled hashing/comparison, `random` for secrets.
   - Dependency risk: new packages — are they necessary, well-known, pinned?
3. **Report findings by severity** (critical / high / medium / low), each with file,
   line, the concrete attack, and a concrete fix. If clean, state what you checked
   and what you'd still want a human to verify.
4. **Fix criticals and highs immediately** unless the user directs otherwise.
