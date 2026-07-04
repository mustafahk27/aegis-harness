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

function formatSecrets(findings: SecretFinding[], displayName: string): string {
  const lines = findings.map((f) => `  line ${f.line} [${f.rule}]: ${f.snippet}`).join("\n");
  return `Blocked by ${displayName} secret gate:
Why: the staged or edited content matches a known secret pattern.
${lines}
Fix: replace the secret with an environment variable or secret manager reference, then retry.`;
}

export default function (pi: ExtensionAPI) {
  const doneGate = new DoneGate();
  let gatesEnabled = true;
  let policy = loadPolicy(process.cwd()).policy;

  // --- persona ---------------------------------------------------------
  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: `${event.systemPrompt}\n\n${personaPrompt()}` };
  });

  // --- session start: reset state, warn about missing optional tools ---
  pi.on("session_start", async (_event, ctx) => {
    const loaded = loadPolicy(ctx.cwd);
    policy = loaded.policy;
    gatesEnabled = policy.gatesEnabledByDefault;
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
      if (reason) return { block: true, reason };

      if (gatesEnabled && isGitCommit(command)) {
        // Secret gate on staged content (fail closed: errors block).
        let findings: SecretFinding[];
        try {
          findings = scanStagedDiff(ctx.cwd, policy);
        } catch (err) {
          return { block: true, reason: `${policy.displayName} secret scan failed (fail-closed): ${String(err)}` };
        }
        if (findings.length) return { block: true, reason: formatSecrets(findings, policy.displayName) };

        // Commit gate: full check suite must pass.
        if (ctx.hasUI) ctx.ui.setStatus(policy.uiKey, "running pre-commit checks…");
        const results = runChecks(ctx.cwd, detectStack(ctx.cwd, policy).checks, policy.checks.timeoutMs);
        if (ctx.hasUI) ctx.ui.setStatus(policy.uiKey, "gates: on");
        const failed = results.filter((r) => !r.ok);
        if (failed.length) {
          return {
            block: true,
            reason: `Commit blocked by ${policy.displayName}.
Why: one or more required checks failed before the commit could proceed.
${formatFailures(results)}`,
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
      if (findings.length) return { block: true, reason: formatSecrets(findings, policy.displayName) };
      return;
    }

    if (gatesEnabled && isToolCallEventType("edit", event)) {
      // edit input: { path: string; edits: { oldText: string; newText: string }[] }
      const combined = event.input.edits.map((e) => e.newText).join("\n");
      const findings = scanForSecrets(combined, policy);
      if (findings.length) return { block: true, reason: formatSecrets(findings, policy.displayName) };
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
      pi.sendMessage(
        {
          customType: "aegis-harness-done-gate",
          content: `Aegis Harness done gate:
Why: you modified code this session but there was no passing test run afterwards.
Fix: run the project's test suite now. If tests fail, fix them. If no test covers your change, add one first.`,
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
