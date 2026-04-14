import {
  readdir,
  readFile,
  rename,
  unlink,
  mkdir,
} from "node:fs/promises";
import { join, basename, extname, dirname } from "node:path";
import matter from "gray-matter";
import {
  CreateTaskInputSchema,
  TaskFrontmatterSchema,
  TaskPatchSchema,
} from "./schema.js";
import type { Task, CreateTaskInput, TaskPatch } from "./types.js";
import { nextId, formatFilename } from "./id.js";
import { getConfig } from "./config.js";
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

async function findTicketFile(
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

function serializeTicket(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return matter.stringify(body ? `\n${body}\n` : "", frontmatter);
}

export async function createTask(
  dir: string,
  input: CreateTaskInput,
): Promise<Task> {
  const rawInput = { ...input };
  if (rawInput.tags) {
    rawInput.tags = normalizeTags(rawInput.tags);
  }
  const validated = CreateTaskInputSchema.parse(rawInput);

  const { id, filename } = await nextId(dir);
  const now = new Date();

  const tags =
    validated.tags && validated.tags.length > 0 ? validated.tags : undefined;

  const blockedBy =
    validated.blockedBy && validated.blockedBy.length > 0 ? validated.blockedBy : undefined;
  const relatedTo =
    validated.relatedTo && validated.relatedTo.length > 0 ? validated.relatedTo : undefined;

  const fm = buildFrontmatter({
    id,
    title: validated.title,
    status: validated.status,
    priority: validated.priority,
    order: validated.order,
    tags,
    project: validated.project,
    epic: validated.epic,
    sprint: validated.sprint,
    blockedBy,
    relatedTo,
    assignee: validated.assignee,
    refs: validated.refs && validated.refs.length > 0 ? validated.refs : undefined,
    created: now,
    updated: now,
  });

  const body = validated.body ?? "";
  const filePath = join(dir, filename(validated.title));

  await mkdir(dir, { recursive: true });
  await atomicWriteFile(filePath, serializeTicket(fm, body));

  return {
    id,
    title: validated.title,
    status: validated.status,
    priority: validated.priority,
    order: validated.order,
    tags,
    project: validated.project,
    epic: validated.epic,
    sprint: validated.sprint,
    blockedBy,
    relatedTo,
    assignee: validated.assignee,
    refs: validated.refs && validated.refs.length > 0 ? validated.refs : undefined,
    created: now,
    updated: now,
    body,
    filePath,
  };
}

export async function updateTask(
  dir: string,
  id: string,
  patch: TaskPatch,
): Promise<Task> {
  const rawPatch = { ...patch };
  if (rawPatch.tags) {
    rawPatch.tags = normalizeTags(rawPatch.tags);
  }
  const validated = TaskPatchSchema.parse(rawPatch);

  const filePath = await findTicketFile(dir, id);
  if (!filePath) throw new Error(`Task not found: ${id}`);

  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  const existing = TaskFrontmatterSchema.parse(parsed.data);
  const now = new Date();

  const updated = { ...existing, updated: now };
  if (validated.title !== undefined) updated.title = validated.title;
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.priority !== undefined) {
    updated.priority =
      validated.priority === null ? undefined : validated.priority;
  }
  if (validated.order !== undefined) {
    updated.order = validated.order === null ? undefined : validated.order;
  }
  if (validated.tags !== undefined) {
    updated.tags = validated.tags.length > 0 ? validated.tags : undefined;
  }
  if (validated.project !== undefined) {
    updated.project =
      validated.project === null ? undefined : validated.project;
  }
  if (validated.epic !== undefined) {
    updated.epic = validated.epic === null ? undefined : validated.epic;
  }
  if (validated.sprint !== undefined) {
    updated.sprint = validated.sprint === null ? undefined : validated.sprint;
  }
  if (validated.blockedBy !== undefined) {
    updated.blockedBy = validated.blockedBy.length > 0 ? validated.blockedBy : undefined;
  }
  if (validated.relatedTo !== undefined) {
    updated.relatedTo = validated.relatedTo.length > 0 ? validated.relatedTo : undefined;
  }
  if (validated.assignee !== undefined) {
    updated.assignee = validated.assignee === null ? undefined : validated.assignee;
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
    priority: updated.priority,
    order: updated.order,
    tags: updated.tags,
    project: updated.project,
    epic: updated.epic,
    sprint: updated.sprint,
    blockedBy: updated.blockedBy,
    relatedTo: updated.relatedTo,
    assignee: updated.assignee,
    refs: updated.refs,
    created: updated.created,
    updated: updated.updated,
  });

  let newFilePath = filePath;
  if (validated.title !== undefined && validated.title !== existing.title) {
    newFilePath = join(dir, formatFilename(id, validated.title));
  }

  await atomicWriteFile(newFilePath, serializeTicket(fm, body));
  if (newFilePath !== filePath) {
    await unlink(filePath);
  }

  return { ...updated, body, filePath: newFilePath };
}

export async function deleteTask(dir: string, id: string): Promise<void> {
  const filePath = await findTicketFile(dir, id);
  if (!filePath) throw new Error(`Task not found: ${id}`);

  const config = await getConfig(dirname(dir));

  if (config.deleteMode === "archive") {
    const archiveDir = join(dir, ARCHIVE_DIR);
    await mkdir(archiveDir, { recursive: true });
    await rename(filePath, join(archiveDir, basename(filePath)));
  } else {
    await unlink(filePath);
  }
}

export async function restoreTask(
  dir: string,
  id: string,
): Promise<Task> {
  const archiveDir = join(dir, ARCHIVE_DIR);
  const archivedPath = await findTicketFile(archiveDir, id);
  if (!archivedPath) throw new Error(`Archived task not found: ${id}`);

  const restoredPath = join(dir, basename(archivedPath));
  await rename(archivedPath, restoredPath);

  const raw = await readFile(restoredPath, "utf-8");
  const parsed = matter(raw);
  const data = TaskFrontmatterSchema.parse(parsed.data);

  return { ...data, body: parsed.content.trim(), filePath: restoredPath };
}

export async function toggleSubtask(
  dir: string,
  id: string,
  taskIndex: number,
): Promise<Task> {
  const filePath = await findTicketFile(dir, id);
  if (!filePath) throw new Error(`Task not found: ${id}`);

  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  const data = TaskFrontmatterSchema.parse(parsed.data);

  const lines = parsed.content.split("\n");
  const checkboxRegex = /^(\s*- \[)([ x])(\].*)$/;
  let found = false;
  let idx = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(checkboxRegex);
    if (match) {
      if (idx === taskIndex) {
        lines[i] = `${match[1]}${match[2] === " " ? "x" : " "}${match[3]}`;
        found = true;
        break;
      }
      idx++;
    }
  }

  if (!found) {
    throw new Error(`Subtask index ${taskIndex} not found in task ${id}`);
  }

  const now = new Date();
  const body = lines.join("\n").trim();
  const fm = buildFrontmatter({
    id: data.id,
    title: data.title,
    status: data.status,
    priority: data.priority,
    order: data.order,
    tags: data.tags,
    project: data.project,
    epic: data.epic,
    sprint: data.sprint,
    blockedBy: data.blockedBy,
    relatedTo: data.relatedTo,
    assignee: data.assignee,
    refs: data.refs,
    created: data.created,
    updated: now,
  });

  await atomicWriteFile(filePath, serializeTicket(fm, body));

  return { ...data, updated: now, body, filePath };
}

export async function addSubtask(
  dir: string,
  id: string,
  text: string,
): Promise<Task> {
  const filePath = await findTicketFile(dir, id);
  if (!filePath) throw new Error(`Task not found: ${id}`);

  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  const data = TaskFrontmatterSchema.parse(parsed.data);
  const body = parsed.content.trim();

  const checkboxLine = `- [ ] ${text}`;
  let newBody: string;

  const lines = body.split("\n");
  const tasksSectionIndex = lines.findIndex((l) => /^## Tasks\s*$/.test(l));

  if (tasksSectionIndex >= 0) {
    let insertAt = lines.length;
    for (let i = tasksSectionIndex + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) {
        insertAt = i;
        break;
      }
    }
    // Skip trailing blank lines within the section
    while (
      insertAt > tasksSectionIndex + 1 &&
      lines[insertAt - 1].trim() === ""
    ) {
      insertAt--;
    }
    lines.splice(insertAt, 0, checkboxLine);
    newBody = lines.join("\n");
  } else {
    newBody = body + (body ? "\n\n" : "") + "## Tasks\n\n" + checkboxLine;
  }

  const now = new Date();
  const fm = buildFrontmatter({
    id: data.id,
    title: data.title,
    status: data.status,
    priority: data.priority,
    order: data.order,
    tags: data.tags,
    project: data.project,
    epic: data.epic,
    sprint: data.sprint,
    blockedBy: data.blockedBy,
    relatedTo: data.relatedTo,
    assignee: data.assignee,
    refs: data.refs,
    created: data.created,
    updated: now,
  });

  await atomicWriteFile(filePath, serializeTicket(fm, newBody));

  return { ...data, updated: now, body: newBody, filePath };
}
