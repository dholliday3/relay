import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import matter from "gray-matter";
import { TaskFrontmatterSchema } from "./schema.js";
import type { Task, TaskFilters } from "./types.js";

const IGNORED_FILES = new Set([".counter"]);
const IGNORED_DIRS = new Set([".archive"]);

async function parseTicketFile(filePath: string): Promise<Task | null> {
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);
  const result = TaskFrontmatterSchema.safeParse(data);
  if (!result.success) return null;
  return {
    ...result.data,
    body: content.trim(),
    filePath,
  };
}

async function readAllTickets(dir: string): Promise<Task[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const tasks: Task[] = [];
  for (const entry of entries) {
    if (IGNORED_FILES.has(entry) || IGNORED_DIRS.has(entry)) continue;
    if (extname(entry) !== ".md") continue;
    const task = await parseTicketFile(join(dir, entry));
    if (task) tasks.push(task);
  }
  return tasks;
}

function matchesFilters(task: Task, filters: TaskFilters): boolean {
  if (filters.status) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    if (!statuses.includes(task.status)) return false;
  }

  if (filters.priority) {
    const priorities = Array.isArray(filters.priority)
      ? filters.priority
      : [filters.priority];
    if (!task.priority || !priorities.includes(task.priority)) return false;
  }

  if (filters.project !== undefined) {
    if (task.project !== filters.project) return false;
  }

  if (filters.epic !== undefined) {
    if (task.epic !== filters.epic) return false;
  }

  if (filters.sprint !== undefined) {
    if (task.sprint !== filters.sprint) return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    if (!task.tags) return false;
    if (!filters.tags.every((t) => task.tags!.includes(t))) return false;
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${task.title} ${task.body}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

export async function listTasks(
  dir: string,
  filters?: TaskFilters,
): Promise<Task[]> {
  const tasks = await readAllTickets(dir);
  if (!filters) return tasks;
  return tasks.filter((t) => matchesFilters(t, filters));
}

export async function getTask(
  dir: string,
  id: string,
): Promise<Task | null> {
  const tasks = await readAllTickets(dir);
  return tasks.find((t) => t.id === id) ?? null;
}

export async function searchTasks(
  dir: string,
  query: string,
): Promise<Task[]> {
  return listTasks(dir, { search: query });
}

export async function getProjects(dir: string): Promise<string[]> {
  const tasks = await readAllTickets(dir);
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.project) set.add(t.project);
  }
  return [...set].sort();
}

export async function getEpics(dir: string): Promise<string[]> {
  const tasks = await readAllTickets(dir);
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.epic) set.add(t.epic);
  }
  return [...set].sort();
}

export async function getSprints(dir: string): Promise<string[]> {
  const tasks = await readAllTickets(dir);
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.sprint) set.add(t.sprint);
  }
  return [...set].sort();
}

export async function getTags(dir: string): Promise<string[]> {
  const tasks = await readAllTickets(dir);
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.tags) {
      for (const tag of t.tags) set.add(tag);
    }
  }
  return [...set].sort();
}
