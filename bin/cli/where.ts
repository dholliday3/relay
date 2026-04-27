/**
 * `relay where` — resolves and prints the .relay/ directory the CLI
 * would operate on if run from the given cwd. Exists primarily as the
 * worktree-correctness debugging tool: agents can call it after `cd`-ing
 * into a worktree to confirm relay is pointed at the right tree.
 *
 * Mirrors the logic `bin/relay.ts` uses for the legacy commands so the
 * resolution rule stays in one place — `findRelayDirWithWorktree` from
 * @relay/core is the single source of truth.
 */

import { resolve } from "node:path";
import { findRelayDirWithWorktree } from "../../packages/core/src/worktree.ts";
import type { WhereCommand } from "./parse.ts";

export interface WhereResult {
  /** Cwd actually used for resolution (after applying --dir / positional). */
  cwd: string;
  /** Absolute path to the resolved .relay/, or null if none was found. */
  relayDir: string | null;
  /** True when cwd is inside a linked git worktree (not the main checkout). */
  isWorktree: boolean;
  /**
   * True when the resolution fell back to the main checkout's .relay/
   * because `worktreeMode: shared` is set (or no .relay/ in the worktree).
   */
  usesMainRootRelayDir: boolean;
}

export async function resolveWhere(cmd: WhereCommand): Promise<WhereResult> {
  const cwd = cmd.dir ? resolve(cmd.dir) : process.cwd();
  const { relayDir, isWorktree, usesMainRootRelayDir } =
    await findRelayDirWithWorktree(cwd);
  return { cwd, relayDir, isWorktree, usesMainRootRelayDir };
}

export function formatWhereText(r: WhereResult): string {
  const lines: string[] = [];
  if (r.relayDir) {
    lines.push(`Relay directory: ${r.relayDir}`);
  } else {
    lines.push("Relay directory: (not found — run 'relay init' to create one)");
  }
  lines.push(`Cwd: ${r.cwd}`);
  lines.push(`Worktree: ${r.isWorktree ? "yes" : "no"}`);
  if (r.isWorktree) {
    lines.push(
      `Mode: ${r.usesMainRootRelayDir ? "shared (using main checkout's .relay/)" : "local (using this worktree's .relay/)"}`,
    );
  }
  return lines.join("\n");
}

/**
 * Run the `where` command. Returns an exit code: 0 when a .relay/ was
 * resolved, 1 when none was found (mirrors the broader CLI convention
 * that "thing not found" is a 1, not an internal error 2).
 */
export async function runWhere(cmd: WhereCommand): Promise<number> {
  const result = await resolveWhere(cmd);

  if (cmd.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(formatWhereText(result));
  }

  return result.relayDir ? 0 : 1;
}
