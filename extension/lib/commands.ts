import { parseCommandLine } from "./command-parser.js";
import { defaultPolicy, type AegisPolicy } from "./policy.js";

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh", "csh", "tcsh", "ash"]);

function commandWord(segmentCommand: string): string {
  return segmentCommand.toLowerCase();
}

function isProtectedPath(target: string): boolean {
  return /^(\/|~|\$HOME|\.\.)/.test(target);
}

function gitSubcommand(argv: string[]): { subcommand: string | null; args: string[] } {
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "-C" || token === "-c") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    return { subcommand: token, args: argv.slice(index + 1) };
  }
  return { subcommand: null, args: [] };
}

function includesProtectedBranch(args: string[], protectedBranches: string[]): boolean {
  return args.some((arg) => protectedBranches.includes(arg));
}

function recursiveRmReason(argv: string[]): string | null {
  if (commandWord(argv[0] ?? "") !== "rm") return null;
  let recursive = false;
  const targets: string[] = [];
  for (const token of argv.slice(1)) {
    if (token === "--recursive" || token === "-r" || token === "-R") {
      recursive = true;
      continue;
    }
    if (/^-[a-zA-Z]+$/.test(token) && /[rR]/.test(token)) {
      recursive = true;
      continue;
    }
    if (token.startsWith("-")) continue;
    targets.push(token);
  }
  if (!recursive) return null;
  for (const target of targets) {
    if (isProtectedPath(target)) {
      return `Recursive rm on '${target}' is blocked. Suggested fix: use a relative path inside the project, for example \`rm -rf ./dist\`.`;
    }
  }
  return null;
}

/** Returns a human-readable block reason, or null if the command is allowed. */
export function checkDangerous(command: string, policy: AegisPolicy = defaultPolicy()): string | null {
  for (const segment of parseCommandLine(command)) {
    const [first] = segment.argv;
    if (!first) continue;
    const firstLower = commandWord(first);

    if (policy.dangerousCommands.blockSudo && firstLower === "sudo") {
      return `sudo is blocked by ${policy.displayName}. Suggested fix: run privileged commands manually when needed.`;
    }

    if (policy.dangerousCommands.blockPipeToShell && segment.separatorBefore === "pipe" && SHELLS.has(firstLower)) {
      return `Pipe-to-shell is blocked: piping a download into ${firstLower} is unsafe. Suggested fix: download it to a file, inspect it, then run it manually.`;
    }

    if (policy.dangerousCommands.blockRecursiveRmOutsideProject) {
      const reason = recursiveRmReason(segment.argv);
      if (reason) return reason;
    }

    if (firstLower === "git") {
      const { subcommand, args } = gitSubcommand(segment.argv);
      if (subcommand === "push" && policy.dangerousCommands.blockedBranches.length > 0) {
        const hasForce = args.includes("--force") || args.includes("-f");
        if (hasForce && includesProtectedBranch(args, policy.dangerousCommands.blockedBranches)) {
          return `Force-pushing to ${policy.dangerousCommands.blockedBranches.join("/")} is blocked. Suggested fix: use \`--force-with-lease\` on a feature branch.`;
        }
      }
    }

    if (policy.dangerousCommands.blockChmod777 && firstLower === "chmod" && segment.argv.some((token) => token === "777")) {
      return "chmod 777 is blocked. Suggested fix: use the least-privilege mode your task needs, such as 750 or 640.";
    }
  }
  return null;
}

/** True if the command line invokes `git commit` anywhere (incl. chained commands). */
export function isGitCommit(command: string): boolean {
  return parseCommandLine(command).some((segment) => {
    if ((segment.argv[0] ?? "").toLowerCase() !== "git") return false;
    return gitSubcommand(segment.argv).subcommand === "commit";
  });
}

/** True if the command line looks like it runs a test suite. */
export function isTestRun(command: string, policy: AegisPolicy = defaultPolicy()): boolean {
  return parseCommandLine(command).some((segment) => {
    const [first, second, third] = segment.argv.map((value) => value.toLowerCase());
    if (!first) return false;
    if (policy.tests.packageManagers.includes(first) && segment.argv.some((token) => token.toLowerCase() === "test")) {
      return true;
    }
    if (first === "npx" && policy.tests.directRunners.includes(second ?? "")) {
      return true;
    }
    if (policy.tests.directRunners.includes(first)) {
      return true;
    }
    if (first === "pytest") return true;
    if (["python", "python3"].includes(first) && second === "-m" && policy.tests.pythonModuleRunners.includes(third ?? "")) {
      return true;
    }
    if (first === "go" && second === "test") return true;
    if (first === "cargo" && second === "test") return true;
    return false;
  });
}
