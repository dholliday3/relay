import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import matter from "gray-matter";
import { PlanFrontmatterSchema } from "./plan-schema.js";
import type { Plan, PlanFilters } from "./plan-types.js";

const IGNORED_FILES = new Set([".counter", ".config.yaml"]);
const IGNORED_DIRS = new Set([".archive"]);

async function parsePlanFile(filePath: string): Promise<Plan | null> {
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);
  const result = PlanFrontmatterSchema.safeParse(data);
  if (!result.success) return null;
  return {
    ...result.data,
    body: content.trim(),
    filePath,
  };
}

async function readAllPlans(dir: string): Promise<Plan[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const plans: Plan[] = [];
  for (const entry of entries) {
    if (IGNORED_FILES.has(entry) || IGNORED_DIRS.has(entry)) continue;
    if (extname(entry) !== ".md") continue;
    const plan = await parsePlanFile(join(dir, entry));
    if (plan) plans.push(plan);
  }
  return plans;
}

function matchesFilters(plan: Plan, filters: PlanFilters): boolean {
  if (filters.status) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    if (!statuses.includes(plan.status)) return false;
  }

  if (filters.project !== undefined) {
    if (plan.project !== filters.project) return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    if (!plan.tags) return false;
    if (!filters.tags.every((t) => plan.tags!.includes(t))) return false;
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${plan.title} ${plan.body}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

export async function listPlans(
  dir: string,
  filters?: PlanFilters,
): Promise<Plan[]> {
  const plans = await readAllPlans(dir);
  if (!filters) return plans;
  return plans.filter((p) => matchesFilters(p, filters));
}

export async function getPlan(
  dir: string,
  id: string,
): Promise<Plan | null> {
  const plans = await readAllPlans(dir);
  return plans.find((p) => p.id === id) ?? null;
}

export async function searchPlans(
  dir: string,
  query: string,
): Promise<Plan[]> {
  return listPlans(dir, { search: query });
}

export async function getPlanProjects(dir: string): Promise<string[]> {
  const plans = await readAllPlans(dir);
  const set = new Set<string>();
  for (const p of plans) {
    if (p.project) set.add(p.project);
  }
  return [...set].sort();
}

export async function getPlanTags(dir: string): Promise<string[]> {
  const plans = await readAllPlans(dir);
  const set = new Set<string>();
  for (const p of plans) {
    if (p.tags) {
      for (const tag of p.tags) set.add(tag);
    }
  }
  return [...set].sort();
}
