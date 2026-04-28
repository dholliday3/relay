import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

/**
 * End-to-end smoke against a real `bun build --compile` artifact.
 *
 * Closes the gap that all the other CLI tests had: they run the .ts
 * source via Bun directly. The compiled binary uses a different path
 * for embedded assets — Bun's `with { type: "file" }` imports resolve
 * to `$bunfs/` virtual paths inside the binary, which only the parent
 * Bun process can read. SKILL.md is the canary here: it's imported as
 * a file attribute and then copied into the target project on init.
 *
 * If the compile path silently broke (e.g. someone added a runtime
 * `await import("…")` the bundler can't resolve, or referenced a
 * non-bundled file), this test catches it; the source-level tests
 * wouldn't.
 *
 * Build is ~250ms locally — fast enough to live in the default test
 * run. Cleanup deletes the binary on exit.
 */

const CLI_ENTRY = fileURLToPath(new URL("../relay.ts", import.meta.url));
let buildDir: string;
let binaryPath: string;

beforeAll(async () => {
  buildDir = await mkdtemp(join(tmpdir(), "relay-binary-"));
  binaryPath = join(buildDir, "relay-test");

  // CLI-only compile: skips the UI-bundle step from build-binary.sh
  // because the UI is never loaded by any CLI subcommand. The release
  // artifact additionally embeds the UI dist; if the CLI path compiles
  // here, the with-UI path will too (UI is purely additive).
  await exec("bun", [
    "build",
    CLI_ENTRY,
    "--compile",
    "--outfile",
    binaryPath,
  ]);
});

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
});

async function runBinary(
  cwd: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await exec(binaryPath, args, { cwd });
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

describe("compiled binary smoke", () => {
  test("--help prints usage and exits 0", async () => {
    const { stdout, code } = await runBinary(buildDir, "--help");
    expect(code).toBe(0);
    expect(stdout).toContain("Usage: relay");
    expect(stdout).toContain("task");
    expect(stdout).toContain("plan");
    expect(stdout).toContain("doc");
  });

  test("`relay help task` routes to the topic", async () => {
    const { stdout, code } = await runBinary(buildDir, "help", "task");
    expect(code).toBe(0);
    expect(stdout).toContain("relay task <verb>");
    expect(stdout).toContain("complete-subtask");
  });

  test("`relay where` from a directory without .relay/ exits 1 with hint", async () => {
    const empty = await mkdtemp(join(tmpdir(), "relay-empty-"));
    try {
      const { stdout, code } = await runBinary(empty, "where", "--json");
      expect(code).toBe(1);
      const json = JSON.parse(stdout);
      expect(json.relayDir).toBeNull();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  test("init → task create → task list round-trip works end-to-end", async () => {
    const project = await mkdtemp(join(tmpdir(), "relay-roundtrip-"));
    try {
      // init exercises the SKILL.md `with { type: "file" }` import —
      // i.e. the $bunfs/ embedded-asset path. If that path is broken
      // in the compiled binary, init fails to copy the skill and this
      // assertion catches it.
      const init = await runBinary(project, "init", "--no-allowlist");
      expect(init.code).toBe(0);
      expect(init.stdout).toContain("Initialized relay at");

      const skillPath = join(
        project,
        ".claude",
        "skills",
        "relay",
        "SKILL.md",
      );
      const skillStat = await stat(skillPath);
      expect(skillStat.isFile()).toBe(true);
      const skillContent = await readFile(skillPath, "utf-8");
      // Sanity: it's the post-Phase-6 CLI-first skill, not stale.
      expect(skillContent).toContain("relay task list");

      // task create — exercises argv parser, dispatch, @relay/core,
      // ID assignment + counter, atomic file write.
      const create = await runBinary(
        project,
        "task",
        "create",
        "--title",
        "from compiled binary",
        "--json",
      );
      expect(create.code).toBe(0);
      const created = JSON.parse(create.stdout);
      expect(created.title).toBe("from compiled binary");
      expect(created.id).toMatch(/^TASK-\d{3}$/);

      // task list --json reads what we just wrote, round-tripping
      // through the on-disk markdown + frontmatter + readers.
      const list = await runBinary(project, "task", "list", "--json");
      expect(list.code).toBe(0);
      const tasks = JSON.parse(list.stdout);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(created.id);
      expect(tasks[0].title).toBe("from compiled binary");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  test("`relay --mcp` prints the deprecation warning then waits on stdio", async () => {
    // The MCP server is a stdio loop that waits for handshake bytes —
    // it'll hang forever if we don't terminate it. Spawn it with a
    // detached child + manual kill, capturing only the boot-time
    // stderr lines.
    const project = await mkdtemp(join(tmpdir(), "relay-mcp-warn-"));
    try {
      const initResult = await runBinary(project, "init", "--no-allowlist");
      expect(initResult.code).toBe(0);

      const proc = Bun.spawn([binaryPath, "--mcp"], {
        cwd: project,
        stderr: "pipe",
        stdin: "pipe",
        stdout: "pipe",
      });

      // Give it a brief window to write the boot-time stderr lines.
      await Bun.sleep(200);
      proc.kill("SIGTERM");
      await proc.exited;

      const stderrText = await new Response(proc.stderr).text();
      expect(stderrText).toContain("Relay MCP server (stdio)");
      expect(stderrText).toContain("legacy integration path");
      expect(stderrText).toContain("CLI call resolves .relay/");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
}, 30_000);
