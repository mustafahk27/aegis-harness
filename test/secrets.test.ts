import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanForSecrets, scanStagedDiff } from "../extension/lib/secrets.js";

describe("scanForSecrets", () => {
  it("finds AWS access keys", () => {
    const f = scanForSecrets('const key = "AKIAIOSFODNN7EXAMPLE";');
    expect(f).toHaveLength(1);
    expect(f[0].rule).toBe("aws-access-key");
    expect(f[0].line).toBe(1);
  });
  it("finds private key blocks", () => {
    expect(scanForSecrets("-----BEGIN RSA PRIVATE KEY-----")).toHaveLength(1);
  });
  it("finds GitHub and Slack tokens", () => {
    expect(scanForSecrets(`t = "ghp_${"a".repeat(36)}"`)).toHaveLength(1);
    expect(scanForSecrets('t = "xoxb-1234567890-abcdefghijk"')).toHaveLength(1);
  });
  it("finds generic hardcoded credentials", () => {
    expect(scanForSecrets('password = "hunter2hunter2hunter2"')).toHaveLength(1);
    expect(scanForSecrets("api_key: 'f9a8b7c6d5e4f3a2b1c0'")).toHaveLength(1);
  });
  it("ignores env lookups and placeholders", () => {
    expect(scanForSecrets("const key = process.env.API_KEY")).toHaveLength(0);
    expect(scanForSecrets('api_key = "<YOUR_API_KEY>"')).toHaveLength(0);
    expect(scanForSecrets('password = "example-password-123"')).toHaveLength(0);
    expect(scanForSecrets('token = "changeme"')).toHaveLength(0);
  });
  it("reports correct line numbers", () => {
    const f = scanForSecrets('a = 1\nb = 2\nkey = "AKIAIOSFODNN7EXAMPLE"');
    expect(f[0].line).toBe(3);
  });
});

describe("scanStagedDiff", () => {
  it("finds secrets in staged changes only", () => {
    const dir = mkdtempSync(join(tmpdir(), "senpai-secrets-"));
    const git = (c: string) => execSync(`git ${c}`, { cwd: dir });
    git("init -q");
    git("config user.email t@t.t");
    git("config user.name t");
    writeFileSync(join(dir, "app.ts"), 'const key = "AKIAIOSFODNN7EXAMPLE";\n');
    git("add app.ts");
    const findings = scanStagedDiff(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("aws-access-key");
  });
  it("returns empty when nothing staged", () => {
    const dir = mkdtempSync(join(tmpdir(), "senpai-secrets-"));
    execSync("git init -q", { cwd: dir });
    expect(scanStagedDiff(dir)).toHaveLength(0);
  });
});
