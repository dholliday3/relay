import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import {
  createTask,
  updateTask,
  deleteTask,
  restoreTask,
  toggleSubtask,
  addSubtask,
} from "./writer.js";

describe("createTask", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-writer-"));
    await writeFile(join(dir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("creates a task file with correct frontmatter", async () => {
    const task = await createTask(dir, {
      title: "My First Task",
      status: "open",
    });

    expect(task.id).toMatch(/^TASK-[0-9a-z]{5}$/);
    expect(task.title).toBe("My First Task");
    expect(task.status).toBe("open");
    expect(task.created).toBeInstanceOf(Date);
    expect(task.updated).toBeInstanceOf(Date);

    // Verify file exists
    const files = await readdir(dir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    expect(mdFile).toBe(`${task.id}-my-first-task.md`);

    // Verify frontmatter
    const raw = await readFile(join(dir, mdFile!), "utf-8");
    const { data } = matter(raw);
    expect(data.id).toBe(task.id);
    expect(data.title).toBe("My First Task");
    expect(data.status).toBe("open");
  });

  test("omits optional fields when not set", async () => {
    await createTask(dir, { title: "Basic Task" });

    const files = await readdir(dir);
    const mdFile = files.find((f) => f.endsWith(".md"))!;
    const raw = await readFile(join(dir, mdFile), "utf-8");
    const { data } = matter(raw);

    expect(data.priority).toBeUndefined();
    expect(data.project).toBeUndefined();
    expect(data.epic).toBeUndefined();
    expect(data.sprint).toBeUndefined();
    expect(data.tags).toBeUndefined();
    expect(data.order).toBeUndefined();
  });

  test("normalizes tags on write", async () => {
    const task = await createTask(dir, {
      title: "Tagged",
      tags: ["  Bug  ", "BUG", "feature"],
    });
    expect(task.tags).toEqual(["bug", "feature"]);
  });

  test("includes body content", async () => {
    const task = await createTask(dir, {
      title: "With Body",
      body: "Some description here",
    });
    expect(task.body).toBe("Some description here");
  });

  test("allocates distinct ids per task", async () => {
    const t1 = await createTask(dir, { title: "First" });
    const t2 = await createTask(dir, { title: "Second" });
    expect(t1.id).toMatch(/^TASK-[0-9a-z]{5}$/);
    expect(t2.id).toMatch(/^TASK-[0-9a-z]{5}$/);
    expect(t1.id).not.toBe(t2.id);
  });

  test("round-trips description through frontmatter", async () => {
    const summary = "Short summary shown under title";
    const task = await createTask(dir, {
      title: "With description",
      description: summary,
    });
    expect(task.description).toBe(summary);

    const files = await readdir(dir);
    const mdFile = files.find((f) => f.endsWith(".md"))!;
    const { data } = matter(await readFile(join(dir, mdFile), "utf-8"));
    expect(data.description).toBe(summary);
  });
});

describe("updateTask", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-writer-"));
    await writeFile(join(dir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("updates frontmatter fields", async () => {
    const task = await createTask(dir, { title: "Original" });
    const updated = await updateTask(dir, task.id, {
      status: "in-progress",
      priority: "high",
    });

    expect(updated.status).toBe("in-progress");
    expect(updated.priority).toBe("high");
    expect(updated.updated.getTime()).toBeGreaterThanOrEqual(
      task.updated.getTime(),
    );
  });

  test("clears optional fields when set to null", async () => {
    const task = await createTask(dir, {
      title: "WithPriority",
      priority: "high",
      project: "myproject",
    });
    const updated = await updateTask(dir, task.id, {
      priority: null,
      project: null,
    });
    expect(updated.priority).toBeUndefined();
    expect(updated.project).toBeUndefined();

    // Verify in file
    const raw = await readFile(updated.filePath, "utf-8");
    const { data } = matter(raw);
    expect(data.priority).toBeUndefined();
    expect(data.project).toBeUndefined();
  });

  test("updates body content", async () => {
    const task = await createTask(dir, {
      title: "Body Test",
      body: "Original body",
    });
    const updated = await updateTask(dir, task.id, {
      body: "Updated body",
    });
    expect(updated.body).toBe("Updated body");
  });

  test("sets and clears description on update", async () => {
    const task = await createTask(dir, { title: "DescTest" });
    expect(task.description).toBeUndefined();

    const withDesc = await updateTask(dir, task.id, {
      description: "Quick summary",
    });
    expect(withDesc.description).toBe("Quick summary");

    const cleared = await updateTask(dir, task.id, {
      description: null,
    });
    expect(cleared.description).toBeUndefined();
    const { data } = matter(await readFile(cleared.filePath, "utf-8"));
    expect(data.description).toBeUndefined();
  });

  test("preserves description across unrelated updates", async () => {
    const summary = "Short scannable summary";
    const task = await createTask(dir, {
      title: "Preserve",
      description: summary,
    });
    const updated = await updateTask(dir, task.id, { status: "in-progress" });
    expect(updated.description).toBe(summary);
  });

  test("throws for non-existent task", async () => {
    expect(updateTask(dir, "TKT-999", { title: "Nope" })).rejects.toThrow(
      "Task not found",
    );
  });

  test("resolves by frontmatter id when filename prefix disagrees", async () => {
    // Simulates the drift where a file's name and its frontmatter id got out
    // of sync (e.g. after a renumber without a file rename). The writer must
    // trust the frontmatter — matching on the filename prefix would route the
    // write to a neighboring task.
    const a = await createTask(dir, { title: "Task A" });
    const b = await createTask(dir, { title: "Task B" });

    const aPath = join(dir, `${a.id}-task-a.md`);
    const bPath = join(dir, `${b.id}-task-b.md`);
    const aRaw = await readFile(aPath, "utf-8");
    const bRaw = await readFile(bPath, "utf-8");
    // Swap frontmatter ids so each filename's prefix disagrees with its body.
    await writeFile(aPath, aRaw.replace(`id: ${a.id}`, `id: ${b.id}`), "utf-8");
    await writeFile(bPath, bRaw.replace(`id: ${b.id}`, `id: ${a.id}`), "utf-8");

    // Tag the "real" b.id so we can assert by a stable attribute. (Title change
    // would rename the file, obscuring which file was hit.)
    await updateTask(dir, b.id, { tags: ["hit"] });

    // aPath now claims b.id in its frontmatter, and that is the file that
    // should have been updated.
    const aAfter = matter(await readFile(aPath, "utf-8"));
    expect(aAfter.data.id).toBe(b.id);
    expect(aAfter.data.tags).toEqual(["hit"]);

    // bPath (frontmatter a.id) is untouched.
    const bAfter = matter(await readFile(bPath, "utf-8"));
    expect(bAfter.data.id).toBe(a.id);
    expect(bAfter.data.tags).toBeUndefined();
  });
});

describe("deleteTask", () => {
  let rootDir: string;
  let dir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "relay-writer-"));
    dir = join(rootDir, "tasks");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  test("archives task by default", async () => {
    const task = await createTask(dir, { title: "To Archive" });
    await deleteTask(dir, task.id);

    // Main directory should not have the file
    const mainFiles = await readdir(dir);
    expect(mainFiles.filter((f) => f.endsWith(".md"))).toHaveLength(0);

    // Archive should have it
    const archiveFiles = await readdir(join(dir, ".archive"));
    expect(archiveFiles.filter((f) => f.endsWith(".md"))).toHaveLength(1);
  });

  test("hard-deletes when config says so", async () => {
    // deleteTask reads config from dirname(dir) (the relay root)
    await writeFile(
      join(rootDir, "config.yaml"),
      "prefix: TKT\ndeleteMode: hard\n",
      "utf-8",
    );
    const task = await createTask(dir, { title: "To Delete" });
    await deleteTask(dir, task.id);

    const files = await readdir(dir);
    expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(0);
  });
});

describe("restoreTask", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-writer-"));
    await writeFile(join(dir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("restores an archived task", async () => {
    const task = await createTask(dir, { title: "Archived" });
    await deleteTask(dir, task.id);

    const restored = await restoreTask(dir, task.id);
    expect(restored.id).toBe(task.id);
    expect(restored.title).toBe("Archived");

    const mainFiles = await readdir(dir);
    expect(mainFiles.filter((f) => f.endsWith(".md"))).toHaveLength(1);
  });

  test("throws when task is not in archive", () => {
    expect(restoreTask(dir, "TKT-999")).rejects.toThrow("not found");
  });
});

describe("toggleSubtask", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-writer-"));
    await writeFile(join(dir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("toggles a checkbox from unchecked to checked", async () => {
    const task = await createTask(dir, {
      title: "Tasks",
      body: "## Tasks\n\n- [ ] First task\n- [ ] Second task",
    });

    const updated = await toggleSubtask(dir, task.id, 0);
    expect(updated.body).toContain("- [x] First task");
    expect(updated.body).toContain("- [ ] Second task");
  });

  test("toggles a checkbox from checked to unchecked", async () => {
    const task = await createTask(dir, {
      title: "Tasks",
      body: "- [x] Done task",
    });

    const updated = await toggleSubtask(dir, task.id, 0);
    expect(updated.body).toContain("- [ ] Done task");
  });

  test("throws for invalid index", async () => {
    const task = await createTask(dir, {
      title: "Tasks",
      body: "- [ ] Only one",
    });

    expect(toggleSubtask(dir, task.id, 5)).rejects.toThrow("not found");
  });
});

describe("addSubtask", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-writer-"));
    await writeFile(join(dir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("creates Tasks section if missing", async () => {
    const task = await createTask(dir, {
      title: "No Tasks",
      body: "Some description",
    });

    const updated = await addSubtask(dir, task.id, "New task");
    expect(updated.body).toContain("## Tasks");
    expect(updated.body).toContain("- [ ] New task");
  });

  test("appends to existing Tasks section", async () => {
    const task = await createTask(dir, {
      title: "Has Tasks",
      body: "## Tasks\n\n- [ ] Existing task",
    });

    const updated = await addSubtask(dir, task.id, "Another task");
    expect(updated.body).toContain("- [ ] Existing task");
    expect(updated.body).toContain("- [ ] Another task");
  });
});
