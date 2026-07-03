import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectStack } from "../extension/lib/stack.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "aegis-harness-stack-"));
}

describe("detectStack", () => {
  it("detects node with npm lint+test scripts", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { lint: "eslint .", test: "vitest run" },
    }));
    const s = detectStack(dir);
    expect(s.kind).toBe("node");
    expect(s.checks.map((c) => c.name)).toEqual(expect.arrayContaining(["lint", "test"]));
    expect(s.checks.find((c) => c.name === "test")!.argv).toEqual(["npm", "run", "test"]);
  });
  it("uses pnpm when pnpm-lock.yaml exists", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    const s = detectStack(dir);
    expect(s.checks.find((c) => c.name === "test")!.argv[0]).toBe("pnpm");
  });
  it("skips npm's default placeholder test script", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { test: 'echo "Error: no test specified" && exit 1' },
    }));
    expect(detectStack(dir).checks.find((c) => c.name === "test")).toBeUndefined();
  });
  it("detects python via pyproject.toml", () => {
    const dir = tmp();
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname='x'\n");
    const s = detectStack(dir);
    expect(s.kind).toBe("python");
    const test = s.checks.find((c) => c.name === "test")!;
    expect(test.argv).toEqual(["python3", "-m", "pytest"]);
    expect(test.okExitCodes).toContain(5); // pytest exit 5 = no tests collected
    expect(test.optional).toBe(true);
  });
  it("falls back to generic with gitleaks+semgrep only", () => {
    const dir = tmp();
    const s = detectStack(dir);
    expect(s.kind).toBe("generic");
    expect(s.checks.every((c) => c.optional)).toBe(true);
  });
  it("always appends optional gitleaks and semgrep checks", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), "{}");
    const names = detectStack(dir).checks.map((c) => c.name);
    expect(names).toContain("gitleaks");
    expect(names).toContain("semgrep");
  });
});
