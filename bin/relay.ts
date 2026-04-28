#!/usr/bin/env bun

import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";
import {
  initRelay,
  codexMcpInstructions,
} from "../packages/core/src/init.ts";
import { findRelayDirWithWorktree } from "../packages/core/src/worktree.ts";
import { runOnboard } from "../packages/core/src/onboard.ts";
import { runUpgrade } from "../packages/core/src/upgrade.ts";
import { startMcpServer } from "../packages/server/src/mcp.ts";
import { startServer } from "../packages/server/src/index.ts";
import { isAddressInUseError } from "../packages/server/src/port-bind.ts";
import {
  describePortSquatter,
  formatPortInUseMessage,
} from "../packages/server/src/port-diagnose.ts";
import { parseArgv, helpText } from "./cli/parse.ts";
import type { Command } from "./cli/parse.ts";
import { runWhere } from "./cli/where.ts";
import { resolveRelayDirs, isRelayDirsError } from "./cli/relay-dir.ts";
import {
  runTaskList,
  runTaskGet,
  runTaskCreate,
  runTaskUpdate,
  runTaskDelete,
  runTaskLinkRef,
  runTaskAddSubtask,
  runTaskCompleteSubtask,
  runTaskReorder,
} from "./cli/task.ts";
import type { HandlerResult } from "./cli/task.ts";
import {
  runPlanList,
  runPlanGet,
  runPlanCreate,
  runPlanUpdate,
  runPlanDelete,
  runPlanLinkTask,
  runPlanCutTasks,
} from "./cli/plan.ts";
import {
  runDocList,
  runDocGet,
  runDocCreate,
  runDocUpdate,
  runDocDelete,
} from "./cli/doc.ts";
import { runDoctorCmd, runSyncCmd } from "./cli/maintenance.ts";
import { addRelayAllowlist } from "./cli/init-allowlist.ts";
// Embed SKILL.md via Bun's `with { type: "file" }` import attribute.
// In dev mode this returns the real filesystem path; inside a compiled
// binary it returns a `$bunfs/` virtual path. Both forms are readable
// via Bun.file() and node:fs's readFile(), which is how initRelay
// copies the skill into a target project's .claude/skills/ directory.
import SKILL_SOURCE from "../skills/relay/SKILL.md" with { type: "file" };

/** Walk up from startDir to find a .relay/ directory, with worktree awareness. */
async function findRelayDir(startDir: string): Promise<string | null> {
  const { relayDir, usesMainRootRelayDir } = await findRelayDirWithWorktree(startDir);
  if (relayDir && usesMainRootRelayDir) {
    console.error(
      `Detected git worktree with shared artifacts enabled — using main checkout artifacts at ${relayDir}`,
    );
  }
  return relayDir;
}

/** Resolve a user-provided path to a .relay/ directory */
async function resolveRelayDir(givenPath: string): Promise<string> {
  const resolved = resolve(givenPath);

  // If the path itself is a .relay directory, use it directly
  if (basename(resolved) === ".relay") {
    try {
      const s = await stat(resolved);
      if (s.isDirectory()) return resolved;
    } catch {
      // Doesn't exist yet — that's OK for init
    }
    return resolved;
  }

  // Check if it contains a .relay subdirectory
  const withRelay = join(resolved, ".relay");
  try {
    const s = await stat(withRelay);
    if (s.isDirectory()) return withRelay;
  } catch {
    // No .relay inside — assume the path IS the relay dir
  }

  return withRelay;
}

/**
 * Resolve the path to the bundled SKILL.md. Just returns the embedded
 * path from the top-of-file `with { type: "file" }` import — Bun handles
 * both dev-mode (real path) and compiled-binary (`$bunfs/`) resolution
 * transparently, so the caller doesn't need to care which mode we're in.
 */
function resolveSkillSourcePath(): string {
  return SKILL_SOURCE;
}

/** Print a summary of what init created and next-step instructions. */
function printInitSummary(
  baseDir: string,
  result: Awaited<ReturnType<typeof initRelay>>,
): void {
  console.log(`Initialized relay at ${result.relayDir}`);

  const created: string[] = [];
  if (result.wroteSkill) {
    created.push("  .claude/skills/relay/SKILL.md");
    created.push("  .agents/skills/relay/SKILL.md");
  }
  if (result.wroteMcpConfig) {
    created.push("  .mcp.json");
  } else if (result.mergedMcpConfig) {
    created.push("  .mcp.json (merged relay entry)");
  }

  if (created.length > 0) {
    console.log("\nAgent integration files:");
    for (const line of created) console.log(line);
  }

  if (result.devMode) {
    console.log(
      `\nDetected relay source repo — .mcp.json uses dev-mode command (bun bin/relay.ts --mcp).`,
    );
  }

  console.log("\nGet started:");
  console.log("  relay task list                       # see what's ready to work on");
  console.log("  relay task create --title \"…\"          # create a task");
  console.log("  relay where                           # confirm which .relay/ is active");
  console.log("  relay --help                          # full surface");
  console.log(
    "\nThe relay skill at .claude/skills/relay/SKILL.md walks Claude Code through the workflow.",
  );
  console.log(
    "Existing .mcp.json setups still work; the CLI is the recommended path.",
  );
  console.log("\nFor non-Claude-Code agents (e.g. Codex), the MCP server is wired via:");
  console.log(codexMcpInstructions());
  console.log(
    `\nNext: run 'relay onboard' to add agent instructions to CLAUDE.md.`,
  );
}

async function runInit(cmd: {
  dir?: string;
  allowlist?: boolean;
}): Promise<void> {
  const baseDir = cmd.dir ? resolve(cmd.dir) : process.cwd();
  const result = await initRelay({
    baseDir,
    skillSourcePath: resolveSkillSourcePath(),
  });
  printInitSummary(baseDir, result);

  // Decide whether to add the Bash(relay *) allowlist entry. The default
  // is to prompt when stdin is a TTY (interactive run) and skip
  // otherwise (agent or script invocation), unless the user passed an
  // explicit --allowlist / --no-allowlist flag.
  let writeAllowlist = cmd.allowlist;
  if (writeAllowlist === undefined) {
    if (process.stdin.isTTY) {
      const answer = prompt(
        "\nAdd 'Bash(relay *)' to .claude/settings.json so Claude Code skips per-call permission prompts? (Y/n) ",
      );
      writeAllowlist =
        answer === null || answer === "" || /^y/i.test(answer);
    } else {
      writeAllowlist = false;
    }
  }

  if (writeAllowlist) {
    try {
      const r = await addRelayAllowlist(baseDir);
      switch (r.action) {
        case "created":
          console.log(`\nWrote ${r.file} with Bash(relay *) allowlist entry.`);
          break;
        case "added":
          console.log(`\nAdded Bash(relay *) to ${r.file}.`);
          break;
        case "already-present":
          console.log(`\nBash(relay *) already in ${r.file}.`);
          break;
      }
    } catch (err) {
      console.error(
        `\nCouldn't update .claude/settings.json: ${(err as Error).message}`,
      );
      console.error(
        "  Add this manually to skip per-call permission prompts:",
      );
      console.error('  { "permissions": { "allow": ["Bash(relay *)"] } }');
    }
  } else if (cmd.allowlist === undefined) {
    // Non-interactive run with no explicit flag — point the user at
    // the manual fix so they're not stuck on permission prompts.
    console.log(
      "\nTo skip Claude Code permission prompts on every relay call, add:",
    );
    console.log(
      '  { "permissions": { "allow": ["Bash(relay *)"] } }  → .claude/settings.json',
    );
    console.log("Or re-run: relay init --allowlist");
  }
}

async function runOnboardCmd(cmd: {
  dir?: string;
  check: boolean;
  stdout: boolean;
  json: boolean;
}): Promise<void> {
  const baseDir = cmd.dir ? resolve(cmd.dir) : process.cwd();
  const result = await runOnboard({
    baseDir,
    check: cmd.check,
    stdout: cmd.stdout,
  });

  // --stdout already printed the wrapped snippet; nothing more to say.
  if (result.action === "stdout") return;

  if (cmd.json) {
    // Mirror seeds' envelope shape: always success=true on the happy
    // path, command name, plus whatever action-specific fields exist.
    const envelope: Record<string, unknown> = {
      success: true,
      command: "onboard",
      action: result.action,
    };
    if ("file" in result) envelope.file = result.file;
    if ("status" in result) envelope.status = result.status;
    console.log(JSON.stringify(envelope));
  } else {
    switch (result.action) {
      case "created":
        console.log(`Created ${result.file} with relay section`);
        break;
      case "updated":
        console.log(`Updated relay section in ${result.file}`);
        break;
      case "unchanged":
        console.log(
          `Relay section is already up to date (${result.file})`,
        );
        break;
      case "appended":
        console.log(`Added relay section to ${result.file}`);
        break;
      case "checked":
        console.log(
          `Status: ${result.status}${result.file ? ` (${result.file})` : " (no candidate file)"}`,
        );
        break;
    }
  }

  // --check mode: exit 1 when the section is missing or outdated so CI
  // can use it as a freshness gate (mirrors seeds' sd onboard --check).
  if (result.action === "checked" && result.status !== "current") {
    process.exitCode = 1;
  }
}

async function runUpgradeCmd(cmd: {
  check: boolean;
  json: boolean;
}): Promise<void> {
  // Catch network/spawn failures cleanly — the 404-before-first-release
  // case and any other runUpgrade error should surface as a one-line
  // message, not a stack trace. In --json mode we wrap the error in the
  // envelope shape so scripts can parse it.
  let result: Awaited<ReturnType<typeof runUpgrade>>;
  try {
    result = await runUpgrade({ check: cmd.check });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cmd.json) {
      console.log(
        JSON.stringify({ success: false, command: "upgrade", error: msg }),
      );
    } else {
      console.error(`relay upgrade failed: ${msg}`);
    }
    process.exit(1);
  }

  if (cmd.json) {
    // Mirror seeds' envelope shape across all upgrade actions.
    const envelope: Record<string, unknown> = {
      success: true,
      command: "upgrade",
      action: result.action,
    };
    if (result.action === "checked") {
      envelope.current = result.current;
      envelope.latest = result.latest;
      envelope.upToDate = result.upToDate;
    } else if (result.action === "unchanged") {
      envelope.current = result.current;
      envelope.latest = result.latest;
    } else if (result.action === "upgraded") {
      envelope.previous = result.previous;
      envelope.latest = result.latest;
    }
    console.log(JSON.stringify(envelope));
  } else {
    switch (result.action) {
      case "checked":
        if (result.upToDate) {
          console.log(`Already up to date (${result.current})`);
        } else {
          console.log(
            `Update available: ${result.current} → ${result.latest}`,
          );
          console.log(
            `Run 'relay upgrade' to install the latest release.`,
          );
        }
        break;
      case "unchanged":
        console.log(`Already up to date (${result.current})`);
        break;
      case "upgraded":
        console.log(
          `Upgraded relay from ${result.previous} to ${result.latest}`,
        );
        break;
    }
  }

  // --check mode: exit 1 when we're behind the latest release so CI
  // and shell prompt integrations can use it as a staleness gate.
  if (result.action === "checked" && !result.upToDate) {
    process.exitCode = 1;
  }
}

async function runServe(cmd: {
  dir?: string;
  port?: number;
  noUi: boolean;
  mcp: boolean;
}): Promise<void> {
  // --- Resolve .relay/ directory ---
  let relayDir: string | null = null;

  if (cmd.dir) {
    relayDir = await resolveRelayDir(cmd.dir);
  } else {
    relayDir = await findRelayDir(process.cwd());
  }

  if (!relayDir) {
    console.log("No .relay/ directory found.");
    const answer = prompt("Would you like to initialize one here? (y/N) ");
    if (answer?.toLowerCase() === "y") {
      const result = await initRelay({
        baseDir: process.cwd(),
        skillSourcePath: resolveSkillSourcePath(),
      });
      relayDir = result.relayDir;
      printInitSummary(process.cwd(), result);
    } else {
      console.log("Run 'relay init' to create a .relay/ directory.");
      process.exit(1);
    }
  }

  // Derive subdirectories from the .relay/ root
  const tasksDir = join(relayDir, "tasks");
  const plansDir = join(relayDir, "plans");
  const docsDir = join(relayDir, "docs");

  // --- MCP mode ---
  if (cmd.mcp) {
    // Soft deprecation: the MCP server is the legacy path now. Its
    // long-lived process resolves .relay/ once at startup, which is
    // brittle in worktree-heavy workflows — a worktree created mid-
    // session writes to the wrong tree silently. The CLI walks up
    // from cwd on every call. Emit one stderr line so anyone who
    // wires this up notices, but don't fail-stop — this is the
    // "still works for non-worktree workflows" path.
    console.error(
      `Relay MCP server (stdio) — tasks: ${tasksDir}, plans: ${plansDir}, docs: ${docsDir}`,
    );
    console.error(
      `[relay] note: the MCP server is the legacy integration path. ` +
        `It resolves .relay/ once from this cwd (${relayDir}); ` +
        `agents that cd into a git worktree will still write here. ` +
        `Prefer 'relay <task|plan|doc> …' over MCP tools — every CLI ` +
        `call resolves .relay/ from the agent's actual cwd.`,
    );
    await startMcpServer(relayDir, tasksDir, plansDir, docsDir);
    return;
  }

  // --- HTTP server mode ---
  const uiDistDir = cmd.noUi
    ? undefined
    : resolve(join(import.meta.dir, "../packages/ui/dist"));

  // Absolute path to this script — passed through so the copilot manager can
  // wire up an MCP config that re-invokes us in --mcp mode for tool access.
  //
  // In a `bun build --compile` standalone binary, `import.meta.url` resolves
  // to a `$bunfs/…` virtual path. That path is only readable by the parent
  // Bun process that created the embedded filesystem — a freshly spawned
  // `bun run $bunfs/…` child cannot open it, which silently breaks the
  // copilot's MCP server. Detect that case and hand the compiled binary
  // path through as `execPath`; the copilot manager will emit a config
  // that re-invokes the binary itself (`execPath --mcp --dir …`) instead
  // of `bun run <binPath>`.
  const binPath = fileURLToPath(import.meta.url);
  const isCompiledBinary = binPath.includes("$bunfs");
  const execPath = isCompiledBinary ? process.execPath : undefined;

  // Default start port 4242 with auto-increment on EADDRINUSE. Multi-repo
  // setups get a deterministic sequence (4242 → 4243 → …) instead of random
  // OS-assigned ports. When the user passes --port explicitly, disable
  // auto-increment so a collision surfaces clearly instead of being hidden.
  //
  // On the explicit-port path, EADDRINUSE is the most common "first contact"
  // failure — usually an orphaned `bun dev` from a previous session. Catch it
  // here and replace the stack trace with a friendly message that identifies
  // the squatter by PID and shows the exact `kill` command to run.
  const serverPort = cmd.port ?? 4242;
  let handle: ReturnType<typeof startServer>;
  try {
    handle = startServer({
      relayDir,
      tasksDir,
      plansDir,
      docsDir,
      port: serverPort,
      autoIncrement: cmd.port == null,
      staticDir: uiDistDir,
      binPath,
      execPath,
    });
  } catch (err) {
    if (isAddressInUseError(err)) {
      const squatter = await describePortSquatter(serverPort);
      console.error(formatPortInUseMessage(serverPort, squatter));
      process.exit(1);
    }
    throw err;
  }

  if (handle.triedPorts.length > 0) {
    console.log(
      `Relay server listening on http://localhost:${handle.port} ` +
        `(auto-selected; ${handle.triedPorts.join(", ")} in use)`,
    );
  } else {
    console.log(`Relay server listening on http://localhost:${handle.port}`);
  }
  console.log(`Relay directory: ${relayDir}`);
  if (!cmd.noUi && uiDistDir) {
    console.log(`UI: http://localhost:${handle.port}`);
  }
}

/**
 * Centralizes the "resolve .relay/, dispatch handler, write output" flow
 * for every noun command (task / plan / doc / doctor / sync). Keeps the
 * exit-code, stdout, and stderr handling in one place so each handler
 * can stay a pure function returning a HandlerResult.
 */
async function runWithRelayDirs(
  run: (dirs: {
    relayDir: string;
    tasksDir: string;
    plansDir: string;
    docsDir: string;
  }) => Promise<HandlerResult>,
): Promise<void> {
  const dirs = await resolveRelayDirs();
  if (isRelayDirsError(dirs)) {
    console.error(`relay: ${dirs.error}`);
    process.exit(1);
  }
  const result = await run(dirs);
  if (result.stdout) process.stdout.write(result.stdout + "\n");
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

async function main(): Promise<void> {
  const cmd: Command = parseArgv(process.argv);

  switch (cmd.kind) {
    case "help":
      console.log(helpText(cmd.topic));
      return;
    case "error":
      console.error(`relay: ${cmd.message}`);
      if (cmd.showHelp) {
        console.error("");
        console.error(helpText());
      }
      process.exit(1);
      return;
    case "init":
      await runInit(cmd);
      return;
    case "onboard":
      await runOnboardCmd(cmd);
      return;
    case "upgrade":
      await runUpgradeCmd(cmd);
      return;
    case "where": {
      const code = await runWhere(cmd);
      if (code !== 0) process.exitCode = code;
      return;
    }
    case "serve":
      await runServe(cmd);
      return;
    case "task-list":
      await runWithRelayDirs((d) => runTaskList(cmd, d));
      return;
    case "task-get":
      await runWithRelayDirs((d) => runTaskGet(cmd, d));
      return;
    case "task-create":
      await runWithRelayDirs((d) => runTaskCreate(cmd, d));
      return;
    case "task-update":
      await runWithRelayDirs((d) => runTaskUpdate(cmd, d));
      return;
    case "task-delete":
      await runWithRelayDirs((d) => runTaskDelete(cmd, d));
      return;
    case "task-link-ref":
      await runWithRelayDirs((d) => runTaskLinkRef(cmd, d));
      return;
    case "task-add-subtask":
      await runWithRelayDirs((d) => runTaskAddSubtask(cmd, d));
      return;
    case "task-complete-subtask":
      await runWithRelayDirs((d) => runTaskCompleteSubtask(cmd, d));
      return;
    case "task-reorder":
      await runWithRelayDirs((d) => runTaskReorder(cmd, d));
      return;
    case "plan-list":
      await runWithRelayDirs((d) =>
        runPlanList(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "plan-get":
      await runWithRelayDirs((d) =>
        runPlanGet(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "plan-create":
      await runWithRelayDirs((d) =>
        runPlanCreate(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "plan-update":
      await runWithRelayDirs((d) =>
        runPlanUpdate(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "plan-delete":
      await runWithRelayDirs((d) =>
        runPlanDelete(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "plan-link-task":
      await runWithRelayDirs((d) =>
        runPlanLinkTask(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "plan-cut-tasks":
      await runWithRelayDirs((d) =>
        runPlanCutTasks(cmd, { rootDir: d.relayDir, plansDir: d.plansDir }),
      );
      return;
    case "doc-list":
      await runWithRelayDirs((d) =>
        runDocList(cmd, { rootDir: d.relayDir, docsDir: d.docsDir }),
      );
      return;
    case "doc-get":
      await runWithRelayDirs((d) =>
        runDocGet(cmd, { rootDir: d.relayDir, docsDir: d.docsDir }),
      );
      return;
    case "doc-create":
      await runWithRelayDirs((d) =>
        runDocCreate(cmd, { rootDir: d.relayDir, docsDir: d.docsDir }),
      );
      return;
    case "doc-update":
      await runWithRelayDirs((d) =>
        runDocUpdate(cmd, { rootDir: d.relayDir, docsDir: d.docsDir }),
      );
      return;
    case "doc-delete":
      await runWithRelayDirs((d) =>
        runDocDelete(cmd, { rootDir: d.relayDir, docsDir: d.docsDir }),
      );
      return;
    case "doctor":
      await runWithRelayDirs((d) => runDoctorCmd(cmd, d));
      return;
    case "sync":
      await runWithRelayDirs((d) => runSyncCmd(cmd, d));
      return;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
