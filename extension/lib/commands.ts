/** Returns a human-readable block reason, or null if the command is allowed. */
export function checkDangerous(command: string): string | null {
  // Finding 1: sudo check is case-insensitive
  // Use /i flag so SUDO, Sudo, etc. are all caught
  if (/(^|\s|;|&&|\|\|)sudo\s/i.test(` ${command} `)) {
    return "sudo is blocked by Aegis Harness. Run privileged commands manually.";
  }

  // Findings 2 & 3: rm recursive on dangerous targets
  // Trigger on: any -r/-R/-rf/-fr/--recursive flag combination (with or without -f)
  // Then skip flag tokens to find real targets, block if any target is absolute/home/parent
  const hasRecursiveFlag =
    // combined single-dash flags containing r or R (with or without f)
    /\brm\s+.*-[a-zA-Z]*[rR][a-zA-Z]*/.test(command) ||
    // separate -r or -R flag
    /\brm\s+.*\s-[rR]\b/.test(command) ||
    // long flag --recursive
    /\brm\s+.*--recursive\b/.test(command);

  if (hasRecursiveFlag) {
    // Extract everything after "rm" and split into tokens
    const afterRm = command.replace(/^.*?\brm\s+/, "");
    const tokens = afterRm.split(/\s+/);
    // Skip flag tokens (start with - or --); check the rest as targets
    const targets = tokens.filter((t) => t.length > 0 && !t.startsWith("-"));
    for (const target of targets) {
      // Dangerous: absolute path, home dir alias, $HOME var, or parent-relative
      if (/^(\/|~|\$HOME|\.\.)/.test(target)) {
        return `recursive rm on '${target}' is blocked: only relative paths inside the project are allowed.`;
      }
    }
  }

  // Finding 4: pipe-to-shell — broaden shell alternation to include fish/ksh/csh/tcsh/ash
  // Prefixes: ba(sh), z(sh), da(sh), fi(sh), k(sh), tc(sh), c(sh), a(sh), or bare sh
  if (/\b(curl|wget)\b[^|;&]*\|\s*(ba|z|da|fi|k|tc|c|a)?sh\b/.test(command)) {
    return "Pipe to shell is blocked. Download, inspect, then run.";
  }

  if (/\bgit\s+push\b/.test(command) && /\s(--force|-f)(\s|$)/.test(command) && /\b(main|master)\b/.test(command)) {
    return "Force-pushing to main/master is blocked.";
  }

  if (/\bchmod\b.*\b777\b/.test(command)) {
    return "chmod 777 is blocked: use least-privilege permissions.";
  }

  return null;
}

// Finding 5: isGitCommit — support git global options (-C <path>, -c key=val) before subcommand
// A git global option is either:
//   -C <value>   (takes a separate argument)
//   -c key=val   (takes a separate argument)
// We allow zero or more of these before the "commit" subcommand.
// The pattern: git  (-C <arg> | -c <arg>)*  commit
const GIT_GLOBAL_OPT = String.raw`(?:\s+-C\s+\S+|\s+-c\s+\S+)*`;
const GIT_COMMIT_RE = new RegExp(
  // At start of string or after a command separator
  String.raw`(^|;|&&|\|\|)\s*git` +
    GIT_GLOBAL_OPT +
    String.raw`\s+commit\b`
);

/** True if the command line invokes `git commit` anywhere (incl. chained commands). */
export function isGitCommit(command: string): boolean {
  return GIT_COMMIT_RE.test(command);
}

const TEST_PATTERNS = [
  // Package-manager test commands
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/,
  // npx vitest or npx jest
  /\bnpx\s+(vitest|jest)\b/,
  // Finding 6: vitest/jest as a command word only — at start of string or after a
  // command separator (;, &&, ||) — not as an arbitrary argument like grep -r vitest
  /(^|;|&&|\|\|)\s*(vitest|jest)\b/,
  /\bpytest\b/,
  /\bpython3?\s+-m\s+pytest\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
];

/** True if the command line looks like it runs a test suite. */
export function isTestRun(command: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(command));
}
