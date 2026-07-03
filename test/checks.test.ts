import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commandExists, formatFailures, runChecks } from "../extension/lib/checks.js";

const cwd = () => mkdtempSync(join(tmpdir(), "aegis-harness-checks-"));

describe("commandExists", () => {
  it("finds sh, not a nonsense binary", () => {
    expect(commandExists("sh")).toBe(true);
    expect(commandExists("definitely-not-a-real-binary-xyz")).toBe(false);
  });
});

describe("runChecks", () => {
  it("reports passing and failing checks", () => {
    const results = runChecks(cwd(), [
      { name: "pass", argv: ["sh", "-c", "echo ok"] },
      { name: "fail", argv: ["sh", "-c", "echo boom; exit 1"] },
    ]);
    expect(results.find((r) => r.name === "pass")).toMatchObject({ ok: true, skipped: false });
    const fail = results.find((r) => r.name === "fail")!;
    expect(fail.ok).toBe(false);
    expect(fail.output).toContain("boom");
  });
  it("honors okExitCodes", () => {
    const [r] = runChecks(cwd(), [{ name: "x", argv: ["sh", "-c", "exit 5"], okExitCodes: [0, 5] }]);
    expect(r.ok).toBe(true);
  });
  it("skips optional checks whose binary is missing", () => {
    const [r] = runChecks(cwd(), [{ name: "x", argv: ["definitely-not-a-real-binary-xyz"], optional: true }]);
    expect(r).toMatchObject({ ok: true, skipped: true });
    expect(r.output).toMatch(/not installed/);
  });
  it("fails closed for required checks whose binary is missing", () => {
    const [r] = runChecks(cwd(), [{ name: "x", argv: ["definitely-not-a-real-binary-xyz"] }]);
    expect(r.ok).toBe(false);
  });
  it("fails a check that exceeds the timeout", () => {
    const [r] = runChecks(cwd(), [{ name: "slow", argv: ["sh", "-c", "sleep 5"] }], 500);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/timed out/i);
  });
});

describe("formatFailures", () => {
  it("lists only failing checks with output", () => {
    const msg = formatFailures([
      { name: "lint", ok: true, skipped: false, output: "" },
      { name: "test", ok: false, skipped: false, output: "2 failed" },
    ]);
    expect(msg).toContain("test");
    expect(msg).toContain("2 failed");
    expect(msg).not.toContain("lint");
  });
});
