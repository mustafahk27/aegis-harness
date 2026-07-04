import { spawnSync } from "node:child_process";
import type { CheckCommand } from "./stack.js";

export interface CheckResult {
  name: string;
  ok: boolean;
  skipped: boolean;
  output: string;
}

const COMMAND_EXISTS_CACHE = new Map<string, boolean>();

export function commandExists(bin: string): boolean {
  const cached = COMMAND_EXISTS_CACHE.get(bin);
  if (cached !== undefined) return cached;
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  const exists = r.status === 0;
  COMMAND_EXISTS_CACHE.set(bin, exists);
  return exists;
}

export function runChecks(cwd: string, checks: CheckCommand[], timeoutMs = 300_000): CheckResult[] {
  const results: CheckResult[] = [];
  for (const check of checks) {
    const [bin, ...args] = check.argv;
    if (!commandExists(bin)) {
      results.push(
        check.optional
          ? { name: check.name, ok: true, skipped: true, output: `${bin} not installed — check skipped` }
          : { name: check.name, ok: false, skipped: false, output: `${bin} not installed but required` },
      );
      continue;
    }
    const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: timeoutMs });
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().slice(-4000);
    // Timeout surfaces as error.code ETIMEDOUT on most Node versions, but a
    // signal-killed child with no exit status is treated the same, fail-closed.
    const timedOut =
      (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT" ||
      (r.status === null && r.signal !== null);
    if (timedOut) {
      results.push({ name: check.name, ok: false, skipped: false, output: `timed out after ${timeoutMs / 1000}s\n${output}` });
      continue;
    }
    const okCodes = check.okExitCodes ?? [0];
    results.push({ name: check.name, ok: r.status !== null && okCodes.includes(r.status), skipped: false, output });
  }
  return results;
}

export function formatFailures(results: CheckResult[]): string {
  const failed = results.filter((r) => !r.ok);
  return failed
    .map((r) => {
      const explanation =
        r.output.includes("not installed")
          ? "Why: the required check tool is missing from this machine.\nFix: install the missing binary or mark the check optional if it is intentionally unavailable."
          : r.output.includes("timed out")
            ? "Why: the check exceeded the configured timeout.\nFix: narrow the check scope, speed up the check, or raise the timeout in policy if the slower run is expected."
          : r.name === "lint"
            ? "Why: lint found code-quality or style violations.\nFix: run the lint command locally and address the reported violations."
            : r.name === "test"
              ? "Why: the test suite did not pass.\nFix: repair the failing tests or add coverage for the change before retrying."
              : "Why: the check exited non-zero.\nFix: inspect the output above and rerun the check after addressing the failure.";
      return `Check '${r.name}' failed:\n${r.output || "(no output)"}\n${explanation}`;
    })
    .join("\n\n");
}
