export type HarnessModeName = "feature" | "debug" | "refactor" | "review";

export interface HarnessModeSpec {
  name: HarnessModeName;
  title: string;
  summary: string;
  principles: string[];
}

const MODE_ORDER: HarnessModeName[] = ["feature", "debug", "refactor", "review"];

const MODE_SPECS: Record<HarnessModeName, HarnessModeSpec> = {
  feature: {
    name: "feature",
    title: "Feature",
    summary: "Build new behavior in small, testable slices.",
    principles: [
      "clarify the user goal and constraints before changing code",
      "prefer vertical slices that ship value incrementally",
      "add or update tests alongside behavior changes",
      "keep diffs focused and avoid scope creep",
    ],
  },
  debug: {
    name: "debug",
    title: "Debug",
    summary: "Reproduce the issue, isolate the cause, and verify the smallest safe fix.",
    principles: [
      "reproduce the bug before guessing at a fix",
      "inspect the failing path, logs, inputs, and assumptions",
      "change the smallest thing that can actually solve the issue",
      "verify the fix with a targeted test or repro step",
    ],
  },
  refactor: {
    name: "refactor",
    title: "Refactor",
    summary: "Improve structure without changing behavior unless tests demand it.",
    principles: [
      "preserve behavior unless a test-backed change says otherwise",
      "refactor in small steps with tests staying green",
      "delete duplication, dead code, and awkward indirection",
      "favor simpler names, smaller functions, and clearer flow",
    ],
  },
  review: {
    name: "review",
    title: "Review",
    summary: "Read code like a reviewer and surface risks before shipping.",
    principles: [
      "inspect the actual diff and surrounding code, not memory",
      "call out correctness, security, and maintainability risks clearly",
      "prefer actionable feedback with a suggested fix or next step",
      "do not approve work that still needs tests or validation",
    ],
  },
};

export function defaultHarnessMode(): HarnessModeName {
  return "feature";
}

export function isHarnessModeName(value: string): value is HarnessModeName {
  return MODE_ORDER.includes(value as HarnessModeName);
}

export function parseHarnessMode(value: string | undefined): HarnessModeName | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  return isHarnessModeName(normalized) ? normalized : null;
}

export function normalizeHarnessMode(value: unknown): HarnessModeName | null {
  return typeof value === "string" ? parseHarnessMode(value) : null;
}

export function getHarnessModeSpec(mode: HarnessModeName): HarnessModeSpec {
  return MODE_SPECS[mode];
}

export function formatHarnessModePrompt(mode: HarnessModeName): string {
  const spec = MODE_SPECS[mode];
  return `
## Working mode: ${spec.title}

${spec.summary}

Rules for this mode:
- ${spec.principles[0]}
- ${spec.principles[1]}
- ${spec.principles[2]}
- ${spec.principles[3]}
`.trim();
}

export function formatHarnessModeSummary(mode: HarnessModeName): string {
  const spec = MODE_SPECS[mode];
  return `${spec.title.toLowerCase()} — ${spec.summary}`;
}

export function formatHarnessModeList(): string {
  return MODE_ORDER.map((mode) => {
    const spec = MODE_SPECS[mode];
    return `${spec.name}: ${spec.summary}`;
  }).join("\n");
}

export function formatHarnessModeStatus(mode: HarnessModeName): string {
  return `mode: ${MODE_SPECS[mode].name}`;
}
