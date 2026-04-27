/**
 * Handlers for `relay doctor` and `relay sync`. Wraps the @relay/core
 * runDoctor/sync entrypoints; output mirrors the MCP server's surface.
 *
 * doctor exits with 1 when any FAIL severity remains after the run
 * (with --fix, that means "couldn't be auto-fixed"). This is what
 * makes it usable as a CI integrity gate: a green doctor run is
 * actually green.
 */

import { dirname } from "node:path";
import {
  runDoctor,
  formatDoctorReport,
  sync,
} from "../../packages/core/src/index.ts";
import type { DoctorCommand, SyncCommand } from "./parse.ts";
import type { HandlerResult } from "./task.ts";

export interface MaintenanceCtx {
  /** The .relay/ directory itself. */
  relayDir: string;
  tasksDir: string;
  plansDir: string;
  docsDir: string;
}

export async function runDoctorCmd(
  cmd: DoctorCommand,
  ctx: MaintenanceCtx,
): Promise<HandlerResult> {
  // doctor's projectRoot is the parent of .relay/ — that's where it
  // looks for .gitattributes etc.
  const projectRoot = dirname(ctx.relayDir);

  const result = await runDoctor({
    tasksDir: ctx.tasksDir,
    plansDir: ctx.plansDir,
    docsDir: ctx.docsDir,
    projectRoot,
    fix: cmd.fix,
  });

  // Exit non-zero when there are unresolved failures. In --fix mode,
  // FAIL items that were fixable are kept in the report (paired with
  // a follow-up "Fixed: …" OK item) for visibility — but they don't
  // count as failures anymore because we addressed them. Without
  // --fix, any FAIL trips the exit code. WARN never trips it.
  const hasUnresolvedFailures = result.items.some(
    (i) => i.severity === "fail" && (!cmd.fix || !i.fixable),
  );
  const exitCode = hasUnresolvedFailures ? 1 : 0;

  if (cmd.json) {
    return {
      stdout: JSON.stringify({
        items: result.items,
        fixed: result.fixed,
        passed: result.items.filter((i) => i.severity === "pass").length,
        warnings: result.items.filter((i) => i.severity === "warn").length,
        failures: result.items.filter((i) => i.severity === "fail").length,
      }),
      exitCode,
    };
  }

  return { stdout: formatDoctorReport(result), exitCode };
}

export async function runSyncCmd(
  cmd: SyncCommand,
  ctx: MaintenanceCtx,
): Promise<HandlerResult> {
  const projectRoot = dirname(ctx.relayDir);

  const result = await sync({
    tasksDir: ctx.tasksDir,
    plansDir: ctx.plansDir,
    docsDir: ctx.docsDir,
    projectRoot,
    dryRun: cmd.dryRun,
    push: cmd.push,
  });

  if (cmd.json) {
    return {
      stdout: JSON.stringify({
        committed: result.committed,
        message: result.message,
        pushed: result.pushed,
        dryRun: result.dryRun,
      }),
      exitCode: 0,
    };
  }

  if (result.committed.length === 0) {
    return { stdout: "No artifact changes to sync.", exitCode: 0 };
  }

  const lines: string[] = [];
  lines.push(result.dryRun ? "Dry run — would commit:" : "Committed:");
  lines.push(`  Message: ${result.message}`);
  lines.push(`  Files (${result.committed.length}):`);
  for (const f of result.committed) {
    lines.push(`    ${f}`);
  }
  if (result.pushed) lines.push("  Pushed to remote.");
  return { stdout: lines.join("\n"), exitCode: 0 };
}
