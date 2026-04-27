import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  type TaskCtx,
} from "./task.ts";

/**
 * Integration tests against a real .relay/ directory backed by tmpdir.
 * Each test seeds a fresh tasks/ folder with the project's default
 * `TASK` prefix (the schema default — no config.yaml needed).
 *
 * Handlers are called directly with their parsed Command + a TaskCtx,
 * which mirrors what bin/relay.ts does at runtime. This catches
 * everything end-to-end except argv parsing (covered in parse.test.ts).
 */

let dir: string;
let ctx: TaskCtx;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-task-cli-"));
  // The core's listTasks/createTask all expect the tasks/ subdir, but
  // they create the directory themselves via mkdir({ recursive: true }).
  // We only need the parent to exist.
  await mkdir(join(dir, "tasks"), { recursive: true });
  ctx = { tasksDir: join(dir, "tasks") };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("task list", () => {
  test("empty tasks dir → 'No tasks found.'", async () => {
    const result = await runTaskList(
      { kind: "task-list", tags: [], json: false },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("No tasks found.");
  });

  test("empty tasks dir → empty array in --json", async () => {
    const result = await runTaskList(
      { kind: "task-list", tags: [], json: true },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout!)).toEqual([]);
  });

  test("filters narrow the result set", async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "A",
        status: "open",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
    await runTaskCreate(
      {
        kind: "task-create",
        title: "B",
        status: "backlog",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );

    const open = await runTaskList(
      { kind: "task-list", status: "open", tags: [], json: true },
      ctx,
    );
    const parsed = JSON.parse(open.stdout!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("A");
  });
});

describe("task create", () => {
  test("happy path with all major fields", async () => {
    const result = await runTaskCreate(
      {
        kind: "task-create",
        title: "Hello world",
        priority: "high",
        body: "the body",
        bodyFromStdin: false,
        tags: ["a", "b"],
        blockedBy: [],
        relatedTo: [],
        project: "demo",
        json: true,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    const t = JSON.parse(result.stdout!);
    expect(t.id).toBe("TASK-001");
    expect(t.title).toBe("Hello world");
    expect(t.priority).toBe("high");
    expect(t.tags).toEqual(["a", "b"]);
    expect(t.body).toBe("the body");
    expect(t.project).toBe("demo");
  });

  test("text output renders the full task summary + body", async () => {
    const result = await runTaskCreate(
      {
        kind: "task-create",
        title: "Plain",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Created TASK-001: Plain");
    expect(result.stdout).toContain("- Status: open"); // default
  });

  test("--body-from-stdin reads the injected stdin", async () => {
    const result = await runTaskCreate(
      {
        kind: "task-create",
        title: "Stdin task",
        bodyFromStdin: true,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: true,
      },
      { ...ctx, readStdin: async () => "piped body content" },
    );
    expect(result.exitCode).toBe(0);
    const t = JSON.parse(result.stdout!);
    expect(t.body).toBe("piped body content");
  });

  test("--body-from-file reads from disk", async () => {
    const path = join(dir, "body.md");
    await writeFile(path, "from a file");
    const result = await runTaskCreate(
      {
        kind: "task-create",
        title: "File task",
        bodyFromFile: path,
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: true,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout!).body).toBe("from a file");
  });

  test("counter increments per create", async () => {
    for (const t of ["A", "B", "C"]) {
      await runTaskCreate(
        {
          kind: "task-create",
          title: t,
          bodyFromStdin: false,
          tags: [],
          blockedBy: [],
          relatedTo: [],
          json: false,
        },
        ctx,
      );
    }
    const list = await runTaskList(
      { kind: "task-list", tags: [], json: true },
      ctx,
    );
    const ids = JSON.parse(list.stdout!).map((t: { id: string }) => t.id).sort();
    expect(ids).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
  });
});

describe("task get", () => {
  test("returns 1 for unknown ID with stderr message", async () => {
    const result = await runTaskGet(
      { kind: "task-get", id: "TASK-999", json: false },
      ctx,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Task not found: TASK-999");
  });

  test("renders the full task in text mode", async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "Findable",
        bodyFromStdin: false,
        body: "body here",
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
    const result = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: false },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# TASK-001: Findable");
    expect(result.stdout).toContain("body here");
  });
});

describe("task update", () => {
  beforeEach(async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "Original",
        priority: "medium",
        bodyFromStdin: false,
        tags: ["one", "two"],
        blockedBy: [],
        relatedTo: [],
        project: "p",
        json: false,
      },
      ctx,
    );
  });

  test("updates discrete scalar fields", async () => {
    const result = await runTaskUpdate(
      {
        kind: "task-update",
        id: "TASK-001",
        title: "New title",
        status: "in-progress",
        bodyFromStdin: false,
        clearPriority: false,
        clearProject: false,
        clearEpic: false,
        clearSprint: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addBlockedBy: [],
        removeBlockedBy: [],
        clearBlockedBy: false,
        addRelatedTo: [],
        removeRelatedTo: [],
        clearRelatedTo: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    const t = JSON.parse(result.stdout!);
    expect(t.title).toBe("New title");
    expect(t.status).toBe("in-progress");
    expect(t.priority).toBe("medium"); // untouched
  });

  test("--clear-priority sets priority to undefined", async () => {
    const result = await runTaskUpdate(
      {
        kind: "task-update",
        id: "TASK-001",
        bodyFromStdin: false,
        clearPriority: true,
        clearProject: false,
        clearEpic: false,
        clearSprint: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addBlockedBy: [],
        removeBlockedBy: [],
        clearBlockedBy: false,
        addRelatedTo: [],
        removeRelatedTo: [],
        clearRelatedTo: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    const t = JSON.parse(result.stdout!);
    expect(t.priority).toBeUndefined();
  });

  test("--add-tag / --remove-tag operate as deltas on existing tags", async () => {
    const result = await runTaskUpdate(
      {
        kind: "task-update",
        id: "TASK-001",
        bodyFromStdin: false,
        clearPriority: false,
        clearProject: false,
        clearEpic: false,
        clearSprint: false,
        addTags: ["three"],
        removeTags: ["one"],
        clearTags: false,
        addBlockedBy: [],
        removeBlockedBy: [],
        clearBlockedBy: false,
        addRelatedTo: [],
        removeRelatedTo: [],
        clearRelatedTo: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    const t = JSON.parse(result.stdout!);
    // existing was ["one","two"] → remove "one" + add "three" → ["two","three"]
    expect(t.tags).toEqual(["two", "three"]);
  });

  test("--tag (replace) overrides existing tags", async () => {
    const result = await runTaskUpdate(
      {
        kind: "task-update",
        id: "TASK-001",
        bodyFromStdin: false,
        clearPriority: false,
        clearProject: false,
        clearEpic: false,
        clearSprint: false,
        replaceTags: ["only", "these"],
        addTags: [],
        removeTags: [],
        clearTags: false,
        addBlockedBy: [],
        removeBlockedBy: [],
        clearBlockedBy: false,
        addRelatedTo: [],
        removeRelatedTo: [],
        clearRelatedTo: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    const t = JSON.parse(result.stdout!);
    expect(t.tags).toEqual(["only", "these"]);
  });

  test("returns 1 when ID doesn't exist", async () => {
    const result = await runTaskUpdate(
      {
        kind: "task-update",
        id: "TASK-NOPE",
        bodyFromStdin: false,
        clearPriority: false,
        clearProject: false,
        clearEpic: false,
        clearSprint: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addBlockedBy: [],
        removeBlockedBy: [],
        clearBlockedBy: false,
        addRelatedTo: [],
        removeRelatedTo: [],
        clearRelatedTo: false,
        clearAssignee: false,
        clearCreatedBy: false,
        json: false,
      },
      ctx,
    );
    expect(result.exitCode).toBe(1);
  });
});

describe("task delete", () => {
  test("deletes an existing task", async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "doomed",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
    const del = await runTaskDelete(
      { kind: "task-delete", id: "TASK-001" },
      ctx,
    );
    expect(del.exitCode).toBe(0);
    expect(del.stdout).toContain("Deleted task TASK-001");

    const get = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: false },
      ctx,
    );
    expect(get.exitCode).toBe(1);
  });

  test("returns 1 for unknown ID", async () => {
    const result = await runTaskDelete(
      { kind: "task-delete", id: "TASK-999" },
      ctx,
    );
    expect(result.exitCode).toBe(1);
  });
});

describe("task link-ref", () => {
  beforeEach(async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "T",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
  });

  test("appends a new ref", async () => {
    const result = await runTaskLinkRef(
      {
        kind: "task-link-ref",
        id: "TASK-001",
        ref: "https://github.com/x/y/pull/1",
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);

    const get = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    expect(JSON.parse(get.stdout!).refs).toEqual([
      "https://github.com/x/y/pull/1",
    ]);
  });

  test("dedupes when the ref is already linked", async () => {
    await runTaskLinkRef(
      { kind: "task-link-ref", id: "TASK-001", ref: "abc123" },
      ctx,
    );
    const result = await runTaskLinkRef(
      { kind: "task-link-ref", id: "TASK-001", ref: "abc123" },
      ctx,
    );
    expect(result.stdout).toContain("Ref already linked");

    const get = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    expect(JSON.parse(get.stdout!).refs).toEqual(["abc123"]);
  });
});

describe("task subtasks", () => {
  beforeEach(async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "subby",
        bodyFromStdin: false,
        body: "## Subtasks\n\n- [ ] first thing\n- [ ] second thing",
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
  });

  test("add-subtask appends a checkbox to the body", async () => {
    const result = await runTaskAddSubtask(
      {
        kind: "task-add-subtask",
        id: "TASK-001",
        text: "third thing",
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);

    const get = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    expect(JSON.parse(get.stdout!).body).toContain("- [ ] third thing");
  });

  test("complete-subtask --index N marks done", async () => {
    const result = await runTaskCompleteSubtask(
      {
        kind: "task-complete-subtask",
        id: "TASK-001",
        index: 0,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);

    const get = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    expect(JSON.parse(get.stdout!).body).toContain("- [x] first thing");
  });

  test("complete-subtask --text matches a substring", async () => {
    const result = await runTaskCompleteSubtask(
      {
        kind: "task-complete-subtask",
        id: "TASK-001",
        text: "second",
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);

    const get = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    expect(JSON.parse(get.stdout!).body).toContain("- [x] second thing");
  });

  test("complete-subtask --text with no match returns 1", async () => {
    const result = await runTaskCompleteSubtask(
      {
        kind: "task-complete-subtask",
        id: "TASK-001",
        text: "nonexistent",
      },
      ctx,
    );
    expect(result.exitCode).toBe(1);
  });

  test("complete-subtask on already-complete reports it idempotently", async () => {
    await runTaskCompleteSubtask(
      { kind: "task-complete-subtask", id: "TASK-001", index: 0 },
      ctx,
    );
    const second = await runTaskCompleteSubtask(
      { kind: "task-complete-subtask", id: "TASK-001", index: 0 },
      ctx,
    );
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain("already complete");
  });
});

describe("task reorder", () => {
  beforeEach(async () => {
    for (const title of ["A", "B", "C"]) {
      await runTaskCreate(
        {
          kind: "task-create",
          title,
          bodyFromStdin: false,
          tags: [],
          blockedBy: [],
          relatedTo: [],
          json: false,
        },
        ctx,
      );
    }
  });

  test("--after positions a task between neighbors", async () => {
    // Move TASK-003 (C) to be after TASK-001 (A).
    const result = await runTaskReorder(
      {
        kind: "task-reorder",
        id: "TASK-003",
        afterId: "TASK-001",
        beforeId: "TASK-002",
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Reordered TASK-003");
  });
});

describe("worktree behavior — the regression test that motivated this plan", () => {
  test("a worktree's .relay/ resolves to itself, not the main checkout", async () => {
    // We don't need a full git worktree setup here — the per-call dir
    // resolution is tested in worktree.test.ts already. What matters
    // for the CLI is that handlers operate on whatever tasksDir they
    // were handed, and that the dispatcher in bin/relay.ts walks up
    // from cwd. We assert the contract: two distinct tasksDir values
    // produce two distinct task universes.
    const dirA = await mkdtemp(join(tmpdir(), "relay-wt-a-"));
    const dirB = await mkdtemp(join(tmpdir(), "relay-wt-b-"));
    try {
      await mkdir(join(dirA, "tasks"));
      await mkdir(join(dirB, "tasks"));

      await runTaskCreate(
        {
          kind: "task-create",
          title: "in A",
          bodyFromStdin: false,
          tags: [],
          blockedBy: [],
          relatedTo: [],
          json: false,
        },
        { tasksDir: join(dirA, "tasks") },
      );
      await runTaskCreate(
        {
          kind: "task-create",
          title: "in B",
          bodyFromStdin: false,
          tags: [],
          blockedBy: [],
          relatedTo: [],
          json: false,
        },
        { tasksDir: join(dirB, "tasks") },
      );

      const listA = await runTaskList(
        { kind: "task-list", tags: [], json: true },
        { tasksDir: join(dirA, "tasks") },
      );
      const listB = await runTaskList(
        { kind: "task-list", tags: [], json: true },
        { tasksDir: join(dirB, "tasks") },
      );
      const a = JSON.parse(listA.stdout!).map((t: { title: string }) => t.title);
      const b = JSON.parse(listB.stdout!).map((t: { title: string }) => t.title);
      expect(a).toEqual(["in A"]);
      expect(b).toEqual(["in B"]);
    } finally {
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });
});

describe("output-format guarantees (the JSON contract for parsing agents)", () => {
  test("task list --json is always a JSON array", async () => {
    const empty = await runTaskList(
      { kind: "task-list", tags: [], json: true },
      ctx,
    );
    expect(Array.isArray(JSON.parse(empty.stdout!))).toBe(true);
  });

  test("task get --json always emits the always-present fields", async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "shape",
        bodyFromStdin: false,
        tags: [],
        blockedBy: [],
        relatedTo: [],
        json: false,
      },
      ctx,
    );
    const result = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    const t = JSON.parse(result.stdout!);
    // The fields agents can rely on being present for any task. Optional
    // fields (priority, project, tags, etc.) are *omitted* from the JSON
    // when undefined (JSON.stringify drops undefineds), which is the
    // documented contract — agents check `if (t.priority)` rather than
    // expecting the key to always exist.
    for (const f of ["id", "title", "status", "created", "updated", "body"]) {
      expect(t).toHaveProperty(f);
    }
  });

  test("task get --json with a fully-populated task includes optional fields", async () => {
    await runTaskCreate(
      {
        kind: "task-create",
        title: "full",
        priority: "high",
        bodyFromStdin: false,
        tags: ["a"],
        blockedBy: ["TASK-9"],
        relatedTo: ["TASK-8"],
        project: "p",
        epic: "e",
        sprint: "s",
        assignee: "claude",
        createdBy: "human",
        json: false,
      },
      ctx,
    );
    const result = await runTaskGet(
      { kind: "task-get", id: "TASK-001", json: true },
      ctx,
    );
    const t = JSON.parse(result.stdout!);
    for (const f of [
      "priority",
      "tags",
      "project",
      "epic",
      "sprint",
      "assignee",
      "createdBy",
      "blockedBy",
      "relatedTo",
    ]) {
      expect(t).toHaveProperty(f);
    }
  });
});

// readFile is used implicitly via --body-from-file; this guards against
// dropping the import during a future refactor.
void readFile;
