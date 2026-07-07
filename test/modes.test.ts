import { describe, expect, it } from "vitest";
import {
  defaultHarnessMode,
  formatHarnessModeList,
  formatHarnessModePrompt,
  formatHarnessModeStatus,
  parseHarnessMode,
} from "../extension/lib/modes.js";

describe("harness modes", () => {
  it("parses the supported mode names", () => {
    expect(parseHarnessMode("debug")).toBe("debug");
    expect(parseHarnessMode("Refactor")).toBe("refactor");
    expect(parseHarnessMode("feature")).toBe("feature");
    expect(parseHarnessMode("review")).toBe("review");
    expect(parseHarnessMode("unknown")).toBeNull();
  });

  it("renders mode guidance for the persona prompt", () => {
    const prompt = formatHarnessModePrompt("review");
    expect(prompt).toMatch(/Review mode/i);
    expect(prompt).toMatch(/inspect the diff/i);
    expect(prompt.length).toBeLessThan(140);
  });

  it("renders a readable mode list and status line", () => {
    expect(formatHarnessModeList()).toMatch(/debug:/i);
    expect(formatHarnessModeList()).toMatch(/refactor:/i);
    expect(formatHarnessModeStatus(defaultHarnessMode())).toBe("mode: feature");
  });
});
