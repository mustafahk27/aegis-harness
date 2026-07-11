import { parseCommandLine } from "./command-parser.js";
import { defaultPolicy, type AegisPolicy } from "./policy.js";

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh", "csh", "tcsh", "ash"]);

export interface CommandBlockDetails {
  preview: string;
  why: string;
  fix: string;
  details?: string[];
}

function formatBlock(details: CommandBlockDetails): string {
  const lines = [`Blocked: ${details.preview}`, `Why: ${details.why}`, ...(details.details ?? [])];
  lines.push(`Fix: ${details.fix}`);
  return lines.join("\n");
}

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

function previewCommand(command: string): string {
  return command.length > 120 ? `${command.slice(0, 117)}...` : command;
}

function commandPreview(argv: string[]): string {
  return argv.join(" ");
}

function recursiveRmDetails(argv: string[]): Pick<CommandBlockDetails, "why" | "fix" | "details"> | null {
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
      return {
        why: `recursive deletes on '${target}' are easy to mis-target and hard to recover from.`,
        fix: "use a relative path inside the project, for example `rm -rf ./dist`.",
        details: [`Risky segment: ${commandPreview(argv)}`, `Protected target: ${target}`],
      };
    }
  }
  return null;
}

export function describeDangerousCommand(command: string, policy: AegisPolicy = defaultPolicy()): CommandBlockDetails | null {
  for (const segment of parseCommandLine(command)) {
    const [first] = segment.argv;
    if (!first) continue;
    const firstLower = commandWord(first);

    if (policy.dangerousCommands.blockSudo && firstLower === "sudo") {
      return {
        preview: previewCommand(command),
        why: "the command uses elevated privileges outside the project boundary.",
        fix: "drop `sudo` if possible; if you only need to inspect or edit a project file, rerun the command against the smallest project-local path instead.",
        details: [`Risky segment: ${commandPreview(segment.argv)}`],
      };
    }

    if (policy.dangerousCommands.blockPipeToShell && segment.separatorBefore === "pipe" && SHELLS.has(firstLower)) {
      return {
        preview: previewCommand(command),
        why: `pipe-to-shell runs unreviewed code immediately with no inspection point.`,
        fix: "save the script to a file first, inspect it, and only run it explicitly after you trust the contents.",
        details: [`Risky segment: ${commandPreview(segment.argv)}`, `Pipeline: ${previewCommand(command)}`],
      };
    }

    if (policy.dangerousCommands.blockRecursiveRmOutsideProject) {
      const reason = recursiveRmDetails(segment.argv);
      if (reason) {
        return {
          preview: previewCommand(command),
          why: reason.why,
          fix: reason.fix,
          details: reason.details,
        };
      }
    }

    if (firstLower === "git") {
      const { subcommand, args } = gitSubcommand(segment.argv);
      if (subcommand === "push" && policy.dangerousCommands.blockedBranches.length > 0) {
        const hasForce = args.includes("--force") || args.includes("-f");
        const protectedBranch = args.find((arg) => policy.dangerousCommands.blockedBranches.includes(arg));
        if (hasForce && protectedBranch) {
          return {
            preview: previewCommand(command),
            why: `force-pushing to protected branches rewrites shared history and can drop other people's work.`,
            fix: `push to a feature branch instead, or use \`git push --force-with-lease origin ${protectedBranch}\` only when you own the branch and need a controlled history update.`,
            details: [`Risky segment: ${commandPreview(segment.argv)}`, `Protected branch: ${protectedBranch}`],
          };
        }
      }
    }

    if (policy.dangerousCommands.blockChmod777 && firstLower === "chmod" && segment.argv.some((token) => token === "777")) {
      return {
        preview: previewCommand(command),
        why: "the command makes files world-writable.",
        fix: "use the least-privilege mode the task needs, such as `chmod 750 ./dir` for executables or `chmod 640 ./file` for files.",
        details: [`Risky segment: ${commandPreview(segment.argv)}`],
      };
    }
  }
  return null;
}

/** Returns a human-readable block reason, or null if the command is allowed. */
export function checkDangerous(command: string, policy: AegisPolicy = defaultPolicy()): string | null {
  const details = describeDangerousCommand(command, policy);
  return details ? formatBlock(details) : null;
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
