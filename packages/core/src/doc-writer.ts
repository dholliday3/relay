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
  CreateDocInputSchema,
  DocFrontmatterSchema,
  DocPatchSchema,
} from "./doc-schema.js";
import type { Doc, CreateDocInput, DocPatch } from "./doc-types.js";
import { nextIdForDir, formatFilename } from "./id.js";
import { getConfig } from "./config.js";
import { atomicWriteFile } from "./atomic.js";

const ARCHIVE_DIR = ".archive";

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()))].filter(
    (tag) => tag.length > 0,
  );
}

function buildFrontmatter(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      frontmatter[key] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return frontmatter;
}

async function findDocFile(
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

function serializeDoc(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return matter.stringify(body ? `\n${body}\n` : "", frontmatter);
}

export async function createDoc(
  rootDir: string,
  docsDir: string,
  input: CreateDocInput,
): Promise<Doc> {
  const rawInput = { ...input };
  if (rawInput.tags) {
    rawInput.tags = normalizeTags(rawInput.tags);
  }
  const validated = CreateDocInputSchema.parse(rawInput);

  const config = await getConfig(rootDir);
  const { id, filename } = await nextIdForDir(docsDir, config.docPrefix);
  const now = new Date();

  const tags =
    validated.tags && validated.tags.length > 0 ? validated.tags : undefined;
  const refs =
    validated.refs && validated.refs.length > 0 ? validated.refs : undefined;

  const frontmatter = buildFrontmatter({
    id,
    title: validated.title,
    tags,
    project: validated.project,
    refs,
    created: now,
    updated: now,
  });

  const body = validated.body ?? "";
  const filePath = join(docsDir, filename(validated.title));

  await mkdir(docsDir, { recursive: true });
  await atomicWriteFile(filePath, serializeDoc(frontmatter, body));

  return {
    id,
    title: validated.title,
    tags,
    project: validated.project,
    refs,
    created: now,
    updated: now,
    body,
    filePath,
  };
}

export async function updateDoc(
  docsDir: string,
  id: string,
  patch: DocPatch,
): Promise<Doc> {
  const rawPatch = { ...patch };
  if (rawPatch.tags) {
    rawPatch.tags = normalizeTags(rawPatch.tags);
  }
  const validated = DocPatchSchema.parse(rawPatch);

  const filePath = await findDocFile(docsDir, id);
  if (!filePath) throw new Error(`Doc not found: ${id}`);

  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  const existing = DocFrontmatterSchema.parse(parsed.data);
  const now = new Date();

  const updated = { ...existing, updated: now };
  if (validated.title !== undefined) updated.title = validated.title;
  if (validated.tags !== undefined) {
    updated.tags = validated.tags.length > 0 ? validated.tags : undefined;
  }
  if (validated.project !== undefined) {
    updated.project =
      validated.project === null ? undefined : validated.project;
  }
  if (validated.refs !== undefined) {
    updated.refs = validated.refs.length > 0 ? validated.refs : undefined;
  }

  const body =
    validated.body !== undefined ? validated.body : parsed.content.trim();

  const frontmatter = buildFrontmatter({
    id: updated.id,
    title: updated.title,
    tags: updated.tags,
    project: updated.project,
    refs: updated.refs,
    created: updated.created,
    updated: updated.updated,
  });

  let newFilePath = filePath;
  if (validated.title !== undefined && validated.title !== existing.title) {
    newFilePath = join(docsDir, formatFilename(id, validated.title));
  }

  await atomicWriteFile(newFilePath, serializeDoc(frontmatter, body));
  if (newFilePath !== filePath) {
    await unlink(filePath);
  }

  return { ...updated, body, filePath: newFilePath };
}

export async function deleteDoc(
  rootDir: string,
  docsDir: string,
  id: string,
): Promise<void> {
  const filePath = await findDocFile(docsDir, id);
  if (!filePath) throw new Error(`Doc not found: ${id}`);

  const config = await getConfig(rootDir);
  if (config.deleteMode === "archive") {
    const archiveDir = join(docsDir, ARCHIVE_DIR);
    await mkdir(archiveDir, { recursive: true });
    await rename(filePath, join(archiveDir, basename(filePath)));
  } else {
    await unlink(filePath);
  }
}

export async function restoreDoc(
  docsDir: string,
  id: string,
): Promise<Doc> {
  const archiveDir = join(docsDir, ARCHIVE_DIR);
  const archivedPath = await findDocFile(archiveDir, id);
  if (!archivedPath) throw new Error(`Archived doc not found: ${id}`);

  const restoredPath = join(docsDir, basename(archivedPath));
  await rename(archivedPath, restoredPath);

  const raw = await readFile(restoredPath, "utf-8");
  const parsed = matter(raw);
  const data = DocFrontmatterSchema.parse(parsed.data);

  return { ...data, body: parsed.content.trim(), filePath: restoredPath };
}
