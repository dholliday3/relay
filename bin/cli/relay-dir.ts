/**
 * Resolves the .relay/ directory for a noun command (task / plan / doc /
 * doctor / sync). Per-invocation: every CLI call walks up from the
 * agent's actual cwd, so worktrees Just Work.
 *
 * If `.relay/` can't be found, returns an error result with a hint
 * pointing at `relay init`. Callers shouldn't crash — they should print
 * the error and exit 1, the same way `runWhere` does.
 */

import { join, resolve } from "node:path";
import { findRelayDirWithWorktree } from "../../packages/core/src/worktree.ts";

export interface RelayDirs {
  relayDir: string;
  tasksDir: string;
  plansDir: string;
  docsDir: string;
  isWorktree: boolean;
  usesMainRootRelayDir: boolean;
}

export interface RelayDirsError {
  error: string;
}

export type RelayDirsResult = RelayDirs | RelayDirsError;

export async function resolveRelayDirs(
  cwdOrDir?: string,
): Promise<RelayDirsResult> {
  const startDir = cwdOrDir ? resolve(cwdOrDir) : process.cwd();
  const { relayDir, isWorktree, usesMainRootRelayDir } =
    await findRelayDirWithWorktree(startDir);

  if (!relayDir) {
    return {
      error: `No .relay/ directory found from ${startDir}. Run 'relay init' to create one.`,
    };
  }

  return {
    relayDir,
    tasksDir: join(relayDir, "tasks"),
    plansDir: join(relayDir, "plans"),
    docsDir: join(relayDir, "docs"),
    isWorktree,
    usesMainRootRelayDir,
  };
}

export function isRelayDirsError(r: RelayDirsResult): r is RelayDirsError {
  return "error" in r;
}
