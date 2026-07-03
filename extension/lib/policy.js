import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_POLICY = {
  displayName: "Aegis Harness",
  uiKey: "aegis-harness",
  gatesEnabledByDefault: true,
  dangerousCommands: {
    blockSudo: true,
    blockRecursiveRmOutsideProject: true,
    blockPipeToShell: true,
    blockedBranches: ["main", "master"],
    blockChmod777: true,
  },
  secrets: {
    rules: [
      { rule: "aws-access-key", pattern: "\\bA(?:KIA|SIA)[0-9A-Z]{16}\\b" },
      { rule: "private-key", pattern: "-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY" },
      { rule: "github-token", pattern: "\\bgh[pousr]_[A-Za-z0-9]{36,}\\b" },
      { rule: "slack-token", pattern: "\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b" },
      { rule: "openai-key", pattern: "\\bsk-[A-Za-z0-9_-]{32,}\\b" },
      {
        rule: "hardcoded-credential",
        pattern: "(?:\"|')?(api[_-]?key|secret|token|password|passwd)(?:\"|')?\\s*[:=]\\s*['\"][^'\"\\s]{12,}['\"]",
        flags: "i",
      },
    ],
    placeholderPatterns: [
      "process\\.env",
      "os\\.environ",
      "getenv",
      "<[^>]+>",
      "\\bexample\\b",
      "\\bchangeme\\b",
      "\\bplaceholder\\b",
      "x{4,}",
      "\\.\\.\\.",
    ],
  },
  checks: {
    timeoutMs: 300_000,
    includeGitleaks: true,
    includeSemgrep: true,
    extraChecks: [],
  },
  tests: {
    packageManagers: ["npm", "pnpm", "yarn", "bun"],
    directRunners: ["vitest", "jest"],
    pythonModuleRunners: ["pytest"],
  },
};

const CONFIG_FILENAMES = ["aegis-harness.config.json", ".aegis-harness.json"];

function fileState(cwd, filename) {
  const file = join(cwd, filename);
  if (!existsSync(file)) return `${filename}:missing`;
  const stat = statSync(file);
  return `${filename}:${stat.mtimeMs}:${stat.size}`;
}

function mergePolicy(raw) {
  return {
    ...DEFAULT_POLICY,
    ...raw,
    dangerousCommands: { ...DEFAULT_POLICY.dangerousCommands, ...(raw?.dangerousCommands ?? {}) },
    secrets: {
      ...DEFAULT_POLICY.secrets,
      ...(raw?.secrets ?? {}),
      rules: raw?.secrets?.rules ?? DEFAULT_POLICY.secrets.rules,
      placeholderPatterns: raw?.secrets?.placeholderPatterns ?? DEFAULT_POLICY.secrets.placeholderPatterns,
    },
    checks: {
      ...DEFAULT_POLICY.checks,
      ...(raw?.checks ?? {}),
      extraChecks: raw?.checks?.extraChecks ?? DEFAULT_POLICY.checks.extraChecks,
    },
    tests: { ...DEFAULT_POLICY.tests, ...(raw?.tests ?? {}) },
  };
}

export function defaultPolicy() {
  return DEFAULT_POLICY;
}

export function loadPolicy(cwd) {
  const sourcePath = CONFIG_FILENAMES.map((filename) => join(cwd, filename)).find((file) => existsSync(file)) ?? null;
  if (!sourcePath) {
    return { policy: DEFAULT_POLICY, sourcePath: null, warnings: [] };
  }

  try {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
    const policy = mergePolicy(raw);
    const warnings = [];
    if (policy.secrets.rules.some((rule) => {
      try {
        // eslint-disable-next-line no-new
        new RegExp(rule.pattern, rule.flags);
        return false;
      } catch {
        warnings.push(`invalid regex pattern in policy for '${rule.rule}'`);
        return true;
      }
    })) {
      policy.secrets.rules = policy.secrets.rules.filter((rule) => {
        try {
          // eslint-disable-next-line no-new
          new RegExp(rule.pattern, rule.flags);
          return true;
        } catch {
          return false;
        }
      });
    }
    policy.secrets.placeholderPatterns = policy.secrets.placeholderPatterns.filter((pattern) => {
      try {
        // eslint-disable-next-line no-new
        new RegExp(pattern, "i");
        return true;
      } catch {
        warnings.push(`invalid placeholder pattern in policy: ${pattern}`);
        return false;
      }
    });
    return { policy, sourcePath, warnings };
  } catch (error) {
    return {
      policy: DEFAULT_POLICY,
      sourcePath,
      warnings: [`failed to parse policy file ${sourcePath}: ${String(error)}`],
    };
  }
}
