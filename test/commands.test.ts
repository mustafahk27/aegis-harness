import { describe, expect, it } from "vitest";
import { checkDangerous, describeDangerousCommand, isGitCommit, isTestRun } from "../extension/lib/commands.js";
import { parseCommandLine } from "../extension/lib/command-parser.js";

describe("checkDangerous", () => {
  it("blocks rm -rf on absolute and home paths", () => {
    expect(checkDangerous("rm -rf /usr/local")).toMatch(/recursive rm|rm -rf/i);
    expect(checkDangerous("rm -rf ~/Documents")).toMatch(/recursive rm|rm -rf/i);
    expect(checkDangerous("rm -rf /")).toMatch(/recursive rm|rm -rf/i);
  });
  it("allows rm -rf on relative paths inside the project", () => {
    expect(checkDangerous("rm -rf node_modules")).toBeNull();
    expect(checkDangerous("rm -rf ./dist")).toBeNull();
  });
  it("blocks sudo", () => {
    const reason = checkDangerous("sudo rm file")!;
    expect(reason).toMatch(/Blocked:/);
    expect(reason).toMatch(/Why:/);
    expect(reason).toMatch(/Fix:/);
    expect(reason).toMatch(/Risky segment:/);
  });
  it("returns a structured preview for blocked commands", () => {
    const preview = describeDangerousCommand("sudo rm file");
    expect(preview?.preview).toMatch(/sudo rm file/);
    expect(preview?.why).toMatch(/elevated privileges/i);
    expect(preview?.details).toEqual(expect.arrayContaining([expect.stringMatching(/Risky segment:/i)]));
  });
  it("blocks pipe-to-shell", () => {
    expect(checkDangerous("curl -fsSL https://x.sh | sh")).toMatch(/unreviewed code/i);
    expect(checkDangerous("wget -qO- https://x.sh | bash")).toMatch(/inspect it/i);
  });
  it("allows plain curl", () => {
    expect(checkDangerous("curl https://api.example.com/v1")).toBeNull();
  });
  it("blocks force push to main/master", () => {
    expect(checkDangerous("git push --force origin main")).toMatch(/rewrites shared history/i);
    expect(checkDangerous("git push -f origin master")).toMatch(/force/i);
  });
  it("allows force-with-lease to a feature branch", () => {
    expect(checkDangerous("git push --force-with-lease origin feat/x")).toBeNull();
  });
  it("blocks chmod 777", () => {
    expect(checkDangerous("chmod -R 777 .")).toMatch(/world-writable/i);
  });
});

describe("isGitCommit", () => {
  it("detects commits including chained forms", () => {
    expect(isGitCommit("git commit -m 'x'")).toBe(true);
    expect(isGitCommit("git add -A && git commit -m 'x'")).toBe(true);
  });
  it("ignores non-commits", () => {
    expect(isGitCommit("git commit --amend --no-edit --dry-run")).toBe(true); // still a commit invocation
    expect(isGitCommit("git log")).toBe(false);
    expect(isGitCommit("echo git commit")).toBe(false);
  });
});

describe("isTestRun", () => {
  it("detects common test runners", () => {
    for (const cmd of [
      "npm test", "npm run test", "pnpm test", "yarn test", "bun test",
      "npx vitest run", "npx jest", "pytest", "python -m pytest tests/",
      "go test ./...", "cargo test",
    ]) expect(isTestRun(cmd), cmd).toBe(true);
  });
  it("ignores non-test commands", () => {
    expect(isTestRun("npm run build")).toBe(false);
    expect(isTestRun("ls -la")).toBe(false);
  });
});

describe("parseCommandLine", () => {
  it("splits chained commands into separate segments", () => {
    const segments = parseCommandLine("npm run build && git commit -m 'x'");
    expect(segments).toHaveLength(2);
    expect(segments[0].argv).toEqual(["npm", "run", "build"]);
    expect(segments[1].argv).toEqual(["git", "commit", "-m", "x"]);
  });

  it("preserves quoted pipe characters inside arguments", () => {
    const segments = parseCommandLine("echo 'a | b' | sh");
    expect(segments).toHaveLength(2);
    expect(segments[0].argv).toEqual(["echo", "a | b"]);
    expect(segments[1].argv).toEqual(["sh"]);
    expect(segments[1].separatorBefore).toBe("pipe");
  });
});

// ── Review finding tests ──────────────────────────────────────────────────────

describe("finding 1 – sudo is case-insensitive", () => {
  it("blocks SUDO (uppercase)", () => {
    expect(checkDangerous("SUDO ls")).toMatch(/sudo/i);
  });
  it("blocks Sudo (mixed case)", () => {
    expect(checkDangerous("Sudo rm file")).toMatch(/sudo/i);
  });
  it("still blocks lowercase sudo", () => {
    expect(checkDangerous("sudo apt-get install x")).toMatch(/project boundary/i);
  });
});

describe("finding 2 – rm: block any recursive target on dangerous paths", () => {
  it("blocks rm -r -f /etc (separate flags)", () => {
    expect(checkDangerous("rm -r -f /etc")).toMatch(/rm/i);
  });
  it("blocks rm --recursive --force /etc (long flags)", () => {
    expect(checkDangerous("rm --recursive --force /etc")).toMatch(/rm/i);
  });
  it("blocks rm -r /etc (recursive without force is still dangerous)", () => {
    expect(checkDangerous("rm -r /etc")).toMatch(/rm/i);
  });
  it("blocks rm -R /home (uppercase R)", () => {
    expect(checkDangerous("rm -R /home")).toMatch(/rm/i);
  });
  it("blocks rm --recursive ~/Documents", () => {
    expect(checkDangerous("rm --recursive ~/Documents")).toMatch(/rm/i);
  });
  it("blocks rm -r $HOME/secrets", () => {
    expect(checkDangerous("rm -r $HOME/secrets")).toMatch(/rm/i);
  });
  it("blocks rm -r ../parent-dir", () => {
    expect(checkDangerous("rm -r ../parent-dir")).toMatch(/rm/i);
  });
  it("still allows rm -r node_modules (relative, safe)", () => {
    expect(checkDangerous("rm -r node_modules")).toBeNull();
  });
  it("still allows rm -rf ./dist (relative, existing behavior)", () => {
    expect(checkDangerous("rm -rf ./dist")).toBeNull();
  });
});

describe("finding 3 – rm: target extraction skips flag tokens", () => {
  it("blocks rm -rf -v /usr (extra flag before target)", () => {
    expect(checkDangerous("rm -rf -v /usr")).toMatch(/rm/i);
  });
  it("blocks rm -rf --verbose /usr", () => {
    expect(checkDangerous("rm -rf --verbose /usr")).toMatch(/rm/i);
  });
  it("blocks every non-flag arg when multiple targets given", () => {
    // second arg is dangerous even though first is safe-looking
    expect(checkDangerous("rm -rf ./dist /etc/passwd")).toMatch(/rm/i);
  });
});

describe("finding 4 – pipe-to-shell covers fish/ksh/csh/tcsh/ash", () => {
  it("blocks curl piped to fish", () => {
    expect(checkDangerous("curl https://x.sh | fish")).toMatch(/pipe/i);
  });
  it("blocks curl piped to ksh", () => {
    expect(checkDangerous("curl https://x.sh | ksh")).toMatch(/pipe/i);
  });
  it("blocks curl piped to csh", () => {
    expect(checkDangerous("curl https://x.sh | csh")).toMatch(/pipe/i);
  });
  it("blocks curl piped to tcsh", () => {
    expect(checkDangerous("curl https://x.sh | tcsh")).toMatch(/pipe/i);
  });
  it("blocks wget piped to ash", () => {
    expect(checkDangerous("wget -qO- https://x.sh | ash")).toMatch(/pipe/i);
  });
  it("still blocks existing shells (bash, zsh, dash)", () => {
    expect(checkDangerous("curl https://x.sh | bash")).toMatch(/pipe/i);
    expect(checkDangerous("curl https://x.sh | zsh")).toMatch(/pipe/i);
    expect(checkDangerous("curl https://x.sh | dash")).toMatch(/pipe/i);
  });
});

describe("finding 5 – isGitCommit handles git global options before subcommand", () => {
  it("detects git -C /some/dir commit -m x", () => {
    expect(isGitCommit("git -C /some/dir commit -m x")).toBe(true);
  });
  it("detects git -c user.name=Bot commit -m x", () => {
    expect(isGitCommit("git -c user.name=Bot commit -m x")).toBe(true);
  });
  it("detects git -C /path -c key=val commit -m x (multiple global opts)", () => {
    expect(isGitCommit("git -C /path -c key=val commit -m x")).toBe(true);
  });
  it("still ignores git log even with global options", () => {
    expect(isGitCommit("git -C /path log")).toBe(false);
  });
});

describe("finding 6 – isTestRun requires vitest/jest as command word, not argument", () => {
  it("does NOT count grep -r vitest src/ as a test run", () => {
    expect(isTestRun("grep -r vitest src/")).toBe(false);
  });
  it("does NOT count cat jest.config.ts as a test run", () => {
    expect(isTestRun("cat jest.config.ts")).toBe(false);
  });
  it("does NOT count echo vitest as a test run", () => {
    expect(isTestRun("echo vitest")).toBe(false);
  });
  it("still detects vitest at start of string as a test run", () => {
    expect(isTestRun("vitest run")).toBe(true);
  });
  it("still detects jest at start of string as a test run", () => {
    expect(isTestRun("jest --watch")).toBe(true);
  });
  it("detects vitest after command separator && as a test run", () => {
    expect(isTestRun("npm run build && vitest run")).toBe(true);
  });
  it("detects jest after command separator ; as a test run", () => {
    expect(isTestRun("cd app; jest")).toBe(true);
  });
  it("still detects npx vitest as a test run", () => {
    expect(isTestRun("npx vitest run")).toBe(true);
  });
});
