import { execFileSync } from "node:child_process";
import { defaultPolicy, type AegisPolicy } from "./policy.js";

export interface SecretFinding {
  rule: string;
  line: number;
  snippet: string;
}

const RULES: Array<{ rule: string; pattern: RegExp; suggestion: string }> = [
  { rule: "aws-access-key", pattern: /\bA(?:KIA|SIA)[0-9A-Z]{16}\b/, suggestion: "move the key to an environment variable or secret manager." },
  { rule: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY/, suggestion: "store the key outside the repo and load it at runtime." },
  { rule: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, suggestion: "use a GitHub App, env var, or secret store instead." },
  { rule: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, suggestion: "store the Slack token outside source control." },
  { rule: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/, suggestion: "read the key from the environment or secret store." },
  {
    rule: "hardcoded-credential",
    pattern: /(?:"|')?(api[_-]?key|secret|token|password|passwd)(?:"|')?\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
    suggestion: "replace the literal with an environment variable lookup.",
  },
];

const PLACEHOLDER_PATTERNS = [
  "process\\.env",
  "os\\.environ",
  "getenv",
  "<[^>]+>",
  "\\bexample\\b",
  "\\bchangeme\\b",
  "\\bplaceholder\\b",
  "x{4,}",
  "\\.\\.\\.",
];
const PLACEHOLDER = new RegExp(PLACEHOLDER_PATTERNS.join("|"), "i");

/** Scan text for secret patterns. Placeholder-looking matches are skipped. */
function rulesForPolicy(policy: AegisPolicy): Array<{ rule: string; pattern: RegExp; suggestion: string }> {
  const configuredRules = policy.secrets.rules
    .map((rule) => {
      try {
        return {
          rule: rule.rule,
          pattern: new RegExp(rule.pattern, rule.flags),
          suggestion: rule.suggestion ?? "move the secret to environment variables or a secret manager.",
        };
      } catch {
        return null;
      }
    })
    .filter((rule): rule is { rule: string; pattern: RegExp; suggestion: string } => rule !== null);

  const merged = [...RULES, ...configuredRules];
  const seen = new Set<string>();
  return merged.filter((rule) => {
    const key = `${rule.rule}:${rule.pattern.source}:${rule.pattern.flags}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placeholderForPolicy(policy: AegisPolicy): RegExp {
  return new RegExp([...PLACEHOLDER_PATTERNS, ...policy.secrets.placeholderPatterns].join("|"), "i");
}

export function scanForSecrets(text: string, policy: AegisPolicy = defaultPolicy()): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  const rules = rulesForPolicy(policy);
  const placeholderPattern = placeholderForPolicy(policy);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { rule, pattern, suggestion } of rules) {
      const match = pattern.exec(line);
      if (!match) continue;
      const matchedValue = match[0];
      if (PLACEHOLDER.test(matchedValue) || placeholderPattern.test(matchedValue)) continue;
      findings.push({ rule, line: i + 1, snippet: `${line.trim().slice(0, 96)}${suggestion ? ` | fix: ${suggestion}` : ""}` });
      break; // one finding per line is enough to block
    }
  }
  return findings;
}

/** Scan only the added lines of the staged diff. Fails closed: git errors throw. */
export function scanStagedDiff(cwd: string, policy: AegisPolicy = defaultPolicy()): SecretFinding[] {
  const diff = execFileSync("git", ["diff", "--cached", "-U0"], { cwd, encoding: "utf8" });
  const added = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
  return scanForSecrets(added, policy);
}
