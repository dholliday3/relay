import {
  readdir,
  readFile,
  rename,
  unlink,
  mkdir,
} from "node:fs/promises";
import { join, basename, extname } from "node:path";
import matter from "gray-matter";
import {
  CreatePlanInputSchema,
  PlanFrontmatterSchema,
  PlanPatchSchema,
} from "./plan-schema.js";
import type { Plan, CreatePlanInput, PlanPatch } from "./plan-types.js";
import type { Task } from "./types.js";
import { nextIdForDir, formatFilename } from "./id.js";
import { getConfig } from "./config.js";
import { createTask } from "./writer.js";
import { atomicWriteFile } from "./atomic.js";

const ARCHIVE_DIR = ".archive";

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()))].filter(
    (t) => t.length > 0,
  );
}

function buildFrontmatter(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      fm[key] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return fm;
}

async function findPlanFile(
  dir: string,
  id: string,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  for (const entry of entries) {
    if (extname(entry) !== ".md") continue;
    if (entry.startsWith(id + "-") || entry === id + ".md") {
      return join(dir, entry);
    }
  }
  return null;
}

function serializePlan(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return matter.stringify(body ? `\n${body}\n` : "", frontmatter);
}

export async function createPlan(
  tasksDir: string,
  plansDir: string,
  input: CreatePlanInput,
): Promise<Plan> {
  const rawInput = { ...input };
  if (rawInput.tags) {
    rawInput.tags = normalizeTags(rawInput.tags);
  }
  const validated = CreatePlanInputSchema.parse(rawInput);

  const config = await getConfig(tasksDir);
  const { id, filename } = await nextIdForDir(plansDir, config.planPrefix);
  const now = new Date();

  const tags =
    validated.tags && validated.tags.length > 0 ? validated.tags : undefined;
  const tasks =
    validated.tasks && validated.tasks.length > 0 ? validated.tasks : undefined;
  const refs =
    validated.refs && validated.refs.length > 0 ? validated.refs : undefined;

  const fm = buildFrontmatter({
    id,
    title: validated.title,
    status: validated.status,
    tags,
    project: validated.project,
    tasks,
    refs,
    created: now,
    updated: now,
  });

  const body = validated.body ?? "";
  const filePath = join(plansDir, filename(validated.title));

  await mkdir(plansDir, { recursive: true });
  await atomicWriteFile(filePath, serializePlan(fm, body));

  return {
    id,
    title: validated.title,
    status: validated.status,
    tags,
    project: validated.project,
    tasks,
    refs,
    created: now,
    updated: now,
    body,
    filePath,
  };
}

export async function updatePlan(
  plansDir: string,
  id: string,
  patch: PlanPatch,
): Promise<Plan> {
  const rawPatch = { ...patch };
  if (rawPatch.tags) {
    rawPatch.tags = normalizeTags(rawPatch.tags);
  }
  const validated = PlanPatchSchema.parse(rawPatch);

  const filePath = await findPlanFile(plansDir, id);
  if (!filePath) throw new Error(`Plan not found: ${id}`);

  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  const existing = PlanFrontmatterSchema.parse(parsed.data);
  const now = new Date();

  const updated = { ...existing, updated: now };
  if (validated.title !== undefined) updated.title = validated.title;
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.tags !== undefined) {
    updated.tags = validated.tags.length > 0 ? validated.tags : undefined;
  }
  if (validated.project !== undefined) {
    updated.project =
      validated.project === null ? undefined : validated.project;
  }
  if (validated.tasks !== undefined) {
    updated.tasks = validated.tasks.length > 0 ? validated.tasks : undefined;
  }
  if (validated.refs !== undefined) {
    updated.refs = validated.refs.length > 0 ? validated.refs : undefined;
  }

  const body =
    validated.body !== undefined ? validated.body : parsed.content.trim();

  const fm = buildFrontmatter({
    id: updated.id,
    title: updated.title,
    status: updated.status,
    tags: updated.tags,
    project: updated.project,
    tasks: updated.tasks,
    refs: updated.refs,
    created: updated.created,
    updated: updated.updated,
  });

  let newFilePath = filePath;
  if (validated.title !== undefined && validated.title !== existing.title) {
    newFilePath = join(plansDir, formatFilename(id, validated.title));
  }

  await atomicWriteFile(newFilePath, serializePlan(fm, body));
  if (newFilePath !== filePath) {
    await unlink(filePath);
  }

  return { ...updated, body, filePath: newFilePath };
}

export async function deletePlan(
  tasksDir: string,
  plansDir: string,
  id: string,
): Promise<void> {
  const filePath = await findPlanFile(plansDir, id);
  if (!filePath) throw new Error(`Plan not found: ${id}`);

  const config = await getConfig(tasksDir);

  if (config.deleteMode === "archive") {
    const archiveDir = join(plansDir, ARCHIVE_DIR);
    await mkdir(archiveDir, { recursive: true });
    await rename(filePath, join(archiveDir, basename(filePath)));
  } else {
    await unlink(filePath);
  }
}

export async function restorePlan(
  plansDir: string,
  id: string,
): Promise<Plan> {
  const archiveDir = join(plansDir, ARCHIVE_DIR);
  const archivedPath = await findPlanFile(archiveDir, id);
  if (!archivedPath) throw new Error(`Archived plan not found: ${id}`);

  const restoredPath = join(plansDir, basename(archivedPath));
  await rename(archivedPath, restoredPath);

  const raw = await readFile(restoredPath, "utf-8");
  const parsed = matter(raw);
  const data = PlanFrontmatterSchema.parse(parsed.data);

  return { ...data, body: parsed.content.trim(), filePath: restoredPath };
}

export interface CutTasksResult {
  plan: Plan;
  createdTasks: Task[];
}

/**
 * Parse unchecked checkboxes from a plan's body, create a task for each,
 * link them to the plan, and check off the items in the plan body.
 */
export async function cutTasksFromPlan(
  tasksDir: string,
  plansDir: string,
  planId: string,
): Promise<CutTasksResult> {
  const filePath = await findPlanFile(plansDir, planId);
  if (!filePath) throw new Error(`Plan not found: ${planId}`);

  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  const planData = PlanFrontmatterSchema.parse(parsed.data);

  const lines = parsed.content.split("\n");
  const checkboxRegex = /^(\s*- \[)( )(\]\s*)(.+)$/;
  const uncheckedIndices: number[] = [];

  // Find all unchecked checkboxes
  for (let i = 0; i < lines.length; i++) {
    if (checkboxRegex.test(lines[i])) {
      uncheckedIndices.push(i);
    }
  }

  if (uncheckedIndices.length === 0) {
    return {
      plan: { ...planData, body: parsed.content.trim(), filePath },
      createdTasks: [],
    };
  }

  const createdTasks: Task[] = [];
  const newTaskIds: string[] = [...(planData.tasks ?? [])];

  // Create a task for each unchecked item and check it off
  for (const lineIdx of uncheckedIndices) {
    const match = lines[lineIdx].match(checkboxRegex);
    if (!match) continue;

    const taskText = match[4].trim();
    const task = await createTask(tasksDir, {
      title: taskText,
      status: "open",
      project: planData.project,
      tags: planData.tags,
    });

    createdTasks.push(task);
    newTaskIds.push(task.id);

    // Check off the item and append the task ID
    lines[lineIdx] = `${match[1]}x${match[3]}${taskText} (${task.id})`;
  }

  // Update the plan with new body and linked tasks
  const newBody = lines.join("\n").trim();
  const now = new Date();

  const fm = buildFrontmatter({
    id: planData.id,
    title: planData.title,
    status: planData.status,
    tags: planData.tags,
    project: planData.project,
    tasks: newTaskIds.length > 0 ? newTaskIds : undefined,
    refs: planData.refs,
    created: planData.created,
    updated: now,
  });

  await atomicWriteFile(filePath, serializePlan(fm, newBody));

  const updatedPlan: Plan = {
    ...planData,
    tasks: newTaskIds.length > 0 ? newTaskIds : undefined,
    updated: now,
    body: newBody,
    filePath,
  };

  return { plan: updatedPlan, createdTasks };
}

export const cutTicketsFromPlan = cutTasksFromPlan;
