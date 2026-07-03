// extension/index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { personaPrompt } from "./persona.js";
import { checkDangerous, isGitCommit, isTestRun } from "./lib/commands.js";
import { formatFailures, runChecks, commandExists } from "./lib/checks.js";
import { DoneGate, isCodeFile } from "./lib/done-gate.js";
import { scanForSecrets, scanStagedDiff, type SecretFinding } from "./lib/secrets.js";
import { detectStack } from "./lib/stack.js";

function formatSecrets(findings: SecretFinding[]): string {
  const lines = findings.map((f) => `  line ${f.line} [${f.rule}]: ${f.snippet}`).join("\n");
  return `Blocked by senpai secret gate:\n${lines}\nRemove the secret (use environment variables) and retry.`;
}

export default function (pi: ExtensionAPI) {
  const doneGate = new DoneGate();
  let gatesEnabled = true;

  // --- persona ---------------------------------------------------------
  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: `${event.systemPrompt}\n\n${personaPrompt()}` };
  });

  // --- session start: reset state, warn about missing optional tools ---
  pi.on("session_start", async (_event, ctx) => {
    gatesEnabled = true;
    const missing = ["gitleaks", "semgrep"].filter((b) => !commandExists(b));
    if (missing.length && ctx.hasUI) {
      ctx.ui.notify(
        `senpai: ${missing.join(", ")} not installed — falling back to built-in scanning only`,
        "warning",
      );
    }
    if (ctx.hasUI) ctx.ui.setStatus("senpai", "gates: on");
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
      const reason = checkDangerous(command);
      if (reason) return { block: true, reason };

      if (gatesEnabled && isGitCommit(command)) {
        // Secret gate on staged content (fail closed: errors block).
        let findings: SecretFinding[];
        try {
          findings = scanStagedDiff(ctx.cwd);
        } catch (err) {
          return { block: true, reason: `senpai secret scan failed (fail-closed): ${String(err)}` };
        }
        if (findings.length) return { block: true, reason: formatSecrets(findings) };

        // Commit gate: full check suite must pass.
        if (ctx.hasUI) ctx.ui.setStatus("senpai", "running pre-commit checks…");
        const results = runChecks(ctx.cwd, detectStack(ctx.cwd).checks);
        if (ctx.hasUI) ctx.ui.setStatus("senpai", "gates: on");
        const failed = results.filter((r) => !r.ok);
        if (failed.length) {
          return { block: true, reason: `Commit blocked by senpai.\n${formatFailures(results)}` };
        }
        doneGate.noteTestRun(true); // suite (incl. tests when defined) passed
      }
      return;
    }

    if (gatesEnabled && isToolCallEventType("write", event)) {
      const findings = scanForSecrets(event.input.content);
      if (findings.length) return { block: true, reason: formatSecrets(findings) };
      return;
    }

    if (gatesEnabled && isToolCallEventType("edit", event)) {
      // edit input: { path: string; edits: { oldText: string; newText: string }[] }
      const combined = event.input.edits.map((e) => e.newText).join("\n");
      const findings = scanForSecrets(combined);
      if (findings.length) return { block: true, reason: formatSecrets(findings) };
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
      if (isTestRun(command)) doneGate.noteTestRun(!event.isError);
    }
  });

  // --- done gate: bounce untested completion ----------------------------
  pi.on("agent_end", async () => {
    if (gatesEnabled && doneGate.shouldBounce()) {
      pi.sendMessage(
        {
          customType: "senpai-done-gate",
          content:
            "senpai done gate: you modified code this session but there was no passing test run afterwards. " +
            "Run the project's test suite now. If tests fail, fix them. If no test covers your change, add one first.",
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
  });

  // --- commands ----------------------------------------------------------
  pi.registerCommand("check", {
    description: "senpai: run the full check suite for this project",
    handler: async (_args, ctx) => {
      const results = runChecks(ctx.cwd, detectStack(ctx.cwd).checks);
      const summary = results
        .map((r) => `${r.ok ? (r.skipped ? "SKIP" : "PASS") : "FAIL"} ${r.name}${r.skipped ? ` (${r.output})` : ""}`)
        .join("\n");
      const failed = results.filter((r) => !r.ok);
      ctx.ui.notify(summary, failed.length ? "error" : "info");
      if (failed.length) ctx.ui.notify(formatFailures(results), "error");
    },
  });

  pi.registerCommand("secreview", {
    description: "senpai: security-review the current uncommitted diff",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      pi.sendUserMessage(
        "Load the 'security-review' skill (read its SKILL.md) and apply it to the current uncommitted changes (`git diff HEAD`). Report findings by severity.",
      );
    },
  });

  pi.registerCommand("gates", {
    description: "senpai: on|off|status — toggle commit/secret/done gates (dangerous-command gate always on)",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim();
      if (arg === "on") gatesEnabled = true;
      else if (arg === "off") gatesEnabled = false;
      ctx.ui.setStatus("senpai", `gates: ${gatesEnabled ? "on" : "OFF"}`);
      ctx.ui.notify(
        `senpai gates ${gatesEnabled ? "ON" : "OFF — commit/secret/done gates disabled until /gates on or session restart"}`,
        gatesEnabled ? "info" : "warning",
      );
    },
  });
}
