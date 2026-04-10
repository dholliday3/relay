import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const exec = promisify(execFile);

/**
 * Detect if the current directory is inside a git worktree (not the main
 * checkout). Returns the main repo's root if so, null otherwise.
 */
export async function resolveWorktreeRoot(
  cwd: string,
): Promise<string | null> {
  try {
    // git-common-dir returns the shared .git directory for all worktrees.
    // In the main checkout, this equals `git rev-parse --git-dir`.
    // In a linked worktree, it points to the main repo's .git.
    const { stdout: commonDir } = await exec(
      "git",
      ["rev-parse", "--git-common-dir"],
      { cwd },
    );
    const { stdout: gitDir } = await exec(
      "git",
      ["rev-parse", "--git-dir"],
      { cwd },
    );

    const resolvedCommon = resolve(cwd, commonDir.trim());
    const resolvedGitDir = resolve(cwd, gitDir.trim());

    if (resolvedCommon !== resolvedGitDir) {
      // We're in a linked worktree. The main repo root is the parent of
      // the common .git directory.
      return resolve(resolvedCommon, "..");
    }
  } catch {
    // Not in a git repo at all
  }

  return null;
}

/**
 * Check whether a directory contains a valid .tasks/ directory.
 */
async function hasTasksDir(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, ".tasks"));
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find the .tasks/ directory, with worktree awareness.
 *
 * In a linked git worktree, this checks the main repo's root first.
 * If the main repo has a .tasks/ directory, we use that (artifacts are
 * shared across worktrees, not duplicated). Otherwise falls back to
 * walking up from `startDir` as usual.
 */
export async function findTasksDirWithWorktree(
  startDir: string,
): Promise<{ tasksDir: string | null; isWorktree: boolean }> {
  const mainRoot = await resolveWorktreeRoot(startDir);

  if (mainRoot) {
    // We're in a linked worktree — check the main repo first
    if (await hasTasksDir(mainRoot)) {
      return {
        tasksDir: join(mainRoot, ".tasks"),
        isWorktree: true,
      };
    }
  }

  // Standard walk-up search (same as before, but done here for completeness)
  let dir = resolve(startDir);
  const { dirname } = await import("node:path");
  while (true) {
    if (await hasTasksDir(dir)) {
      return { tasksDir: join(dir, ".tasks"), isWorktree: false };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { tasksDir: null, isWorktree: false };
}
