/** Returns a human-readable block reason, or null if the command is allowed. */
export function checkDangerous(command: string): string | null {
  if (/(^|\s|;|&&|\|\|)sudo\s/.test(` ${command} `)) {
    return "sudo is blocked by senpai. Run privileged commands manually.";
  }
  // rm -rf (any flag order/combined flags) targeting absolute, home, or parent paths
  const rm = command.match(/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*[rR][a-zA-Z]*)\s+(.+)/);
  if (rm) {
    const target = rm[2].trim();
    if (/^(\/|~|\$HOME|\.\.)/.test(target)) {
      return `rm -rf on '${target}' is blocked: only relative paths inside the project are allowed.`;
    }
  }
  if (/\b(curl|wget)\b[^|;&]*\|\s*(ba|z|da)?sh\b/.test(command)) {
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

/** True if the command line invokes `git commit` anywhere (incl. chained commands). */
export function isGitCommit(command: string): boolean {
  return /(^|;|&&|\|\|)\s*git\s+([a-z-]+\s+)*commit\b/.test(command) || /^git\s+commit\b/.test(command.trim());
}

const TEST_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/,
  /\bnpx\s+(vitest|jest)\b/,
  /(^|\s)(vitest|jest)\b/,
  /\bpytest\b/,
  /\bpython3?\s+-m\s+pytest\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
];

/** True if the command line looks like it runs a test suite. */
export function isTestRun(command: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(command));
}
