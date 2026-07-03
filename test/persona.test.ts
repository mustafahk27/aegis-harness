import { describe, expect, it } from "vitest";
import { personaPrompt } from "../extension/persona.js";

describe("personaPrompt", () => {
  it("covers plan-first, TDD, git hygiene, and security rules", () => {
    const p = personaPrompt();
    for (const marker of [
      "plan", "test", "commit", "secret", "parameterized", "least privilege", "validate",
    ]) {
      expect(p.toLowerCase()).toContain(marker);
    }
  });
  it("stays under 2500 characters to limit per-turn token overhead", () => {
    expect(personaPrompt().length).toBeLessThan(2500);
  });
});
