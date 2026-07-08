/**
 * Integration smoke tests for extension/index.ts.
 *
 * These tests drive the extension's event handlers through a mock ExtensionAPI
 * instead of running pi interactively. This validates gate wiring without
 * requiring live LLM auth.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ── minimal ExtensionAPI mock ─────────────────────────────────────────────────

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

interface MockCtx {
  hasUI: boolean;
  cwd: string;
  notifications: Array<{ msg: string; type?: string }>;
  statuses: Array<{ key: string; text: string }>;
  ui: {
    notify: (msg: string, type?: string) => void;
    setStatus: (key: string, text: string) => void;
  };
}

function makeCtx(cwd = "/tmp/aegis-harness-smoke", hasUI = false): MockCtx {
  const notifications: Array<{ msg: string; type?: string }> = [];
  const statuses: Array<{ key: string; text: string }> = [];
  return {
    hasUI,
    cwd,
    notifications,
    statuses,
    ui: {
      notify: (msg: string, type?: string) => {
        notifications.push({ msg, type });
      },
      setStatus: (key: string, text: string) => {
        statuses.push({ key, text });
      },
    },
  };
}

function buildMockApi() {
  const handlers: Map<string, Handler[]> = new Map();
  const commands: Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = new Map();
  const sentMessages: unknown[] = [];
  const sentUserMessages: string[] = [];

  const api = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(name: string, opts: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, opts);
    },
    registerShortcut() {},
    registerFlag() {},
    getFlag() { return undefined; },
    registerMessageRenderer() {},
    sendMessage(msg: unknown) { sentMessages.push(msg); },
    sendUserMessage(content: string) { sentUserMessages.push(content); },
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

    // Test helpers
    _trigger: async (event: string, eventObj: unknown, ctx: MockCtx = makeCtx()) => {
      const list = handlers.get(event) ?? [];
      let lastResult: unknown;
      for (const h of list) {
        lastResult = await h(eventObj, ctx);
      }
      return lastResult;
    },
    _commands: commands,
    _sentMessages: sentMessages,
    _sentUserMessages: sentUserMessages,
  };

  return api;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadExtension(api: ReturnType<typeof buildMockApi>) {
  // Dynamic import picks up the file as-compiled via vitest's TypeScript transformer
  const mod = await import("../extension/index.js");
  const factory = mod.default as (api: unknown) => void;
  factory(api);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("extension smoke tests", () => {
  let api: ReturnType<typeof buildMockApi>;

  beforeEach(async () => {
    api = buildMockApi();
    await loadExtension(api);
  });

  // ── factory + session_start ───────────────────────────────────────────────

  it("loads without crashing (factory + session_start)", async () => {
    // If session_start fires without throwing, the factory wired up correctly
    await expect(api._trigger("session_start", { type: "session_start", reason: "startup" })).resolves.not.toThrow();
  });

  it("shows the active policy profile in the session status", async () => {
    const ctx = makeCtx("/tmp/aegis-harness-smoke", true);
    await api._trigger("session_start", { type: "session_start", reason: "startup" }, ctx);
    expect(ctx.statuses[0].text).toMatch(/balanced/i);
  });

  // ── dangerous-command gate ────────────────────────────────────────────────

  it("blocks sudo (smoke check 1)", async () => {
    const result = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc1",
      toolName: "bash",
      input: { command: "sudo ls" },
    })) as { block: boolean; reason: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toMatch(/Preview:/i);
    expect(result?.reason).toMatch(/sudo ls/i);
  });

  it("dangerous-command gate is always on even when gatesEnabled=false (gates off)", async () => {
    // Simulate /gates off
    const mockCommandCtx = {
      ...makeCtx(),
      waitForIdle: async () => {},
      ui: { notify: () => {}, setStatus: () => {} },
    };
    const gatesCmd = api._commands.get("gates");
    await gatesCmd?.handler("off", mockCommandCtx);

    // sudo must still be blocked
    const result = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc2",
      toolName: "bash",
      input: { command: "sudo ls" },
    })) as { block: boolean; reason: string } | undefined;

    expect(result?.block).toBe(true);
    expect(result?.reason).toMatch(/sudo/i);
  });

  // ── secret gate on write ──────────────────────────────────────────────────

  it("blocks write containing AWS key (smoke check 2)", async () => {
    const result = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc3",
      toolName: "write",
      input: { path: "creds.ts", content: 'const key = "AKIAIOSFODNN7EXAMPLE"' },
    })) as { block: boolean; reason: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toMatch(/Preview:/i);
    expect(result?.reason).toMatch(/secret pattern/i);
  });

  it("allows write without secrets", async () => {
    const result = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc4",
      toolName: "write",
      input: { path: "hello.ts", content: "export const greeting = 'hello';" },
    })) as { block: boolean } | undefined;

    // No block — result may be undefined or {block: false}
    expect(result?.block).toBeFalsy();
  });

  // ── secret gate on edit ───────────────────────────────────────────────────

  it("blocks edit containing AWS key in newText", async () => {
    const result = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc5",
      toolName: "edit",
      input: {
        path: "src/config.ts",
        edits: [{ oldText: "const key = '';", newText: 'const key = "AKIAIOSFODNN7EXAMPLE";' }],
      },
    })) as { block: boolean; reason: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toMatch(/Preview:/i);
    expect(result?.reason).toMatch(/secret pattern/i);
  });

  // ── /check command registers without error ────────────────────────────────

  it("registers /check command (smoke check 3)", () => {
    expect(api._commands.has("check")).toBe(true);
  });

  it("registers /status command", () => {
    expect(api._commands.has("status")).toBe(true);
  });

  it("registers /mode command", () => {
    expect(api._commands.has("mode")).toBe(true);
  });

  it("registers /modes command", () => {
    expect(api._commands.has("modes")).toBe(true);
  });

  // ── /gates command ────────────────────────────────────────────────────────

  it("registers /gates command (smoke check 4)", () => {
    expect(api._commands.has("gates")).toBe(true);
  });

  it("registers /why and /explain commands", () => {
    expect(api._commands.has("why")).toBe(true);
    expect(api._commands.has("explain")).toBe(true);
  });

  it("runs /check and reports the check summary", async () => {
    const ctx = makeCtx();
    const checkCmd = api._commands.get("check")!;

    await checkCmd.handler("", ctx);

    expect(ctx.notifications.length).toBeGreaterThan(0);
    expect(ctx.notifications[0].msg).toMatch(/gitleaks|semgrep|PASS|SKIP|FAIL/i);
  });

  it("runs /secreview and sends the security-review prompt", async () => {
    const ctx = {
      ...makeCtx(),
      waitForIdle: async () => {},
    };
    const secreviewCmd = api._commands.get("secreview")!;

    await secreviewCmd.handler("", ctx as never);

    expect(api._sentUserMessages.length).toBeGreaterThan(0);
    expect(api._sentUserMessages[0]).toMatch(/security-review/i);
    expect(api._sentUserMessages[0]).toMatch(/git diff HEAD/i);
  });

  it("reports /gates status through the UI", async () => {
    const ctx = {
      ...makeCtx(),
      waitForIdle: async () => {},
    };
    const gatesCmd = api._commands.get("gates")!;

    await gatesCmd.handler("status", ctx as never);

    expect(ctx.notifications.length).toBeGreaterThan(0);
    expect(ctx.notifications[0].msg).toMatch(/gates/i);
    expect(ctx.statuses[0].text).toMatch(/gates:/i);
  });

  it("reports /status with policy and config details", async () => {
    const ctx = {
      ...makeCtx(),
      waitForIdle: async () => {},
    };
    await api._commands.get("status")!.handler("", ctx as never);

    expect(ctx.notifications[0].msg).toMatch(/Policy:/i);
    expect(ctx.notifications[0].msg).toMatch(/Mode:/i);
    expect(ctx.notifications[0].msg).toMatch(/Mode detail:/i);
    expect(ctx.notifications[0].msg).toMatch(/Config:/i);
    expect(ctx.notifications[0].msg).toMatch(/Gates:/i);
  });

  it("reports /modes with the active mode and available options", async () => {
    const ctx = {
      ...makeCtx(),
      waitForIdle: async () => {},
    };
    await api._commands.get("modes")!.handler("", ctx as never);

    expect(ctx.notifications[0].msg).toMatch(/Active mode:/i);
    expect(ctx.notifications[0].msg).toMatch(/Mode detail:/i);
    expect(ctx.notifications[0].msg).toMatch(/feature:/i);
    expect(ctx.notifications[0].msg).toMatch(/debug:/i);
    expect(ctx.notifications[0].msg).toMatch(/refactor:/i);
    expect(ctx.notifications[0].msg).toMatch(/review:/i);
  });

  it("switches modes and reflects the new mode in the prompt", async () => {
    const ctx = {
      ...makeCtx("/tmp/aegis-harness-smoke", true),
      waitForIdle: async () => {},
    };
    await api._commands.get("mode")!.handler("debug", ctx as never);

    expect(ctx.notifications.at(-1)?.msg).toMatch(/debug/i);
    expect(ctx.statuses.at(-1)?.text).toMatch(/mode: debug/i);

    const result = (await api._trigger("before_agent_start", {
      type: "before_agent_start",
      prompt: "help",
      systemPrompt: "BASE",
      systemPromptOptions: {},
    })) as { systemPrompt?: string } | undefined;

    expect(result?.systemPrompt).toMatch(/Debug mode/i);
    expect(result?.systemPrompt).toMatch(/reproduce first/i);
  });

  it("shows a picker when /mode is called without args", async () => {
    const base = makeCtx("/tmp/aegis-harness-smoke", true);
    const ctx = {
      ...base,
      waitForIdle: async () => {},
      ui: {
        ...base.ui,
        select: async () => "Review — Read code like a reviewer and surface risks before shipping.",
      },
    };

    await api._commands.get("mode")!.handler("", ctx as never);

    expect(ctx.notifications.at(-1)?.msg).toMatch(/working mode switched to review/i);
    expect(ctx.statuses.at(-1)?.text).toMatch(/mode: review/i);
  });

  it("/why and /explain report the last blocked action", async () => {
    const whyCtx = makeCtx();
    const explainCtx = makeCtx();

    await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc-why-1",
      toolName: "bash",
      input: { command: "sudo ls" },
    });
    await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc-why-2",
      toolName: "write",
      input: { path: "creds.ts", content: 'const key = "AKIAIOSFODNN7EXAMPLE"' },
    });

    await api._commands.get("why")!.handler("", whyCtx as never);
    await api._commands.get("explain")!.handler("", explainCtx as never);

    expect(whyCtx.notifications[0].msg).toMatch(/Last block/i);
    expect(whyCtx.notifications[0].msg).toMatch(/Secret preview/i);
    expect(explainCtx.notifications[0].msg).toMatch(/Why:/i);
    expect(explainCtx.notifications[0].msg).toMatch(/Fix:/i);
    expect(explainCtx.notifications[0].msg).toMatch(/AKIAIOSFODNN7EXAMPLE/i);
  });

  it("/why says when no block has happened yet", async () => {
    const whyCtx = makeCtx();
    await api._commands.get("why")!.handler("", whyCtx as never);
    expect(whyCtx.notifications[0].msg).toMatch(/No recent block/i);
  });

  it("/gates off and /gates on toggle gatesEnabled; sudo remains blocked", async () => {
    const mockCommandCtx = {
      ...makeCtx(),
      waitForIdle: async () => {},
      ui: { notify: () => {}, setStatus: () => {} },
    };
    const gatesCmd = api._commands.get("gates")!;

    // Turn gates off
    await gatesCmd.handler("off", mockCommandCtx);

    // Write should now be allowed (gates off)
    const writeResult = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc6",
      toolName: "write",
      input: { path: "creds.ts", content: 'const key = "AKIAIOSFODNN7EXAMPLE"' },
    })) as { block: boolean } | undefined;
    expect(writeResult?.block).toBeFalsy();

    // Turn gates back on
    await gatesCmd.handler("on", mockCommandCtx);

    // Write should now be blocked again
    const writeResult2 = (await api._trigger("tool_call", {
      type: "tool_call",
      toolCallId: "tc7",
      toolName: "write",
      input: { path: "creds.ts", content: 'const key = "AKIAIOSFODNN7EXAMPLE"' },
    })) as { block: boolean } | undefined;
    expect(writeResult2?.block).toBe(true);
  });

  // ── done gate ─────────────────────────────────────────────────────────────

  it("done gate sends bounce message when code changed but no test run", async () => {
    // Simulate user input to arm the gate
    await api._trigger("input", { type: "input", source: "interactive", text: "fix the bug" });

    // Simulate a code file write succeeding
    await api._trigger("tool_result", {
      type: "tool_result",
      toolCallId: "tc8",
      toolName: "write",
      input: { path: "src/app.ts" },
      content: [],
      isError: false,
    });

    // Agent ends without running tests
    await api._trigger("agent_end", { type: "agent_end", messages: [] });

    expect(api._sentMessages.length).toBeGreaterThan(0);
    const msg = api._sentMessages[0] as { customType: string; content: string };
    expect(msg.customType).toBe("aegis-harness-done-gate");
    expect(msg.content).toMatch(/test suite/i);
  });

  it("done gate does NOT bounce when test run passed", async () => {
    await api._trigger("input", { type: "input", source: "interactive", text: "add feature" });

    // Code change
    await api._trigger("tool_result", {
      type: "tool_result",
      toolCallId: "tc9",
      toolName: "write",
      input: { path: "src/app.ts" },
      content: [],
      isError: false,
    });

    // Test run passes
    await api._trigger("tool_result", {
      type: "tool_result",
      toolCallId: "tc10",
      toolName: "bash",
      input: { command: "npm test" },
      content: [],
      isError: false,
    });

    await api._trigger("agent_end", { type: "agent_end", messages: [] });

    expect(api._sentMessages.length).toBe(0);
  });

  // ── persona ───────────────────────────────────────────────────────────────

  it("before_agent_start appends persona to system prompt", async () => {
    const result = (await api._trigger("before_agent_start", {
      type: "before_agent_start",
      prompt: "help",
      systemPrompt: "BASE",
      systemPromptOptions: {},
    })) as { systemPrompt?: string } | undefined;

    expect(result?.systemPrompt).toMatch(/^BASE\n\n/);
    expect(result?.systemPrompt).toMatch(/Engineering discipline/i);
    expect(result?.systemPrompt).toMatch(/Feature mode/i);
  });
});
