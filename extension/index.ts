// extension/index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { personaPrompt } from "./persona.js";
import { checkDangerous, isGitCommit, isTestRun } from "./lib/commands.js";
import { formatFailures, runChecks, commandExists } from "./lib/checks.js";
import { DoneGate, isCodeFile } from "./lib/done-gate.js";
import { scanForSecrets, scanStagedDiff, type SecretFinding } from "./lib/secrets.js";
import { detectStack } from "./lib/stack.js";
import { loadPolicy } from "./lib/policy.js";

type BlockKind = "dangerous-command" | "secret" | "commit" | "done-gate";

interface BlockRecord {
  kind: BlockKind;
  summary: string;
  why: string;
  fix: string;
  details: string[];
  reason: string;
}

function makeBlockRecord(input: {
  kind: BlockKind;
  summary: string;
  why: string;
  fix: string;
  details?: string[];
}): BlockRecord {
  const details = input.details ?? [];
  const reason = [input.summary, `Why: ${input.why}`, ...details, `Fix: ${input.fix}`].join("\n");
  return {
    kind: input.kind,
    summary: input.summary,
    why: input.why,
    fix: input.fix,
    details,
    reason,
  };
}

function formatSecrets(findings: SecretFinding[], displayName: string): BlockRecord {
  const details = findings.map((f) => `  line ${f.line} [${f.rule}]: ${f.snippet}`);
  return makeBlockRecord({
    kind: "secret",
    summary: `Blocked by ${displayName} secret gate.`,
    why: "the staged or edited content matches a known secret pattern.",
    fix: "replace the secret with an environment variable or secret manager reference, then retry.",
    details,
  });
}

export default function (pi: ExtensionAPI) {
  const doneGate = new DoneGate();
  let gatesEnabled = true;
  let policy = loadPolicy(process.cwd()).policy;
  let blockHistory: BlockRecord[] = [];

  function rememberBlock(block: BlockRecord) {
    blockHistory = [block, ...blockHistory.filter((entry) => entry.reason !== block.reason)].slice(0, 5);
  }

  function clearBlock(): void {
    blockHistory = [];
  }

  function explainBlock(mode: "why" | "explain"): string {
    const current = blockHistory[0];
    if (!current) {
      return "No recent block found in this session. Trigger a blocked command first, then ask /why or /explain.";
    }

    if (mode === "why") {
      return `Last block (${current.kind}): ${current.summary}`;
    }

    return `Last block (${current.kind}):
${current.reason}
Use this to adjust the command, file change, or commit, then try again.`;
  }

  // --- persona ---------------------------------------------------------
  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: `${event.systemPrompt}\n\n${personaPrompt()}` };
  });

  // --- session start: reset state, warn about missing optional tools ---
  pi.on("session_start", async (_event, ctx) => {
    const loaded = loadPolicy(ctx.cwd);
    policy = loaded.policy;
    gatesEnabled = policy.gatesEnabledByDefault;
    clearBlock();
    const missing = [
      ...(policy.checks.includeGitleaks ? ["gitleaks"] : []),
      ...(policy.checks.includeSemgrep ? ["semgrep"] : []),
    ].filter((b) => !commandExists(b));
    if (missing.length && ctx.hasUI) {
      ctx.ui.notify(
        `${policy.uiKey}: ${missing.join(", ")} not installed — falling back to built-in scanning only`,
        "warning",
      );
    }
    for (const warning of loaded.warnings) {
      if (ctx.hasUI) ctx.ui.notify(`${policy.displayName} policy warning: ${warning}`, "warning");
    }
    if (ctx.hasUI) ctx.ui.setStatus(policy.uiKey, `gates: ${gatesEnabled ? "on" : "OFF"}`);
  });

  // --- re-arm the done gate on real user input -------------------------
  pi.on("input", async (event) => {
    if (event.source !== "extension") doneGate.notePromptStart();
    return { action: "continue" };
  });

  // --- hard gates -------------------------------------------------------
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      const command = event.input.command;
      // Dangerous-command gate: NEVER disabled, even by /gates off.
      const reason = checkDangerous(command, policy);
      if (reason) {
        const block = makeBlockRecord({
          kind: "dangerous-command",
          summary: `${policy.displayName} blocked the command.`,
          why: "it matches a dangerous-command rule that protects the project and your machine.",
          fix: "rewrite the command to avoid the risky operation, or run the safest possible narrower version manually.",
          details: [`Command: ${command}`],
        });
        rememberBlock(block);
        return { block: true, reason: block.reason };
      }

      if (gatesEnabled && isGitCommit(command)) {
        // Secret gate on staged content (fail closed: errors block).
        let findings: SecretFinding[];
        try {
          findings = scanStagedDiff(ctx.cwd, policy);
        } catch (err) {
          const block = makeBlockRecord({
            kind: "secret",
            summary: `${policy.displayName} secret scan failed (fail-closed).`,
            why: "the staged-diff scanner returned an error, so the harness refused to continue.",
            fix: "fix the scanner error or rerun in a context where the repo can be scanned safely.",
            details: [`Error: ${String(err)}`],
          });
          rememberBlock(block);
          return { block: true, reason: block.reason };
        }
        if (findings.length) {
          const block = formatSecrets(findings, policy.displayName);
          rememberBlock(block);
          return { block: true, reason: block.reason };
        }

        // Commit gate: full check suite must pass.
        if (ctx.hasUI) ctx.ui.setStatus(policy.uiKey, "running pre-commit checks…");
        const results = runChecks(ctx.cwd, detectStack(ctx.cwd, policy).checks, policy.checks.timeoutMs);
        if (ctx.hasUI) ctx.ui.setStatus(policy.uiKey, "gates: on");
        const failed = results.filter((r) => !r.ok);
        if (failed.length) {
          const block = makeBlockRecord({
            kind: "commit",
            summary: `Commit blocked by ${policy.displayName}.`,
            why: "one or more required checks failed before the commit could proceed.",
            fix: "resolve the failing checks and rerun the commit.",
            details: formatFailures(results).split("\n\n"),
          });
          rememberBlock(block);
          return {
            block: true,
            reason: block.reason,
          };
        }
        // Only mark the done gate satisfied if a real test check actually ran and passed.
        // A project with no test script has no "test" check in its suite — a successful
        // commit in that project must NOT clear the done gate.  A skipped optional test
        // check (binary not installed) does not count either.
        const testCheckPassed = results.some((r) => r.name === "test" && r.ok && !r.skipped);
        if (testCheckPassed) doneGate.noteTestRun(true);
      }
      return;
    }

    if (gatesEnabled && isToolCallEventType("write", event)) {
      const findings = scanForSecrets(event.input.content, policy);
      if (findings.length) {
        const block = formatSecrets(findings, policy.displayName);
        rememberBlock(block);
        return { block: true, reason: block.reason };
      }
      return;
    }

    if (gatesEnabled && isToolCallEventType("edit", event)) {
      // edit input: { path: string; edits: { oldText: string; newText: string }[] }
      const combined = event.input.edits.map((e) => e.newText).join("\n");
      const findings = scanForSecrets(combined, policy);
      if (findings.length) {
        const block = formatSecrets(findings, policy.displayName);
        rememberBlock(block);
        return { block: true, reason: block.reason };
      }
    }
  });

  // --- observe results to feed the done gate ---------------------------
  pi.on("tool_result", async (event) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const path = (event.input as { path?: string }).path;
      if (!event.isError && path && isCodeFile(path)) doneGate.noteCodeChange();
    }
    if (event.toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      if (isTestRun(command, policy)) doneGate.noteTestRun(!event.isError);
    }
  });

  // --- done gate: bounce untested completion ----------------------------
  pi.on("agent_end", async () => {
    if (gatesEnabled && doneGate.shouldBounce()) {
      const block = makeBlockRecord({
        kind: "done-gate",
        summary: "Aegis Harness done gate bounced the session.",
        why: "you modified code this session but there was no passing test run afterwards.",
        fix: "run the project's test suite now. If tests fail, fix them. If no test covers your change, add one first.",
      });
      rememberBlock(block);
      pi.sendMessage(
        {
          customType: "aegis-harness-done-gate",
          content: block.reason,
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
  });

  // --- commands ----------------------------------------------------------
  pi.registerCommand("check", {
    description: "Aegis Harness: run the full check suite for this project",
    handler: async (_args, ctx) => {
      const loaded = loadPolicy(ctx.cwd);
      policy = loaded.policy;
      const results = runChecks(ctx.cwd, detectStack(ctx.cwd, policy).checks, policy.checks.timeoutMs);
      const summary = results
        .map((r) => `${r.ok ? (r.skipped ? "SKIP" : "PASS") : "FAIL"} ${r.name}${r.skipped ? ` (${r.output})` : ""}`)
        .join("\n");
      const failed = results.filter((r) => !r.ok);
      ctx.ui.notify(summary, failed.length ? "error" : "info");
      if (failed.length) ctx.ui.notify(formatFailures(results), "error");
    },
  });

  pi.registerCommand("secreview", {
    description: "Aegis Harness: security-review the current uncommitted diff",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      pi.sendUserMessage(
        "Load the 'security-review' skill (read its SKILL.md) and apply it to the current uncommitted changes (`git diff HEAD`). Report findings by severity.",
      );
    },
  });

  pi.registerCommand("why", {
    description: "Aegis Harness: explain the last blocked action briefly",
    handler: async (_args, ctx) => {
      ctx.ui.notify(explainBlock("why"), "info");
    },
  });

  pi.registerCommand("explain", {
    description: "Aegis Harness: explain the last blocked action in detail",
    handler: async (_args, ctx) => {
      ctx.ui.notify(explainBlock("explain"), "info");
    },
  });

  pi.registerCommand("gates", {
    description: "Aegis Harness: on|off|status — toggle commit/secret/done gates (dangerous-command gate always on)",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim();
      if (arg === "on") gatesEnabled = true;
      else if (arg === "off") gatesEnabled = false;
      ctx.ui.setStatus(policy.uiKey, `gates: ${gatesEnabled ? "on" : "OFF"}`);
      ctx.ui.notify(
        `${policy.displayName} gates ${gatesEnabled ? "ON" : "OFF — commit/secret/done gates disabled until /gates on or session restart"}`,
        gatesEnabled ? "info" : "warning",
      );
    },
  });
}
