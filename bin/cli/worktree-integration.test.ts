import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

/**
 * The regression test that motivated PLAN-010.
 *
 * Setup:
 *   - tmpdir is a git repo with .relay/ + tasks/ + counter
 *   - tmpdir/feature is a linked worktree of the same repo, with its
 *     own .relay/ (worktreeMode: local — the default)
 *
 * Assertion:
 *   - `relay task create` from the worktree writes into the
 *     worktree's .relay/tasks/, NOT the main checkout's
 *   - `relay where` from each location reports its own .relay/
 *
 * The MCP server failed this scenario (long-lived, baked cwd at
 * startup). The CLI passes by walking up from cwd on every call.
 */

const RELAY_BIN = fileURLToPath(
  new URL("../relay.ts", import.meta.url),
);

let mainRepo: string;
let worktree: string;

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout;
}

async function setupRelayDir(dir: string): Promise<void> {
  await mkdir(join(dir, ".relay", "tasks"), { recursive: true });
  await mkdir(join(dir, ".relay", "plans"), { recursive: true });
  await mkdir(join(dir, ".relay", "docs"), { recursive: true });
  await writeFile(join(dir, ".relay", "config.yaml"), "prefix: TASK\n");
}

beforeEach(async () => {
  // realpath resolves symlinks (matters on macOS where /tmp → /private/tmp);
  // the CLI's findRelayDirWithWorktree returns the canonical path, so
  // we want all our own assertions to use canonical paths too.
  mainRepo = await realpath(await mkdtemp(join(tmpdir(), "relay-wt-main-")));

  // Init main repo as git + scaffold .relay/.
  await git(mainRepo, "init");
  await git(mainRepo, "config", "user.email", "test@test.com");
  await git(mainRepo, "config", "user.name", "Test");
  await setupRelayDir(mainRepo);
  await git(mainRepo, "add", ".relay");
  await git(mainRepo, "commit", "-m", "init relay");

  // Create a worktree off main repo at sibling path.
  worktree = `${mainRepo}-worktree`;
  await git(mainRepo, "worktree", "add", worktree, "-b", "feature");
  // The worktree shares git history, so it picks up the committed
  // .relay/config.yaml — but git doesn't track empty directories, so
  // tasks/, plans/, docs/ don't materialize on checkout. Re-scaffold
  // them on the worktree side. (A real project would have at least
  // one tracked artifact in each, so this is purely a test-fixture
  // detail.)
  await mkdir(join(worktree, ".relay", "tasks"), { recursive: true });
  await mkdir(join(worktree, ".relay", "plans"), { recursive: true });
  await mkdir(join(worktree, ".relay", "docs"), { recursive: true });
});

afterEach(async () => {
  // Remove the worktree first so the main repo's metadata stays
  // consistent if rm fails.
  try {
    await git(mainRepo, "worktree", "remove", "--force", worktree);
  } catch {
    // worktree may not be in the metadata if mainRepo is already gone
  }
  await rm(mainRepo, { recursive: true, force: true });
  await rm(worktree, { recursive: true, force: true });
});

async function relay(
  cwd: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await exec("bun", [RELAY_BIN, ...args], {
      cwd,
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

describe("worktree integration — PLAN-010 regression test", () => {
  test("relay where reports the active worktree's .relay/", async () => {
    const main = await relay(mainRepo, "where", "--json");
    const wt = await relay(worktree, "where", "--json");

    expect(main.code).toBe(0);
    expect(wt.code).toBe(0);

    const mainJson = JSON.parse(main.stdout);
    const wtJson = JSON.parse(wt.stdout);

    expect(mainJson.relayDir).toBe(join(mainRepo, ".relay"));
    expect(mainJson.isWorktree).toBe(false);

    expect(wtJson.relayDir).toBe(join(worktree, ".relay"));
    expect(wtJson.isWorktree).toBe(true);
    expect(wtJson.usesMainRootRelayDir).toBe(false);
  });

  test("relay task create from a worktree writes into the worktree's .relay/", async () => {
    // Create a task from inside the worktree.
    const result = await relay(
      worktree,
      "task",
      "create",
      "--title",
      "from worktree",
      "--json",
    );
    expect(result.code).toBe(0);
    const created = JSON.parse(result.stdout);
    expect(created.title).toBe("from worktree");

    // Listing from the worktree should see it.
    const wtList = await relay(worktree, "task", "list", "--json");
    expect(JSON.parse(wtList.stdout).map((t: { title: string }) => t.title))
      .toEqual(["from worktree"]);

    // Listing from the main repo should NOT — its .relay/ is a
    // separate working-tree checkout.
    const mainList = await relay(mainRepo, "task", "list", "--json");
    expect(JSON.parse(mainList.stdout)).toEqual([]);
  });

  test("subdirectories inside a worktree still resolve to the worktree's .relay/", async () => {
    // Make a deeper subdir inside the worktree (e.g. "src/feature/foo")
    // and run relay from there. The walk-up should still land at the
    // worktree's .relay/, not anything outside.
    const deep = join(worktree, "src", "feature", "foo");
    await mkdir(deep, { recursive: true });

    const where = await relay(deep, "where", "--json");
    expect(where.code).toBe(0);
    const json = JSON.parse(where.stdout);
    expect(json.relayDir).toBe(join(worktree, ".relay"));
    expect(json.isWorktree).toBe(true);
  });

  test("worktreeMode: shared routes worktree writes to the main checkout", async () => {
    // Switch the worktree's config (which is the same file as the main
    // repo's .relay/config.yaml on disk because git checked it out
    // from the same commit) — actually no: each worktree has its own
    // .relay/config.yaml after the initial commit. Modify the worktree's
    // copy.
    await writeFile(
      join(worktree, ".relay", "config.yaml"),
      "prefix: TASK\nworktreeMode: shared\n",
    );

    const where = await relay(worktree, "where", "--json");
    const json = JSON.parse(where.stdout);
    expect(json.usesMainRootRelayDir).toBe(true);
    expect(json.relayDir).toBe(join(mainRepo, ".relay"));

    // Creating a task from the worktree now lands in the main repo's
    // .relay/ — the configured behavior.
    await relay(
      worktree,
      "task",
      "create",
      "--title",
      "shared mode",
      "--json",
    );

    const mainList = await relay(mainRepo, "task", "list", "--json");
    expect(JSON.parse(mainList.stdout).map((t: { title: string }) => t.title))
      .toEqual(["shared mode"]);
  });
});
