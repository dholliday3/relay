import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * End-to-end regression for `--body-from-stdin`.
 *
 * The unit tests in task.test.ts inject `ctx.readStdin` directly, which
 * bypasses the actual `readStdinAll()` codepath. That's how the original
 * bug — `for await of process.stdin` returning empty when invoked via
 * `bin/relay.ts` — slipped through. This file spawns the real binary
 * entry as a subprocess with piped stdin and asserts the body lands on
 * disk. Without the fix in stdin.ts, this test fails with "stdin had no
 * content".
 *
 * We invoke `bun bin/relay.ts …` rather than the compiled `relay`
 * binary so the test runs against current source on every CI invocation.
 */

const RELAY_ENTRY = resolve(import.meta.dir, "../relay.ts");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-stdin-e2e-"));
  // Initialize an empty .relay/ so the entry's `findRelayDirWithWorktree`
  // resolves without prompting. A counter file at 0 + an empty tasks
  // dir is the minimum the CLI needs.
  await mkdir(join(dir, ".relay", "tasks"), { recursive: true });
  await Bun.write(join(dir, ".relay", "tasks", ".counter"), "0");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function runRelay(
  args: string[],
  stdin: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", RELAY_ENTRY, ...args], {
    cwd: dir,
    stdin: new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("--body-from-stdin (real binary, piped stdin)", () => {
  test("create: body content piped via stdin lands on the task", async () => {
    const create = await runRelay(
      ["task", "create", "--title", "Stdin e2e", "--body-from-stdin"],
      "content from a real piped stdin\nmultiline ok",
    );
    expect(create.exitCode).toBe(0);
    expect(create.stdout).toContain("Created TASK-001");

    const get = await runRelay(
      ["task", "get", "TASK-001", "--json"],
      "",
    );
    expect(get.exitCode).toBe(0);
    const t = JSON.parse(get.stdout);
    expect(t.body).toBe("content from a real piped stdin\nmultiline ok");
  });

  test("update: body content piped via stdin replaces the body", async () => {
    await runRelay(
      ["task", "create", "--title", "Stdin update", "--body", "original"],
      "",
    );
    const update = await runRelay(
      ["task", "update", "TASK-001", "--body-from-stdin"],
      "replaced via stdin",
    );
    expect(update.exitCode).toBe(0);

    const get = await runRelay(
      ["task", "get", "TASK-001", "--json"],
      "",
    );
    const t = JSON.parse(get.stdout);
    expect(t.body).toBe("replaced via stdin");
  });

  test("create: empty piped stdin → exit 1, clean error message, no task created", async () => {
    // The original bug silently created an empty-bodied task here. The
    // fix turns this into a loud failure.
    const result = await runRelay(
      ["task", "create", "--title", "Empty stdin", "--body-from-stdin"],
      "",
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--body-from-stdin was set but stdin had no content");
    expect(result.stderr).not.toMatch(/at .*stdin\.ts/); // no stack trace

    // Verify no task slipped through.
    const list = await runRelay(["task", "list", "--json"], "");
    expect(JSON.parse(list.stdout)).toEqual([]);
  });

  test("update: empty piped stdin → exit 1, existing body preserved (the original data-loss path)", async () => {
    // The most dangerous symptom of the original bug.
    await runRelay(
      ["task", "create", "--title", "Has body", "--body", "do not lose me"],
      "",
    );
    const update = await runRelay(
      ["task", "update", "TASK-001", "--body-from-stdin"],
      "",
    );
    expect(update.exitCode).toBe(1);
    expect(update.stderr).toContain("--body-from-stdin was set but stdin had no content");

    const get = await runRelay(["task", "get", "TASK-001", "--json"], "");
    const t = JSON.parse(get.stdout);
    expect(t.body).toBe("do not lose me");
  });
});
