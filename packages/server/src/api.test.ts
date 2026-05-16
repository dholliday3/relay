import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer, type ServerHandle } from "./index.js";

describe("REST API", () => {
  let dir: string;
  let relayDir: string;
  let tasksDir: string;
  let plansDir: string;
  let docsDir: string;
  let handle: ServerHandle;
  let base: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-api-"));
    relayDir = join(dir, ".relay");
    tasksDir = join(relayDir, "tasks");
    plansDir = join(relayDir, "plans");
    docsDir = join(relayDir, "docs");
    await mkdir(join(tasksDir, ".archive"), { recursive: true });
    await mkdir(plansDir, { recursive: true });
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(tasksDir, ".counter"), "0", "utf-8");
    await writeFile(join(plansDir, ".counter"), "0", "utf-8");
    await writeFile(join(docsDir, ".counter"), "0", "utf-8");
    await writeFile(join(relayDir, "config.yaml"), "prefix: TASK\ndeleteMode: archive\n", "utf-8");
    handle = startServer({ relayDir, tasksDir, plansDir, docsDir, port: 0 });
    base = `http://localhost:${handle.port}`;
  });

  afterEach(async () => {
    handle.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("GET /api/tasks returns empty array", async () => {
    const res = await fetch(`${base}/api/tasks`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  test("POST /api/tasks creates a task", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test task" }),
    });
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.id).toMatch(/^TASK-[0-9a-z]{5}$/);
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("open");
  });

  test("GET /api/tasks/:id returns a task", async () => {
    const createRes = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Findable" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${base}/api/tasks/${id}`);
    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task.title).toBe("Findable");
  });

  test("GET /api/tasks/:id returns 404 for missing", async () => {
    const res = await fetch(`${base}/api/tasks/TASK-999`);
    expect(res.status).toBe(404);
  });

  test("PATCH /api/tasks/:id updates fields", async () => {
    const createRes = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Original" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${base}/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in-progress", priority: "high" }),
    });
    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task.status).toBe("in-progress");
    expect(task.priority).toBe("high");
  });

  test("PATCH /api/tasks/:id/body updates body", async () => {
    const createRes = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Body Test" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${base}/api/tasks/${id}/body`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "New content" }),
    });
    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task.body).toBe("New content");
  });

  test("DELETE /api/tasks/:id archives a task", async () => {
    const createRes = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "To Delete" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${base}/api/tasks/${id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    // Verify it's gone from the list
    const listRes = await fetch(`${base}/api/tasks`);
    const tasks = await listRes.json();
    expect(tasks).toHaveLength(0);
  });

  test("POST /api/tasks/:id/restore restores a task", async () => {
    const createRes = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Restorable" }),
    });
    const { id } = await createRes.json();
    await fetch(`${base}/api/tasks/${id}`, { method: "DELETE" });

    const res = await fetch(`${base}/api/tasks/${id}/restore`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task.title).toBe("Restorable");
  });

  test("GET /api/meta returns aggregated metadata", async () => {
    await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", project: "myproj", tags: ["bug"] }),
    });

    const res = await fetch(`${base}/api/meta`);
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.projects).toContain("myproj");
    expect(meta.tags).toContain("bug");
  });

  test("GET /api/config returns config", async () => {
    const res = await fetch(`${base}/api/config`);
    expect(res.status).toBe(200);
    const config = await res.json();
    expect(config.prefix).toBe("TASK");
    expect(config.deleteMode).toBe("archive");
    expect(config.worktreeMode).toBe("local");
  });

  test("PATCH /api/config updates config", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "BUG" }),
    });
    expect(res.status).toBe(200);
    const config = await res.json();
    expect(config.prefix).toBe("BUG");
  });

  test("POST /api/docs creates a doc", async () => {
    const res = await fetch(`${base}/api/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Reference Doc" }),
    });
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc.id).toMatch(/^DOC-[0-9a-z]{5}$/);
    expect(doc.title).toBe("Reference Doc");
  });

  test("GET /api/docs/:id returns a doc", async () => {
    const createRes = await fetch(`${base}/api/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Findable Doc" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${base}/api/docs/${id}`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.title).toBe("Findable Doc");
  });

  test("PATCH /api/docs/:id/body updates body", async () => {
    const createRes = await fetch(`${base}/api/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Body Doc" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${base}/api/docs/${id}/body`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated notes" }),
    });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.body).toBe("Updated notes");
  });

  test("POST /api/tasks with invalid body returns 400", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("CORS headers are set for localhost", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
  });

  test("OPTIONS preflight returns 204", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(204);
  });
});
