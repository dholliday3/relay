import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import {
  createPlan,
  updatePlan,
  deletePlan,
  restorePlan,
  cutTicketsFromPlan,
} from "./plan-writer.js";
import { listTickets } from "./reader.js";

describe("createPlan", () => {
  let ticketsDir: string;
  let plansDir: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), "ticketbook-plan-writer-"));
    ticketsDir = join(root, ".tickets");
    plansDir = join(root, ".plans");
    await mkdir(ticketsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
    await writeFile(join(plansDir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(ticketsDir, { recursive: true, force: true });
    await rm(plansDir, { recursive: true, force: true });
  });

  test("creates a plan file with correct frontmatter", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "My First Plan",
      status: "draft",
    });

    expect(plan.id).toBe("PLAN-001");
    expect(plan.title).toBe("My First Plan");
    expect(plan.status).toBe("draft");
    expect(plan.created).toBeInstanceOf(Date);
    expect(plan.updated).toBeInstanceOf(Date);

    const files = await readdir(plansDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    expect(mdFile).toBe("PLAN-001-my-first-plan.md");

    const raw = await readFile(join(plansDir, mdFile!), "utf-8");
    const { data } = matter(raw);
    expect(data.id).toBe("PLAN-001");
    expect(data.title).toBe("My First Plan");
    expect(data.status).toBe("draft");
  });

  test("defaults status to draft", async () => {
    const plan = await createPlan(ticketsDir, plansDir, { title: "No Status" });
    expect(plan.status).toBe("draft");
  });

  test("omits optional fields when not set", async () => {
    await createPlan(ticketsDir, plansDir, { title: "Basic Plan" });

    const files = await readdir(plansDir);
    const mdFile = files.find((f) => f.endsWith(".md"))!;
    const raw = await readFile(join(plansDir, mdFile), "utf-8");
    const { data } = matter(raw);

    expect(data.project).toBeUndefined();
    expect(data.tags).toBeUndefined();
    expect(data.tickets).toBeUndefined();
    expect(data.refs).toBeUndefined();
  });

  test("normalizes tags on write", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "Tagged",
      tags: ["  Feature  ", "FEATURE", "ui"],
    });
    expect(plan.tags).toEqual(["feature", "ui"]);
  });

  test("includes body content", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "With Body",
      body: "## Overview\n\nSome plan content",
    });
    expect(plan.body).toBe("## Overview\n\nSome plan content");
  });

  test("increments counter for each plan", async () => {
    const p1 = await createPlan(ticketsDir, plansDir, { title: "First" });
    const p2 = await createPlan(ticketsDir, plansDir, { title: "Second" });
    expect(p1.id).toBe("PLAN-001");
    expect(p2.id).toBe("PLAN-002");
  });

  test("stores linked ticket IDs", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "Linked",
      tickets: ["TKT-001", "TKT-002"],
    });
    expect(plan.tickets).toEqual(["TKT-001", "TKT-002"]);

    const files = await readdir(plansDir);
    const mdFile = files.find((f) => f.endsWith(".md"))!;
    const raw = await readFile(join(plansDir, mdFile), "utf-8");
    const { data } = matter(raw);
    expect(data.tickets).toEqual(["TKT-001", "TKT-002"]);
  });

  test("uses custom prefix from config", async () => {
    await writeFile(
      join(ticketsDir, ".config.yaml"),
      "prefix: TKT\nplanPrefix: PRD\n",
      "utf-8",
    );
    const plan = await createPlan(ticketsDir, plansDir, { title: "Custom Prefix" });
    expect(plan.id).toBe("PRD-001");
  });
});

describe("updatePlan", () => {
  let ticketsDir: string;
  let plansDir: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), "ticketbook-plan-writer-"));
    ticketsDir = join(root, ".tickets");
    plansDir = join(root, ".plans");
    await mkdir(ticketsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
    await writeFile(join(plansDir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(ticketsDir, { recursive: true, force: true });
    await rm(plansDir, { recursive: true, force: true });
  });

  test("updates frontmatter fields", async () => {
    const plan = await createPlan(ticketsDir, plansDir, { title: "Original" });
    const updated = await updatePlan(plansDir, plan.id, {
      status: "active",
      project: "myproject",
    });

    expect(updated.status).toBe("active");
    expect(updated.project).toBe("myproject");
    expect(updated.updated.getTime()).toBeGreaterThanOrEqual(
      plan.updated.getTime(),
    );
  });

  test("clears optional fields when set to null", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "WithProject",
      project: "myproject",
    });
    const updated = await updatePlan(plansDir, plan.id, { project: null });
    expect(updated.project).toBeUndefined();
  });

  test("updates body content", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "Body Test",
      body: "Original body",
    });
    const updated = await updatePlan(plansDir, plan.id, {
      body: "Updated body",
    });
    expect(updated.body).toBe("Updated body");
  });

  test("updates linked tickets", async () => {
    const plan = await createPlan(ticketsDir, plansDir, { title: "Links" });
    const updated = await updatePlan(plansDir, plan.id, {
      tickets: ["TKT-001", "TKT-003"],
    });
    expect(updated.tickets).toEqual(["TKT-001", "TKT-003"]);
  });

  test("throws for non-existent plan", async () => {
    expect(updatePlan(plansDir, "PLAN-999", { title: "Nope" })).rejects.toThrow(
      "Plan not found",
    );
  });
});

describe("deletePlan", () => {
  let ticketsDir: string;
  let plansDir: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), "ticketbook-plan-writer-"));
    ticketsDir = join(root, ".tickets");
    plansDir = join(root, ".plans");
    await mkdir(ticketsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
    await writeFile(join(plansDir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(ticketsDir, { recursive: true, force: true });
    await rm(plansDir, { recursive: true, force: true });
  });

  test("archives plan by default", async () => {
    const plan = await createPlan(ticketsDir, plansDir, { title: "To Archive" });
    await deletePlan(ticketsDir, plansDir, plan.id);

    const mainFiles = await readdir(plansDir);
    expect(mainFiles.filter((f) => f.endsWith(".md"))).toHaveLength(0);

    const archiveFiles = await readdir(join(plansDir, ".archive"));
    expect(archiveFiles.filter((f) => f.endsWith(".md"))).toHaveLength(1);
  });

  test("hard-deletes when config says so", async () => {
    await writeFile(
      join(ticketsDir, ".config.yaml"),
      "prefix: TKT\nplanPrefix: PLAN\ndeleteMode: hard\n",
      "utf-8",
    );
    const plan = await createPlan(ticketsDir, plansDir, { title: "To Delete" });
    await deletePlan(ticketsDir, plansDir, plan.id);

    const files = await readdir(plansDir);
    expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(0);
  });
});

describe("restorePlan", () => {
  let ticketsDir: string;
  let plansDir: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), "ticketbook-plan-writer-"));
    ticketsDir = join(root, ".tickets");
    plansDir = join(root, ".plans");
    await mkdir(ticketsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
    await writeFile(join(plansDir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(ticketsDir, { recursive: true, force: true });
    await rm(plansDir, { recursive: true, force: true });
  });

  test("restores an archived plan", async () => {
    const plan = await createPlan(ticketsDir, plansDir, { title: "Archived" });
    await deletePlan(ticketsDir, plansDir, plan.id);

    const restored = await restorePlan(plansDir, plan.id);
    expect(restored.id).toBe(plan.id);
    expect(restored.title).toBe("Archived");

    const mainFiles = await readdir(plansDir);
    expect(mainFiles.filter((f) => f.endsWith(".md"))).toHaveLength(1);
  });

  test("throws when plan is not in archive", () => {
    expect(restorePlan(plansDir, "PLAN-999")).rejects.toThrow("not found");
  });
});

describe("cutTicketsFromPlan", () => {
  let ticketsDir: string;
  let plansDir: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), "ticketbook-plan-writer-"));
    ticketsDir = join(root, ".tickets");
    plansDir = join(root, ".plans");
    await mkdir(ticketsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
    await writeFile(join(plansDir, ".counter"), "0", "utf-8");
    await writeFile(join(ticketsDir, ".counter"), "0", "utf-8");
  });

  afterEach(async () => {
    await rm(ticketsDir, { recursive: true, force: true });
    await rm(plansDir, { recursive: true, force: true });
  });

  test("creates tickets from unchecked checkboxes", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "Feature Plan",
      body: "## Tasks\n\n- [ ] Build API endpoint\n- [ ] Add tests\n- [x] Already done",
      project: "myproject",
    });

    const result = await cutTicketsFromPlan(ticketsDir, plansDir, plan.id);

    expect(result.createdTickets).toHaveLength(2);
    expect(result.createdTickets[0].title).toBe("Build API endpoint");
    expect(result.createdTickets[1].title).toBe("Add tests");
    expect(result.createdTickets[0].status).toBe("open");
    expect(result.createdTickets[0].project).toBe("myproject");

    // Plan body should have items checked off with ticket IDs
    expect(result.plan.body).toContain("[x] Build API endpoint (TKT-001)");
    expect(result.plan.body).toContain("[x] Add tests (TKT-002)");
    expect(result.plan.body).toContain("[x] Already done");

    // Plan should have linked tickets
    expect(result.plan.tickets).toContain("TKT-001");
    expect(result.plan.tickets).toContain("TKT-002");

    // Tickets should exist on disk
    const tickets = await listTickets(ticketsDir);
    expect(tickets).toHaveLength(2);
  });

  test("returns empty array when no unchecked items", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "All Done",
      body: "- [x] Already done\n- [x] Also done",
    });

    const result = await cutTicketsFromPlan(ticketsDir, plansDir, plan.id);
    expect(result.createdTickets).toHaveLength(0);
  });

  test("preserves existing linked tickets", async () => {
    const plan = await createPlan(ticketsDir, plansDir, {
      title: "Existing Links",
      tickets: ["EXISTING-001"],
      body: "- [ ] New task",
    });

    const result = await cutTicketsFromPlan(ticketsDir, plansDir, plan.id);
    expect(result.plan.tickets).toContain("EXISTING-001");
    expect(result.plan.tickets).toContain("TKT-001");
  });
});
