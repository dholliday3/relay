import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import matter from "gray-matter";
import { DocFrontmatterSchema } from "./doc-schema.js";
import type { Doc, DocFilters } from "./doc-types.js";

const IGNORED_FILES = new Set([".counter"]);
const IGNORED_DIRS = new Set([".archive"]);

async function parseDocFile(filePath: string): Promise<Doc | null> {
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);
  const result = DocFrontmatterSchema.safeParse(data);
  if (!result.success) return null;
  return {
    ...result.data,
    body: content.trim(),
    filePath,
  };
}

async function readAllDocs(dir: string): Promise<Doc[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const docs: Doc[] = [];
  for (const entry of entries) {
    if (IGNORED_FILES.has(entry) || IGNORED_DIRS.has(entry)) continue;
    if (extname(entry) !== ".md") continue;
    const doc = await parseDocFile(join(dir, entry));
    if (doc) docs.push(doc);
  }
  return docs;
}

function matchesFilters(doc: Doc, filters: DocFilters): boolean {
  if (filters.project !== undefined && doc.project !== filters.project) {
    return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    if (!doc.tags) return false;
    if (!filters.tags.every((tag) => doc.tags!.includes(tag))) return false;
  }

  if (filters.search) {
    const query = filters.search.toLowerCase();
    const haystack = `${doc.title} ${doc.body}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  return true;
}

export async function listDocs(
  dir: string,
  filters?: DocFilters,
): Promise<Doc[]> {
  const docs = await readAllDocs(dir);
  if (!filters) return docs;
  return docs.filter((doc) => matchesFilters(doc, filters));
}

export async function getDoc(
  dir: string,
  id: string,
): Promise<Doc | null> {
  const docs = await readAllDocs(dir);
  return docs.find((doc) => doc.id === id) ?? null;
}

export async function searchDocs(
  dir: string,
  query: string,
): Promise<Doc[]> {
  return listDocs(dir, { search: query });
}

export async function getDocProjects(dir: string): Promise<string[]> {
  const docs = await readAllDocs(dir);
  const projects = new Set<string>();
  for (const doc of docs) {
    if (doc.project) projects.add(doc.project);
  }
  return [...projects].sort();
}

export async function getDocTags(dir: string): Promise<string[]> {
  const docs = await readAllDocs(dir);
  const tags = new Set<string>();
  for (const doc of docs) {
    if (!doc.tags) continue;
    for (const tag of doc.tags) tags.add(tag);
  }
  return [...tags].sort();
}
