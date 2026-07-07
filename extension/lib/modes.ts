export type HarnessModeName = "feature" | "debug" | "refactor" | "review";

export interface HarnessModeSpec {
  name: HarnessModeName;
  title: string;
  summary: string;
  addon: string;
}

const MODE_ORDER: HarnessModeName[] = ["feature", "debug", "refactor", "review"];

const MODE_SPECS: Record<HarnessModeName, HarnessModeSpec> = {
  feature: {
    name: "feature",
    title: "Feature",
    summary: "Build new behavior in small, testable slices.",
    addon: "clarify the goal, ship a small slice, and add tests alongside behavior changes.",
  },
  debug: {
    name: "debug",
    title: "Debug",
    summary: "Reproduce the issue, isolate the cause, and verify the smallest safe fix.",
    addon: "reproduce first, inspect evidence, fix the smallest cause, and verify the result.",
  },
  refactor: {
    name: "refactor",
    title: "Refactor",
    summary: "Improve structure without changing behavior unless tests demand it.",
    addon: "preserve behavior, remove duplication, and keep tests green while simplifying structure.",
  },
  review: {
    name: "review",
    title: "Review",
    summary: "Read code like a reviewer and surface risks before shipping.",
    addon: "inspect the diff, call out risks clearly, and suggest the safest next fix.",
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
## ${spec.title} mode

${spec.addon}
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
