/**
 * Handlers for `relay doc <verb>` commands. Smallest noun surface in
 * relay — docs are reference material so they don't have status,
 * priority, subtasks, or workflow state. Just title, tags, project,
 * createdBy, refs, body.
 */

import { readFile } from "node:fs/promises";
import {
  listDocs,
  getDoc,
  createDoc,
  updateDoc,
  deleteDoc,
} from "../../packages/core/src/index.ts";
import type { Doc } from "../../packages/core/src/index.ts";
import { applyListOps } from "./list-ops.ts";
import type {
  DocListCommand,
  DocGetCommand,
  DocCreateCommand,
  DocUpdateCommand,
  DocDeleteCommand,
} from "./parse.ts";
import type { HandlerResult } from "./task.ts";

export interface DocCtx {
  /** Project root (.relay/) — required for createDoc, deleteDoc. */
  rootDir: string;
  docsDir: string;
  /** Inject stdin reader for tests. */
  readStdin?: () => Promise<string>;
}

// --- Output formatters ---------------------------------------------

function docSummary(d: Doc): string {
  const parts: string[] = [`[${d.id}] ${d.title}`];
  if (d.project) parts.push(`project: ${d.project}`);
  if (d.tags && d.tags.length > 0) parts.push(`tags: ${d.tags.join(", ")}`);
  return parts.join(" | ");
}

function formatDocFull(d: Doc): string {
  const lines: string[] = [`# ${d.id}: ${d.title}`, ""];
  if (d.project) lines.push(`- Project: ${d.project}`);
  if (d.createdBy) lines.push(`- Created by: ${d.createdBy}`);
  if (d.tags && d.tags.length > 0) lines.push(`- Tags: ${d.tags.join(", ")}`);
  if (d.refs && d.refs.length > 0) lines.push(`- Refs: ${d.refs.join(", ")}`);
  lines.push(`- Created: ${d.created.toISOString()}`);
  lines.push(`- Updated: ${d.updated.toISOString()}`);
  if (d.body) {
    lines.push("", "---", "", d.body);
  }
  return lines.join("\n");
}

function docJson(d: Doc): Record<string, unknown> {
  return {
    id: d.id,
    title: d.title,
    project: d.project,
    tags: d.tags,
    createdBy: d.createdBy,
    refs: d.refs,
    created: d.created.toISOString(),
    updated: d.updated.toISOString(),
    body: d.body,
  };
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function resolveBody(
  cmd: { body?: string; bodyFromFile?: string; bodyFromStdin: boolean },
  ctx: DocCtx,
): Promise<string | undefined> {
  if (cmd.body !== undefined) return cmd.body;
  if (cmd.bodyFromFile) return readFile(cmd.bodyFromFile, "utf-8");
  if (cmd.bodyFromStdin) {
    return ctx.readStdin ? ctx.readStdin() : readStdinAll();
  }
  return undefined;
}

// --- Handlers ------------------------------------------------------

export async function runDocList(
  cmd: DocListCommand,
  ctx: DocCtx,
): Promise<HandlerResult> {
  const filters: Record<string, unknown> = {};
  if (cmd.project) filters.project = cmd.project;
  if (cmd.tags.length > 0) filters.tags = cmd.tags;

  const docs = await listDocs(
    ctx.docsDir,
    Object.keys(filters).length > 0 ? filters : undefined,
  );

  if (cmd.json) {
    return { stdout: JSON.stringify(docs.map(docJson)), exitCode: 0 };
  }

  if (docs.length === 0) {
    return { stdout: "No docs found.", exitCode: 0 };
  }

  const text = docs.map(docSummary).join("\n");
  return {
    stdout: `${docs.length} doc(s):\n\n${text}`,
    exitCode: 0,
  };
}

export async function runDocGet(
  cmd: DocGetCommand,
  ctx: DocCtx,
): Promise<HandlerResult> {
  const doc = await getDoc(ctx.docsDir, cmd.id);
  if (!doc) {
    return { stderr: `Doc not found: ${cmd.id}`, exitCode: 1 };
  }
  if (cmd.json) {
    return { stdout: JSON.stringify(docJson(doc)), exitCode: 0 };
  }
  return { stdout: formatDocFull(doc), exitCode: 0 };
}

export async function runDocCreate(
  cmd: DocCreateCommand,
  ctx: DocCtx,
): Promise<HandlerResult> {
  const body = await resolveBody(cmd, ctx);

  const doc = await createDoc(ctx.rootDir, ctx.docsDir, {
    title: cmd.title,
    ...(body !== undefined ? { body } : {}),
    ...(cmd.project ? { project: cmd.project } : {}),
    ...(cmd.tags.length > 0 ? { tags: cmd.tags } : {}),
    ...(cmd.refs.length > 0 ? { refs: cmd.refs } : {}),
    ...(cmd.createdBy ? { createdBy: cmd.createdBy } : {}),
  });

  if (cmd.json) {
    return { stdout: JSON.stringify(docJson(doc)), exitCode: 0 };
  }
  return {
    stdout: `Created ${doc.id}: ${doc.title}\n\n${formatDocFull(doc)}`,
    exitCode: 0,
  };
}

export async function runDocUpdate(
  cmd: DocUpdateCommand,
  ctx: DocCtx,
): Promise<HandlerResult> {
  const existing = await getDoc(ctx.docsDir, cmd.id);
  if (!existing) {
    return { stderr: `Doc not found: ${cmd.id}`, exitCode: 1 };
  }

  const body = await resolveBody(cmd, ctx);

  const tags = applyListOps(existing.tags, {
    replace: cmd.replaceTags,
    add: cmd.addTags,
    remove: cmd.removeTags,
    clear: cmd.clearTags,
  });
  const refs = applyListOps(existing.refs, {
    replace: cmd.replaceRefs,
    add: cmd.addRefs,
    remove: cmd.removeRefs,
    clear: cmd.clearRefs,
  });

  const patch: Parameters<typeof updateDoc>[2] = {};
  if (cmd.title !== undefined) patch.title = cmd.title;
  if (body !== undefined) patch.body = body;
  if (cmd.project !== undefined) patch.project = cmd.project;
  else if (cmd.clearProject) patch.project = null;
  if (cmd.createdBy !== undefined) patch.createdBy = cmd.createdBy;
  else if (cmd.clearCreatedBy) patch.createdBy = null;
  if (tags !== undefined) patch.tags = tags;
  if (refs !== undefined) patch.refs = refs;

  const updated = await updateDoc(ctx.docsDir, cmd.id, patch);
  if (cmd.json) {
    return { stdout: JSON.stringify(docJson(updated)), exitCode: 0 };
  }
  return {
    stdout: `Updated ${updated.id}\n\n${formatDocFull(updated)}`,
    exitCode: 0,
  };
}

export async function runDocDelete(
  cmd: DocDeleteCommand,
  ctx: DocCtx,
): Promise<HandlerResult> {
  const existing = await getDoc(ctx.docsDir, cmd.id);
  if (!existing) {
    return { stderr: `Doc not found: ${cmd.id}`, exitCode: 1 };
  }
  await deleteDoc(ctx.rootDir, ctx.docsDir, cmd.id);
  return { stdout: `Deleted doc ${cmd.id}`, exitCode: 0 };
}
