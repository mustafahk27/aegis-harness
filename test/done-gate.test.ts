import { describe, expect, it } from "vitest";
import { DoneGate, isCodeFile } from "../extension/lib/done-gate.js";

describe("isCodeFile", () => {
  it("treats source files as code and docs as not", () => {
    for (const p of ["src/a.ts", "b.py", "c.go", "d.rs", "e.tsx", "lib/f.js"]) {
      expect(isCodeFile(p), p).toBe(true);
    }
    for (const p of ["README.md", "notes.txt", "img.png", "data.json", "config.yaml"]) {
      expect(isCodeFile(p), p).toBe(false);
    }
  });
});

describe("DoneGate", () => {
  it("does not bounce when nothing changed", () => {
    expect(new DoneGate().shouldBounce()).toBe(false);
  });
  it("bounces once after an untested code change", () => {
    const g = new DoneGate();
    g.notePromptStart();
    g.noteCodeChange();
    expect(g.shouldBounce()).toBe(true);
    expect(g.shouldBounce()).toBe(false); // only one bounce per prompt
  });
  it("does not bounce when a passing test run followed the change", () => {
    const g = new DoneGate();
    g.notePromptStart();
    g.noteCodeChange();
    g.noteTestRun(true);
    expect(g.shouldBounce()).toBe(false);
  });
  it("still bounces when the test run failed", () => {
    const g = new DoneGate();
    g.notePromptStart();
    g.noteCodeChange();
    g.noteTestRun(false);
    expect(g.shouldBounce()).toBe(true);
  });
  it("re-arms the bounce on the next prompt", () => {
    const g = new DoneGate();
    g.notePromptStart();
    g.noteCodeChange();
    expect(g.shouldBounce()).toBe(true);
    g.notePromptStart();
    g.noteCodeChange();
    expect(g.shouldBounce()).toBe(true);
  });
});
