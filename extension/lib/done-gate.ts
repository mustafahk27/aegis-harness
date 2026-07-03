import { extname } from "node:path";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".c", ".cc", ".cpp", ".h", ".hpp",
  ".cs", ".swift", ".scala", ".sh", ".sql", ".vue", ".svelte",
]);

export function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * Tracks whether code changed without a subsequent passing test run.
 * Bounces the agent at most once per user prompt to avoid loops.
 */
export class DoneGate {
  private dirty = false;
  private bounced = false;

  notePromptStart(): void {
    this.bounced = false;
  }

  noteCodeChange(): void {
    this.dirty = true;
  }

  noteTestRun(passed: boolean): void {
    if (passed) this.dirty = false;
  }

  shouldBounce(): boolean {
    if (this.dirty && !this.bounced) {
      this.bounced = true;
      return true;
    }
    return false;
  }
}
