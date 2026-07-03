/**
 * Integration tests for the done-gate / commit-gate interaction.
 *
 * FIX 1 (M-1): noteTestRun(true) must only fire in the commit-gate success path
 * when the check suite actually included a passing, non-skipped "test" check.
 * A project with no test script must NOT have the done-gate cleared by a commit.
 *
 * We mock the three modules that touch the filesystem so these tests remain fast
 * and deterministic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── module mocks (hoisted before all imports) ─────────────────────────────────

vi.mock("../extension/lib/checks.js", () => ({
  commandExists: vi.fn(() => false),
  runChecks: vi.fn(() => []),
  formatFailures: vi.fn(() => ""),
}));

vi.mock("../extension/lib/stack.js", () => ({
  detectStack: vi.fn(() => ({ kind: "generic", checks: [] })),
}));

vi.mock("../extension/lib/secrets.js", () => ({
  scanStagedDiff: vi.fn(() => []),
  scanForSecrets: vi.fn(() => []),
}));

// Now import the mocked modules so we can reconfigure them per test
import { runChecks, formatFailures } from "../extension/lib/checks.js";
import { detectStack } from "../extension/lib/stack.js";
import { scanStagedDiff } from "../extension/lib/secrets.js";
import type { CheckResult } from "../extension/lib/checks.js";

// ── ExtensionAPI mock (same shape as extension-smoke.test.ts) ─────────────────

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

interface MockCtx {
  hasUI: boolean;
  cwd: string;
  ui: {
    notify: (msg: string, type?: string) => void;
    setStatus: (key: string, text: string) => void;
  };
}

function makeCtx(cwd = "/tmp/senpai-commit-gate"): MockCtx {
  return {
    hasUI: false,
    cwd,
    ui: { notify: () => {}, setStatus: () => {} },
  };
}

function buildMockApi() {
  const handlers: Map<string, Handler[]> = new Map();
  const sentMessages: unknown[] = [];

  const api = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand() {},
    registerShortcut() {},
    registerFlag() {},
    getFlag() { return undefined; },
    registerMessageRenderer() {},
    sendMessage(msg: unknown) { sentMessages.push(msg); },
    sendUserMessage() {},
    appendEntry() {},
    setSessionName() {},
    getSessionName() { return undefined; },
    setLabel() {},
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    getActiveTools: () => [],
    getAllTools: () => [],
    setActiveTools() {},
    getCommands: () => [],
    setModel: async () => true,
    getThinkingLevel: () => 0 as unknown as import("@earendil-works/pi-coding-agent").AgentSessionEvent,
    setThinkingLevel() {},
    registerProvider() {},
    unregisterProvider() {},
    events: { on: () => () => {}, emit: async () => {} } as unknown as import("@earendil-works/pi-coding-agent").EventBus,

    _trigger: async (event: string, eventObj: unknown, ctx: MockCtx = makeCtx()) => {
      const list = handlers.get(event) ?? [];
      let lastResult: unknown;
      for (const h of list) {
        lastResult = await h(eventObj, ctx);
      }
      return lastResult;
    },
    _sentMessages: sentMessages,
  };
  return api;
}

async function loadExtension(api: ReturnType<typeof buildMockApi>) {
  const mod = await import("../extension/index.js");
  const factory = mod.default as (api: unknown) => void;
  factory(api);
}

// ── helpers ───────────────────────────────────────────────────────────────────

const mockedRunChecks = vi.mocked(runChecks);
const mockedDetectStack = vi.mocked(detectStack);
const mockedScanStagedDiff = vi.mocked(scanStagedDiff);

// ── tests ─────────────────────────────────────────────────────────────────────

describe("done-gate / commit-gate interaction (FIX 1)", () => {
  let api: ReturnType<typeof buildMockApi>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default safe: no secrets, no failing checks
    mockedScanStagedDiff.mockReturnValue([]);

    api = buildMockApi();
    await loadExtension(api);

    // Arm the done gate via a user-input event
    await api._trigger("input", {
      type: "input",
      source: "interactive",
      text: "fix the bug",
    });

    // Simulate a code file write so the done gate is dirty
    await api._trigger("tool_result", {
      type: "tool_result",
      toolCallId: "wr1",
      toolName: "write",
      input: { path: "src/index.ts" },
      content: [],
      isError: false,
    });
  });

  it("no-test-script project: git commit does NOT clear done gate (gate still bounces)", async () => {
    // Project has no test script — suite contains only lint/security checks, no "test"
    const suiteWithoutTest: CheckResult[] = [
      { name: "lint", ok: true, skipped: false, output: "" },
      { name: "gitleaks", ok: true, skipped: true, output: "gitleaks not installed — check skipped" },
    ];
    mockedDetectStack.mockReturnValue({ kind: "node", checks: [] });
    mockedRunChecks.mockReturnValue(suiteWithoutTest);
    vi.mocked(formatFailures).mockReturnValue("");

    // Agent runs git commit — suite passes but has no "test" check
    await api._trigger(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "tc_commit",
        toolName: "bash",
        input: { command: "git commit -m 'fix: update logic'" },
      },
      makeCtx(),
    );

    // Agent ends — done gate should STILL bounce because no real test ran
    await api._trigger("agent_end", { type: "agent_end", messages: [] });

    expect(api._sentMessages.length).toBeGreaterThan(0);
    const msg = api._sentMessages[0] as { customType: string };
    expect(msg.customType).toBe("senpai-done-gate");
  });

  it("project with passing 'test' check: git commit clears done gate (no bounce)", async () => {
    // Project has a test script — suite includes a passing "test" check
    const suiteWithTest: CheckResult[] = [
      { name: "lint", ok: true, skipped: false, output: "" },
      { name: "test", ok: true, skipped: false, output: "All tests passed" },
      { name: "gitleaks", ok: true, skipped: true, output: "gitleaks not installed — check skipped" },
    ];
    mockedDetectStack.mockReturnValue({ kind: "node", checks: [] });
    mockedRunChecks.mockReturnValue(suiteWithTest);
    vi.mocked(formatFailures).mockReturnValue("");

    // Agent runs git commit — suite passes AND includes a passing "test" check
    await api._trigger(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "tc_commit2",
        toolName: "bash",
        input: { command: "git commit -m 'fix: update logic'" },
      },
      makeCtx(),
    );

    // Agent ends — done gate should NOT bounce
    await api._trigger("agent_end", { type: "agent_end", messages: [] });

    expect(api._sentMessages.length).toBe(0);
  });

  it("project with skipped 'test' check: git commit does NOT clear done gate (bounce)", async () => {
    // Optional test check that gets skipped (binary not installed) does not count
    const suiteWithSkippedTest: CheckResult[] = [
      { name: "test", ok: true, skipped: true, output: "pytest not installed — check skipped" },
      { name: "gitleaks", ok: true, skipped: true, output: "gitleaks not installed — check skipped" },
    ];
    mockedDetectStack.mockReturnValue({ kind: "python", checks: [] });
    mockedRunChecks.mockReturnValue(suiteWithSkippedTest);
    vi.mocked(formatFailures).mockReturnValue("");

    await api._trigger(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "tc_commit3",
        toolName: "bash",
        input: { command: "git commit -m 'fix: update logic'" },
      },
      makeCtx(),
    );

    await api._trigger("agent_end", { type: "agent_end", messages: [] });

    // Skipped test check must NOT satisfy the done gate
    expect(api._sentMessages.length).toBeGreaterThan(0);
    const msg = api._sentMessages[0] as { customType: string };
    expect(msg.customType).toBe("senpai-done-gate");
  });
});
