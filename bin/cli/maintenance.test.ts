import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runDoctorCmd, runSyncCmd, type MaintenanceCtx } from "./maintenance.ts";
import { runTaskCreate } from "./task.ts";

const exec = promisify(execFile);

let dir: string;
let ctx: MaintenanceCtx;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-maint-cli-"));
  // doctor + sync want a real project root with .relay/ inside it.
  await mkdir(join(dir, ".relay", "tasks"), { recursive: true });
  await mkdir(join(dir, ".relay", "plans"), { recursive: true });
  await mkdir(join(dir, ".relay", "docs"), { recursive: true });
  await writeFile(join(dir, ".relay", "config.yaml"), "prefix: TASK\n");
  // doctor flags missing .gitattributes merge strategies for counter
  // files as a FAIL — seed the strategies so a "clean" repo is actually
  // clean from doctor's perspective and the test is asserting the
  // happy-path contract, not a config gap.
  await writeFile(
    join(dir, ".gitattributes"),
    [
      ".relay/tasks/.counter merge=ours",
      ".relay/plans/.counter merge=ours",
      ".relay/docs/.counter merge=ours",
      "",
    ].join("\n"),
  );
  ctx = {
    relayDir: join(dir, ".relay"),
    tasksDir: join(dir, ".relay", "tasks"),
    plansDir: join(dir, ".relay", "plans"),
    docsDir: join(dir, ".relay", "docs"),
  };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("doctor", () => {
  test("clean repo → exit 0", async () => {
    const result = await runDoctorCmd(
      { kind: "doctor", fix: false, json: false },
      ctx,
    );
    // No artifacts, no failures expected. The exit code is the contract
    // here — green-when-green is what makes it CI-usable.
    expect(result.exitCode).toBe(0);
  });

  test("--json emits structured shape with item counts", async () => {
    const result = await runDoctorCmd(
      { kind: "doctor", fix: false, json: true },
      ctx,
    );
    const parsed = JSON.parse(result.stdout!);
    expect(parsed).toHaveProperty("items");
    expect(parsed).toHaveProperty("passed");
    expect(parsed).toHaveProperty("warnings");
    expect(parsed).toHaveProperty("failures");
    expect(typeof parsed.passed).toBe("number");
  });

  test("counter-behind-highest produces a fixable failure → --fix repairs it", async () => {
    // Seed: create a task, then corrupt the counter to 0.
    await runTaskCreate(
      {
        kind: "task-create",
        title: "drift",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      { tasksDir: ctx.tasksDir },
    );
    await writeFile(join(ctx.tasksDir, ".counter"), "0");

    const broken = await runDoctorCmd(
      { kind: "doctor", fix: false, json: true },
      ctx,
    );
    expect(broken.exitCode).toBe(1);
    expect(JSON.parse(broken.stdout!).failures).toBeGreaterThan(0);

    const fixed = await runDoctorCmd(
      { kind: "doctor", fix: true, json: true },
      ctx,
    );
    expect(fixed.exitCode).toBe(0);
  });
});

describe("sync", () => {
  // sync needs a git repo. Each test sets up a fresh one inside the
  // tmp dir so we don't depend on the surrounding worktree's state.
  beforeEach(async () => {
    await exec("git", ["init"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@t.com"], { cwd: dir });
    await exec("git", ["config", "user.name", "Test"], { cwd: dir });
    await exec("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir });
  });

  test("no changes → 'No artifact changes to sync.'", async () => {
    const result = await runSyncCmd(
      { kind: "sync", dryRun: false, push: false, json: false },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No artifact changes");
  });

  test("--dry-run reports a would-commit when artifacts changed", async () => {
    // Seed an unstaged task file.
    await runTaskCreate(
      {
        kind: "task-create",
        title: "to-sync",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      { tasksDir: ctx.tasksDir },
    );

    const result = await runSyncCmd(
      { kind: "sync", dryRun: true, push: false, json: true },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout!);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.committed.length).toBeGreaterThan(0);

    // Confirm the dry-run truly didn't commit anything.
    const { stdout: log } = await exec(
      "git",
      ["log", "--oneline"],
      { cwd: dir },
    );
    expect(log.trim().split("\n")).toHaveLength(1); // just the init commit
  });
});
