import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDangerous } from "../extension/lib/commands.js";
import { loadPolicy } from "../extension/lib/policy.js";
import { scanForSecrets } from "../extension/lib/secrets.js";
import { detectStack } from "../extension/lib/stack.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "aegis-harness-policy-"));
}

describe("policy loading", () => {
  it("loads repo-local policy overrides", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "aegis-harness.config.json"),
      JSON.stringify({
        displayName: "Custom Harness",
        uiKey: "custom-harness",
        dangerousCommands: { blockedBranches: ["release"] },
        secrets: {
          rules: [
            {
              rule: "internal-token",
              pattern: "\\bINT_[A-Z0-9]{8}\\b",
            },
          ],
        },
        checks: {
          timeoutMs: 1234,
          extraChecks: [{ name: "verify", argv: ["sh", "-c", "exit 0"] }],
        },
      }),
    );

    const loaded = loadPolicy(dir);
    expect(loaded.policy.displayName).toBe("Custom Harness");
    expect(loaded.policy.uiKey).toBe("custom-harness");
    expect(loaded.policy.dangerousCommands.blockedBranches).toEqual(["release"]);
    expect(loaded.policy.checks.timeoutMs).toBe(1234);

    expect(checkDangerous("git push -f origin release", loaded.policy)).toMatch(/force-pushing/i);
    expect(checkDangerous("git push -f origin main", loaded.policy)).toBeNull();
    expect(scanForSecrets('const token = "INT_ABC12345";', loaded.policy)).toHaveLength(1);
    expect(detectStack(dir, loaded.policy).checks.map((check) => check.name)).toContain("verify");
  });

  it("falls back cleanly when policy file is absent", () => {
    const dir = tmp();
    const loaded = loadPolicy(dir);
    expect(loaded.policy.displayName).toBe("Aegis Harness");
    expect(loaded.sourcePath).toBeNull();
    expect(loaded.warnings).toHaveLength(0);
  });
});
