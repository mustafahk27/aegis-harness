import { execFileSync } from "node:child_process";

export interface SecretFinding {
  rule: string;
  line: number;
  snippet: string;
}

const RULES: Array<{ rule: string; pattern: RegExp }> = [
  // Finding 3: extend AWS rule to cover STS temporary keys (ASIA prefix) in addition to AKIA
  { rule: "aws-access-key", pattern: /\bA(?:KIA|SIA)[0-9A-Z]{16}\b/ },
  { rule: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY/ },
  { rule: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { rule: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  {
    rule: "hardcoded-credential",
    // Finding 2: extend separator to also match quoted keys (JSON/YAML form: "key": "value")
    pattern: /(?:"|')?(api[_-]?key|secret|token|password|passwd)(?:"|')?\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
];

const PLACEHOLDER = /(process\.env|os\.environ|getenv|<[^>]+>|\bexample\b|\bchangeme\b|\bplaceholder\b|x{4,}|\.\.\.)/i;

/** Scan text for secret patterns. Placeholder-looking matches are skipped. */
export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { rule, pattern } of RULES) {
      // Finding 1: test PLACEHOLDER against the matched secret value, not the whole line.
      // This prevents a real secret from escaping when the line also contains a placeholder
      // word (e.g. a process.env fallback or an "example usage" comment).
      const match = pattern.exec(line);
      if (!match) continue;
      const matchedValue = match[0];
      if (PLACEHOLDER.test(matchedValue)) continue;
      findings.push({ rule, line: i + 1, snippet: line.trim().slice(0, 120) });
      break; // one finding per line is enough to block
    }
  }
  return findings;
}

/** Scan only the added lines of the staged diff. Fails closed: git errors throw. */
export function scanStagedDiff(cwd: string): SecretFinding[] {
  const diff = execFileSync("git", ["diff", "--cached", "-U0"], { cwd, encoding: "utf8" });
  const added = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
  return scanForSecrets(added);
}
