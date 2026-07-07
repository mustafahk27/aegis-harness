import { describe, expect, it } from "vitest";
import { personaPrompt } from "../extension/persona.js";
import { defaultHarnessMode, formatHarnessModePrompt } from "../extension/lib/modes.js";

describe("personaPrompt", () => {
  it("covers plan-first, TDD, debugging, clean code, git hygiene, and security rules", () => {
    const p = personaPrompt();
    for (const marker of [
      "plan", "test", "debug", "clean-code", "commit", "secret", "parameterized", "least privilege", "validate",
    ]) {
      expect(p.toLowerCase()).toContain(marker);
    }
  });
  it("stays under 2500 characters to limit per-turn token overhead", () => {
    expect(personaPrompt().length).toBeLessThan(2500);
  });

  it("includes the active working mode guidance", () => {
    const prompt = personaPrompt("debug");
    expect(prompt).toContain(formatHarnessModePrompt("debug"));
    expect(personaPrompt(defaultHarnessMode())).toContain(formatHarnessModePrompt("feature"));
  });

  it("keeps the mode add-on compact", () => {
    expect(formatHarnessModePrompt("debug").length).toBeLessThan(140);
    expect(formatHarnessModePrompt("feature").length).toBeLessThan(140);
  });
});
