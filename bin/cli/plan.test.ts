import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runPlanList,
  runPlanGet,
  runPlanCreate,
  runPlanUpdate,
  runPlanDelete,
  runPlanLinkTask,
  runPlanCutTasks,
  type PlanCtx,
} from "./plan.ts";

let dir: string;
let ctx: PlanCtx;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-plan-cli-"));
  // Set up the .relay/ root with a config that uses default prefixes.
  // createPlan / deletePlan / cutTasksFromPlan all read config from the
  // rootDir we pass in, so we need a minimal config.yaml present.
  await mkdir(join(dir, "plans"), { recursive: true });
  await mkdir(join(dir, "tasks"), { recursive: true });
  await writeFile(join(dir, "config.yaml"), "prefix: TASK\nplanPrefix: PLAN\n");
  ctx = { rootDir: dir, plansDir: join(dir, "plans") };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("plan list", () => {
  test("empty → 'No plans found.'", async () => {
    const result = await runPlanList(
      { kind: "plan-list", tags: [], json: false },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("No plans found.");
  });

  test("filters narrow the result set", async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "Active one",
        status: "active",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "Drafty",
        status: "draft",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );
    const active = await runPlanList(
      { kind: "plan-list", status: "active", tags: [], json: true },
      ctx,
    );
    const parsed = JSON.parse(active.stdout!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Active one");
  });
});

describe("plan create", () => {
  test("happy path with all major fields", async () => {
    const result = await runPlanCreate(
      {
        kind: "plan-create",
        title: "Q3 plan",
        status: "draft",
        body: "## Goals\n\nfoo",
        bodyFromStdin: false,
        project: "demo",
        tags: ["x", "y"],
        tasks: ["TASK-001"],
        assignee: "claude",
        createdBy: "human",
        json: true,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    const p = JSON.parse(result.stdout!);
    expect(p.id).toBe("PLAN-001");
    expect(p.title).toBe("Q3 plan");
    expect(p.tags).toEqual(["x", "y"]);
    expect(p.tasks).toEqual(["TASK-001"]);
    expect(p.body).toContain("Goals");
  });

  test("--body-from-stdin reads injected stdin", async () => {
    const result = await runPlanCreate(
      {
        kind: "plan-create",
        title: "Stdin",
        bodyFromStdin: true,
        tags: [],
        tasks: [],
        json: true,
      },
      { ...ctx, readStdin: async () => "piped plan body" },
    );
    expect(JSON.parse(result.stdout!).body).toBe("piped plan body");
  });

  test("default status is draft", async () => {
    const result = await runPlanCreate(
      {
        kind: "plan-create",
        title: "Defaulty",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: true,
      },
      ctx,
    );
    expect(JSON.parse(result.stdout!).status).toBe("draft");
  });
});

describe("plan get", () => {
  test("not found → exit 1", async () => {
    const result = await runPlanGet(
      { kind: "plan-get", id: "PLAN-999", json: false },
      ctx,
    );
    expect(result.exitCode).toBe(1);
  });

  test("renders full plan", async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "G",
        body: "the body",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );
    const result = await runPlanGet(
      { kind: "plan-get", id: "PLAN-001", json: false },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# PLAN-001: G");
    expect(result.stdout).toContain("the body");
  });
});

describe("plan update", () => {
  beforeEach(async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "Original",
        bodyFromStdin: false,
        tags: ["one", "two"],
        tasks: ["TASK-1"],
        json: false,
      },
      ctx,
    );
  });

  test("replace tasks via --task", async () => {
    const result = await runPlanUpdate(
      {
        kind: "plan-update",
        id: "PLAN-001",
        bodyFromStdin: false,
        clearProject: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        replaceTasks: ["TASK-9"],
        addTasks: [],
        removeTasks: [],
        clearTasks: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    expect(JSON.parse(result.stdout!).tasks).toEqual(["TASK-9"]);
  });

  test("--add-task / --remove-task act as deltas", async () => {
    const result = await runPlanUpdate(
      {
        kind: "plan-update",
        id: "PLAN-001",
        bodyFromStdin: false,
        clearProject: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addTasks: ["TASK-2"],
        removeTasks: ["TASK-1"],
        clearTasks: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    expect(JSON.parse(result.stdout!).tasks).toEqual(["TASK-2"]);
  });

  test("--clear-tasks empties the linked-tasks list", async () => {
    const result = await runPlanUpdate(
      {
        kind: "plan-update",
        id: "PLAN-001",
        bodyFromStdin: false,
        clearProject: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addTasks: [],
        removeTasks: [],
        clearTasks: true,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    // [] in JSON = empty list. The serializer drops the field if undefined,
    // and updatePlan keeps it as [] when explicitly set.
    const updated = JSON.parse(result.stdout!);
    expect(updated.tasks === undefined || updated.tasks.length === 0).toBe(
      true,
    );
  });
});

describe("plan delete", () => {
  test("happy path + idempotent reattempt", async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "doomed",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );
    const first = await runPlanDelete(
      { kind: "plan-delete", id: "PLAN-001" },
      ctx,
    );
    expect(first.exitCode).toBe(0);

    const second = await runPlanDelete(
      { kind: "plan-delete", id: "PLAN-001" },
      ctx,
    );
    expect(second.exitCode).toBe(1);
  });
});

describe("plan link-task", () => {
  beforeEach(async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "P",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );
  });

  test("appends a new task ID", async () => {
    const result = await runPlanLinkTask(
      { kind: "plan-link-task", planId: "PLAN-001", taskId: "TASK-001" },
      ctx,
    );
    expect(result.exitCode).toBe(0);

    const get = await runPlanGet(
      { kind: "plan-get", id: "PLAN-001", json: true },
      ctx,
    );
    expect(JSON.parse(get.stdout!).tasks).toEqual(["TASK-001"]);
  });

  test("dedupes when already linked", async () => {
    await runPlanLinkTask(
      { kind: "plan-link-task", planId: "PLAN-001", taskId: "TASK-001" },
      ctx,
    );
    const second = await runPlanLinkTask(
      { kind: "plan-link-task", planId: "PLAN-001", taskId: "TASK-001" },
      ctx,
    );
    expect(second.stdout).toContain("already linked");
  });
});

describe("plan cut-tasks", () => {
  test("converts unchecked checkboxes into tasks and links them", async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "Cuttable",
        body: "## Tasks\n\n- [ ] do thing one\n- [ ] do thing two\n- [x] already done",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );

    const result = await runPlanCutTasks(
      { kind: "plan-cut-tasks", planId: "PLAN-001", json: true },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout!);
    expect(parsed.createdTaskIds).toHaveLength(2);

    // Plan now has the tasks linked + checkboxes flipped to [x]
    const get = await runPlanGet(
      { kind: "plan-get", id: "PLAN-001", json: true },
      ctx,
    );
    const plan = JSON.parse(get.stdout!);
    expect(plan.tasks).toEqual(parsed.createdTaskIds);
    expect(plan.body).toContain("[x] do thing one");
    expect(plan.body).toContain("[x] do thing two");
  });

  test("no checkboxes → reports it cleanly", async () => {
    await runPlanCreate(
      {
        kind: "plan-create",
        title: "Empty",
        body: "no checkboxes here",
        bodyFromStdin: false,
        tags: [],
        tasks: [],
        json: false,
      },
      ctx,
    );
    const result = await runPlanCutTasks(
      { kind: "plan-cut-tasks", planId: "PLAN-001", json: false },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No unchecked items");
  });
});
