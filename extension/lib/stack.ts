import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

export function detectStack(cwd: string): Stack {
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
    return { kind: "node", checks: [...checks, ...SECURITY_CHECKS] };
  }
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt"))) {
    return {
      kind: "python",
      checks: [
        { name: "lint", argv: ["ruff", "check", "."], optional: true },
        { name: "test", argv: ["python3", "-m", "pytest"], optional: true, okExitCodes: [0, 5] },
        ...SECURITY_CHECKS,
      ],
    };
  }
  return { kind: "generic", checks: [...SECURITY_CHECKS] };
}
