import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { defaultPolicy, type AegisPolicy } from "./policy.js";

export interface CheckCommand {
  name: string;
  argv: string[];
  /** Skip with a warning (instead of failing) when the binary is not installed. */
  optional?: boolean;
  /** Exit codes treated as success. Default [0]. */
  okExitCodes?: number[];
}

export interface Stack {
  kind: "node" | "python" | "generic";
  checks: CheckCommand[];
}

const NPM_PLACEHOLDER = /echo .Error: no test specified/;

function packageManager(cwd: string): string {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

const SECURITY_CHECKS: CheckCommand[] = [
  { name: "gitleaks", argv: ["gitleaks", "protect", "--staged", "--no-banner"], optional: true },
  { name: "semgrep", argv: ["semgrep", "scan", "--config", "auto", "--error", "--quiet"], optional: true },
];

const STACK_CACHE = new Map<string, Stack>();

function fileStamp(cwd: string, filename: string): string {
  const path = join(cwd, filename);
  if (!existsSync(path)) return `${filename}:missing`;
  const stats = statSync(path);
  return `${filename}:${stats.mtimeMs}:${stats.size}`;
}

function cacheKey(cwd: string, policy: AegisPolicy): string {
  return [
    fileStamp(cwd, "package.json"),
    fileStamp(cwd, "pnpm-lock.yaml"),
    fileStamp(cwd, "yarn.lock"),
    fileStamp(cwd, "bun.lockb"),
    fileStamp(cwd, "bun.lock"),
    fileStamp(cwd, "pyproject.toml"),
    fileStamp(cwd, "requirements.txt"),
    fileStamp(cwd, "requirements-dev.txt"),
    JSON.stringify(policy.checks),
  ].join("|");
}

export function detectStack(cwd: string, policy: AegisPolicy = defaultPolicy()): Stack {
  const key = cacheKey(cwd, policy);
  const cached = STACK_CACHE.get(key);
  if (cached) return cached;

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    const checks: CheckCommand[] = [];
    const pm = packageManager(cwd);
    let scripts: Record<string, string> = {};
    try {
      scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {};
    } catch {
      // unparseable package.json -> treat as script-less node project
    }
    if (scripts.lint) checks.push({ name: "lint", argv: [pm, "run", "lint"] });
    if (scripts.test && !NPM_PLACEHOLDER.test(scripts.test)) {
      checks.push({ name: "test", argv: [pm, "run", "test"] });
    }
    const configuredSecurityChecks = [
      ...(policy.checks.includeGitleaks ? SECURITY_CHECKS.slice(0, 1) : []),
      ...(policy.checks.includeSemgrep ? SECURITY_CHECKS.slice(1) : []),
    ];
    const stack: Stack = { kind: "node", checks: [...checks, ...policy.checks.extraChecks, ...configuredSecurityChecks] };
    STACK_CACHE.set(key, stack);
    return stack;
  }
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt"))) {
    const configuredSecurityChecks = [
      ...(policy.checks.includeGitleaks ? SECURITY_CHECKS.slice(0, 1) : []),
      ...(policy.checks.includeSemgrep ? SECURITY_CHECKS.slice(1) : []),
    ];
    const stack: Stack = {
      kind: "python",
      checks: [
        { name: "lint", argv: ["ruff", "check", "."], optional: true },
        { name: "test", argv: ["python3", "-m", "pytest"], optional: true, okExitCodes: [0, 5] },
        ...policy.checks.extraChecks,
        ...configuredSecurityChecks,
      ],
    };
    STACK_CACHE.set(key, stack);
    return stack;
  }
  const configuredSecurityChecks = [
    ...(policy.checks.includeGitleaks ? SECURITY_CHECKS.slice(0, 1) : []),
    ...(policy.checks.includeSemgrep ? SECURITY_CHECKS.slice(1) : []),
  ];
  const stack: Stack = { kind: "generic", checks: [...policy.checks.extraChecks, ...configuredSecurityChecks] };
  STACK_CACHE.set(key, stack);
  return stack;
}
