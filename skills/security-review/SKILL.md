---
name: security-review
description: Use before declaring significant work complete, or when asked to review a diff for security (e.g. via /secreview). Structured security self-review of a changeset.
---

# Security Review

Review the target diff (default: `git diff HEAD`) like a hostile reviewer. Read
the actual patch and surrounding code; do not rely on memory.

1. **Map the attack surface.** What external input reaches this code (user input,
   HTTP, files, env, DB contents), and what does the code trust?
2. **Walk the checklist against every hunk:**
   - Injection: SQL/NoSQL built from strings, shell interpolation, eval/exec.
   - Path traversal: any file path influenced by external input.
   - SSRF: any outbound request with an externally influenced URL.
   - AuthN/AuthZ: missing permission checks, IDOR, or ownership gaps.
   - Secrets: credentials, tokens, or keys in code, logs, or error messages.
   - Data exposure: PII/secrets in logs or verbose errors.
   - Unsafe deserialization: `pickle`, `yaml.load`, or deep-merging untrusted JSON.
   - Crypto misuse: hand-rolled hashing/comparison, `random` for secrets.
   - Dependency risk: any new package — is it necessary, known, and pinned?
3. **Report findings by severity** (`critical` / `high` / `medium` / `low`) with
   file, line, the concrete attack, and a concrete fix. If clean, say what you
   checked and what a human should still verify.
4. **Fix criticals and highs immediately** unless the user says otherwise.
