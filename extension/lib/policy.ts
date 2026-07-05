import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CheckCommand } from "./stack.js";

export interface SecretRuleConfig {
  rule: string;
  pattern: string;
  flags?: string;
  suggestion?: string;
}

export interface AegisPolicy {
  profile: PolicyProfileName;
  displayName: string;
  uiKey: string;
  gatesEnabledByDefault: boolean;
  dangerousCommands: {
    blockSudo: boolean;
    blockRecursiveRmOutsideProject: boolean;
    blockPipeToShell: boolean;
    blockedBranches: string[];
    blockChmod777: boolean;
  };
  secrets: {
    rules: SecretRuleConfig[];
    placeholderPatterns: string[];
  };
  checks: {
    timeoutMs: number;
    includeGitleaks: boolean;
    includeSemgrep: boolean;
    extraChecks: CheckCommand[];
  };
  tests: {
    packageManagers: string[];
    directRunners: string[];
    pythonModuleRunners: string[];
  };
}

export type PolicyProfileName = "balanced" | "strict" | "light";

export interface PolicyConfigOverrides {
  profile?: PolicyProfileName;
  displayName?: string;
  uiKey?: string;
  gatesEnabledByDefault?: boolean;
  dangerousCommands?: Partial<AegisPolicy["dangerousCommands"]>;
  secrets?: {
    rules?: SecretRuleConfig[];
    placeholderPatterns?: string[];
  };
  checks?: Partial<AegisPolicy["checks"]>;
  tests?: Partial<AegisPolicy["tests"]>;
}

export interface LoadedPolicy {
  policy: AegisPolicy;
  sourcePath: string | null;
  warnings: string[];
}

const CONFIG_FILENAMES = ["aegis-harness.config.json", ".aegis-harness.json"];

const POLICY_PROFILES: Record<PolicyProfileName, PolicyConfigOverrides> = {
  balanced: {},
  strict: {
    gatesEnabledByDefault: true,
    checks: {
      includeGitleaks: true,
      includeSemgrep: true,
      timeoutMs: 300_000,
    },
  },
  light: {
    gatesEnabledByDefault: false,
    checks: {
      includeGitleaks: true,
      includeSemgrep: false,
      timeoutMs: 180_000,
    },
  },
};

const DEFAULT_POLICY: AegisPolicy = {
  profile: "balanced",
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

const policyCache = new Map<string, LoadedPolicy>();

function fileState(cwd: string, filename: string): string {
  const file = join(cwd, filename);
  if (!existsSync(file)) return `${filename}:missing`;
  const stat = statSync(file);
  return `${filename}:${stat.mtimeMs}:${stat.size}`;
}

function fingerprint(cwd: string): string {
  return CONFIG_FILENAMES.map((filename) => fileState(cwd, filename)).join("|");
}

function mergePolicy(base: AegisPolicy, override: PolicyConfigOverrides): AegisPolicy {
  return {
    ...base,
    ...override,
    dangerousCommands: { ...base.dangerousCommands, ...(override.dangerousCommands ?? {}) },
    secrets: {
      ...base.secrets,
      ...(override.secrets ?? {}),
      rules: override.secrets?.rules ?? base.secrets.rules,
      placeholderPatterns: override.secrets?.placeholderPatterns ?? base.secrets.placeholderPatterns,
    },
    checks: {
      ...base.checks,
      ...(override.checks ?? {}),
      extraChecks: override.checks?.extraChecks ?? base.checks.extraChecks,
    },
    tests: { ...base.tests, ...(override.tests ?? {}) },
  };
}

function normalizePolicy(cwd: string, raw: PolicyConfigOverrides): LoadedPolicy {
  const warnings: string[] = [];
  const sourcePath = CONFIG_FILENAMES.map((filename) => join(cwd, filename)).find((file) => existsSync(file)) ?? null;

  const requestedProfile = raw.profile ?? DEFAULT_POLICY.profile;
  const resolvedProfile =
    requestedProfile in POLICY_PROFILES ? (requestedProfile as PolicyProfileName) : DEFAULT_POLICY.profile;
  if (requestedProfile !== resolvedProfile) {
    warnings.push(`unknown policy profile '${String(requestedProfile)}'; using '${DEFAULT_POLICY.profile}' instead`);
  }

  const merged = mergePolicy(mergePolicy(DEFAULT_POLICY, POLICY_PROFILES[resolvedProfile]), raw);
  merged.profile = resolvedProfile;

  const validRules = merged.secrets.rules.filter((rule) => {
    try {
      new RegExp(rule.pattern, rule.flags);
      return true;
    } catch (error) {
      warnings.push(`invalid regex pattern in policy for '${rule.rule}': ${String(error)}`);
      return false;
    }
  });
  merged.secrets.rules = validRules;

  const validPlaceholders = merged.secrets.placeholderPatterns.filter((pattern) => {
    try {
      new RegExp(pattern, "i");
      return true;
    } catch (error) {
      warnings.push(`invalid placeholder pattern in policy: ${pattern} (${String(error)})`);
      return false;
    }
  });
  merged.secrets.placeholderPatterns = validPlaceholders;
  return { policy: merged, sourcePath, warnings };
}

export function loadPolicy(cwd: string): LoadedPolicy {
  const key = fingerprint(cwd);
  const cached = policyCache.get(key);
  if (cached) return cached;

  const file = CONFIG_FILENAMES.map((filename) => join(cwd, filename)).find((candidate) => existsSync(candidate));
  if (!file) {
    const loaded = { policy: DEFAULT_POLICY, sourcePath: null, warnings: [] };
    policyCache.set(key, loaded);
    return loaded;
  }

  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as PolicyConfigOverrides;
    const loaded = normalizePolicy(cwd, raw);
    policyCache.set(key, loaded);
    return loaded;
  } catch (error) {
    const loaded = {
      policy: DEFAULT_POLICY,
      sourcePath: file,
      warnings: [`failed to parse policy file ${file}: ${String(error)}`],
    };
    policyCache.set(key, loaded);
    return loaded;
  }
}

export function defaultPolicy(): AegisPolicy {
  return DEFAULT_POLICY;
}
