/**
 * Handlers for `relay task <verb>` commands.
 *
 * Each handler takes a parsed Command + a `tasksDir` and returns a
 * HandlerResult (stdout/stderr/exitCode). The caller in bin/relay.ts
 * does the actual I/O — handlers stay pure for testability.
 *
 * All handlers go through `@relay/core` for the actual file ops, so
 * the on-disk format, ID assignment, frontmatter, locking, and counter
 * mechanics stay identical to the MCP server's surface. The CLI is a
 * thin client; the core is the source of truth.
 */

import { readFile } from "node:fs/promises";
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  toggleSubtask,
  addSubtask,
  reorderTask,
  sortTasks,
} from "../../packages/core/src/index.ts";
import type { Task, TaskFilters } from "../../packages/core/src/types.ts";
import type {
  TaskListCommand,
  TaskGetCommand,
  TaskCreateCommand,
  TaskUpdateCommand,
  TaskDeleteCommand,
  TaskLinkRefCommand,
  TaskAddSubtaskCommand,
  TaskCompleteSubtaskCommand,
  TaskReorderCommand,
} from "./parse.ts";

export interface HandlerResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export interface TaskCtx {
  tasksDir: string;
  /** Inject stdin reader for tests (default: read process.stdin). */
  readStdin?: () => Promise<string>;
}

// --- Output formatters (kept here, not extracted to a shared module
//     yet — plan/doc handlers will get their own analogous formatters
//     in Phase 3/4 and we'll consolidate if duplication actually
//     bothers us). Mirrors the MCP server's output shape so the skill
//     migration doesn't change what agents see in text mode.

function taskSummary(t: Task): string {
  const parts: string[] = [`[${t.id}] ${t.title}`, `status: ${t.status}`];
  if (t.priority) parts.push(`priority: ${t.priority}`);
  if (t.project) parts.push(`project: ${t.project}`);
  if (t.epic) parts.push(`epic: ${t.epic}`);
  if (t.sprint) parts.push(`sprint: ${t.sprint}`);
  if (t.tags && t.tags.length > 0) parts.push(`tags: ${t.tags.join(", ")}`);
  return parts.join(" | ");
}

function formatTaskFull(t: Task): string {
  const lines: string[] = [
    `# ${t.id}: ${t.title}`,
    "",
    `- Status: ${t.status}`,
    `- Priority: ${t.priority ?? "none"}`,
  ];
  if (t.project) lines.push(`- Project: ${t.project}`);
  if (t.epic) lines.push(`- Epic: ${t.epic}`);
  if (t.sprint) lines.push(`- Sprint: ${t.sprint}`);
  if (t.tags && t.tags.length > 0) lines.push(`- Tags: ${t.tags.join(", ")}`);
  if (t.assignee) lines.push(`- Assignee: ${t.assignee}`);
  if (t.createdBy) lines.push(`- Created by: ${t.createdBy}`);
  if (t.blockedBy && t.blockedBy.length > 0)
    lines.push(`- Blocked by: ${t.blockedBy.join(", ")}`);
  if (t.relatedTo && t.relatedTo.length > 0)
    lines.push(`- Related to: ${t.relatedTo.join(", ")}`);
  if (t.refs && t.refs.length > 0) lines.push(`- Refs: ${t.refs.join(", ")}`);
  if (t.order != null) lines.push(`- Order: ${t.order}`);
  lines.push(`- Created: ${t.created.toISOString()}`);
  lines.push(`- Updated: ${t.updated.toISOString()}`);
  if (t.body) {
    lines.push("", "---", "", t.body);
  }
  return lines.join("\n");
}

function taskJson(t: Task): Record<string, unknown> {
  // Date objects serialize via toJSON (ISO 8601) — explicit map is to
  // pin field order and document the public JSON shape.
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    project: t.project,
    epic: t.epic,
    sprint: t.sprint,
    tags: t.tags,
    assignee: t.assignee,
    createdBy: t.createdBy,
    blockedBy: t.blockedBy,
    relatedTo: t.relatedTo,
    refs: t.refs,
    order: t.order,
    created: t.created.toISOString(),
    updated: t.updated.toISOString(),
    body: t.body,
  };
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Resolve the body source for `create` / `update` commands. */
async function resolveBody(
  cmd: { body?: string; bodyFromFile?: string; bodyFromStdin: boolean },
  ctx: TaskCtx,
): Promise<string | undefined> {
  if (cmd.body !== undefined) return cmd.body;
  if (cmd.bodyFromFile) return readFile(cmd.bodyFromFile, "utf-8");
  if (cmd.bodyFromStdin) {
    return ctx.readStdin ? ctx.readStdin() : readStdinAll();
  }
  return undefined;
}

// --- Handlers ------------------------------------------------------

export async function runTaskList(
  cmd: TaskListCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const filters: TaskFilters = {};
  if (cmd.status) filters.status = cmd.status;
  if (cmd.priority) filters.priority = cmd.priority;
  if (cmd.project) filters.project = cmd.project;
  if (cmd.epic) filters.epic = cmd.epic;
  if (cmd.sprint) filters.sprint = cmd.sprint;
  if (cmd.tags.length > 0) filters.tags = cmd.tags;

  const tasks = await listTasks(
    ctx.tasksDir,
    Object.keys(filters).length > 0 ? filters : undefined,
  );
  const sorted = sortTasks(tasks);

  if (cmd.json) {
    return {
      stdout: JSON.stringify(sorted.map(taskJson)),
      exitCode: 0,
    };
  }

  if (sorted.length === 0) {
    return { stdout: "No tasks found.", exitCode: 0 };
  }

  const text = sorted.map(taskSummary).join("\n");
  return {
    stdout: `${sorted.length} task(s):\n\n${text}`,
    exitCode: 0,
  };
}

export async function runTaskGet(
  cmd: TaskGetCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const task = await getTask(ctx.tasksDir, cmd.id);
  if (!task) {
    return {
      stderr: `Task not found: ${cmd.id}`,
      exitCode: 1,
    };
  }
  if (cmd.json) {
    return { stdout: JSON.stringify(taskJson(task)), exitCode: 0 };
  }
  return { stdout: formatTaskFull(task), exitCode: 0 };
}

export async function runTaskCreate(
  cmd: TaskCreateCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const body = await resolveBody(cmd, ctx);

  // The core's CreateTaskInputSchema defaults status to "open". We
  // pass status explicitly only when the user gave one so the default
  // is governed in one place (the schema).
  const task = await createTask(ctx.tasksDir, {
    title: cmd.title,
    ...(cmd.status ? { status: cmd.status } : {}),
    ...(cmd.priority ? { priority: cmd.priority } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(cmd.project ? { project: cmd.project } : {}),
    ...(cmd.epic ? { epic: cmd.epic } : {}),
    ...(cmd.sprint ? { sprint: cmd.sprint } : {}),
    ...(cmd.tags.length > 0 ? { tags: cmd.tags } : {}),
    ...(cmd.blockedBy.length > 0 ? { blockedBy: cmd.blockedBy } : {}),
    ...(cmd.relatedTo.length > 0 ? { relatedTo: cmd.relatedTo } : {}),
    ...(cmd.assignee ? { assignee: cmd.assignee } : {}),
    ...(cmd.createdBy ? { createdBy: cmd.createdBy } : {}),
  });

  if (cmd.json) {
    return { stdout: JSON.stringify(taskJson(task)), exitCode: 0 };
  }
  return {
    stdout: `Created ${task.id}: ${task.title}\n\n${formatTaskFull(task)}`,
    exitCode: 0,
  };
}

/**
 * Compose a final list from existing values plus the four CLI knobs:
 * replace (full set), add (delta), remove (delta), clear. Replace and
 * clear are both "destructive" forms; add/remove operate on whichever
 * came out of replace-vs-existing. `clear` short-circuits everything.
 */
function applyListOps(
  existing: string[] | undefined,
  ops: {
    replace?: string[];
    add: string[];
    remove: string[];
    clear: boolean;
  },
): string[] | undefined {
  if (ops.clear) return [];
  let base: string[];
  if (ops.replace !== undefined) {
    base = [...ops.replace];
  } else {
    base = existing ? [...existing] : [];
  }
  for (const a of ops.add) {
    if (!base.includes(a)) base.push(a);
  }
  if (ops.remove.length > 0) {
    base = base.filter((v) => !ops.remove.includes(v));
  }
  // Return undefined when no ops were specified at all so we don't
  // accidentally clobber the existing field with [].
  const noOps =
    ops.replace === undefined &&
    ops.add.length === 0 &&
    ops.remove.length === 0 &&
    !ops.clear;
  if (noOps) return undefined;
  return base;
}

export async function runTaskUpdate(
  cmd: TaskUpdateCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const existing = await getTask(ctx.tasksDir, cmd.id);
  if (!existing) {
    return { stderr: `Task not found: ${cmd.id}`, exitCode: 1 };
  }

  const body = await resolveBody(cmd, ctx);

  const tags = applyListOps(existing.tags, {
    replace: cmd.replaceTags,
    add: cmd.addTags,
    remove: cmd.removeTags,
    clear: cmd.clearTags,
  });
  const blockedBy = applyListOps(existing.blockedBy, {
    replace: cmd.replaceBlockedBy,
    add: cmd.addBlockedBy,
    remove: cmd.removeBlockedBy,
    clear: cmd.clearBlockedBy,
  });
  const relatedTo = applyListOps(existing.relatedTo, {
    replace: cmd.replaceRelatedTo,
    add: cmd.addRelatedTo,
    remove: cmd.removeRelatedTo,
    clear: cmd.clearRelatedTo,
  });

  // Build the patch — only include fields the user actually touched so
  // the core sees a precise patch (matches MCP semantics where missing
  // fields are unchanged).
  const patch: Parameters<typeof updateTask>[2] = {};
  if (cmd.title !== undefined) patch.title = cmd.title;
  if (cmd.status !== undefined) patch.status = cmd.status;
  if (cmd.priority !== undefined) patch.priority = cmd.priority;
  else if (cmd.clearPriority) patch.priority = null;
  if (body !== undefined) patch.body = body;
  if (cmd.project !== undefined) patch.project = cmd.project;
  else if (cmd.clearProject) patch.project = null;
  if (cmd.epic !== undefined) patch.epic = cmd.epic;
  else if (cmd.clearEpic) patch.epic = null;
  if (cmd.sprint !== undefined) patch.sprint = cmd.sprint;
  else if (cmd.clearSprint) patch.sprint = null;
  if (cmd.assignee !== undefined) patch.assignee = cmd.assignee;
  else if (cmd.clearAssignee) patch.assignee = null;
  if (cmd.createdBy !== undefined) patch.createdBy = cmd.createdBy;
  else if (cmd.clearCreatedBy) patch.createdBy = null;
  if (tags !== undefined) patch.tags = tags;
  if (blockedBy !== undefined) patch.blockedBy = blockedBy;
  if (relatedTo !== undefined) patch.relatedTo = relatedTo;

  const updated = await updateTask(ctx.tasksDir, cmd.id, patch);
  if (cmd.json) {
    return { stdout: JSON.stringify(taskJson(updated)), exitCode: 0 };
  }
  return {
    stdout: `Updated ${updated.id}\n\n${formatTaskFull(updated)}`,
    exitCode: 0,
  };
}

export async function runTaskDelete(
  cmd: TaskDeleteCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const existing = await getTask(ctx.tasksDir, cmd.id);
  if (!existing) {
    return { stderr: `Task not found: ${cmd.id}`, exitCode: 1 };
  }
  await deleteTask(ctx.tasksDir, cmd.id);
  return { stdout: `Deleted task ${cmd.id}`, exitCode: 0 };
}

export async function runTaskLinkRef(
  cmd: TaskLinkRefCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const task = await getTask(ctx.tasksDir, cmd.id);
  if (!task) {
    return { stderr: `Task not found: ${cmd.id}`, exitCode: 1 };
  }
  const existing = task.refs ?? [];
  if (existing.includes(cmd.ref)) {
    return {
      stdout: `Ref already linked to ${cmd.id}: ${cmd.ref}`,
      exitCode: 0,
    };
  }
  await updateTask(ctx.tasksDir, cmd.id, { refs: [...existing, cmd.ref] });
  return { stdout: `Linked ${cmd.ref} to ${cmd.id}`, exitCode: 0 };
}

export async function runTaskAddSubtask(
  cmd: TaskAddSubtaskCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const existing = await getTask(ctx.tasksDir, cmd.id);
  if (!existing) {
    return { stderr: `Task not found: ${cmd.id}`, exitCode: 1 };
  }
  const updated = await addSubtask(ctx.tasksDir, cmd.id, cmd.text);
  return {
    stdout: `Added subtask to ${updated.id}: ${cmd.text}`,
    exitCode: 0,
  };
}

export async function runTaskCompleteSubtask(
  cmd: TaskCompleteSubtaskCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const task = await getTask(ctx.tasksDir, cmd.id);
  if (!task) {
    return { stderr: `Task not found: ${cmd.id}`, exitCode: 1 };
  }

  // Resolve the index. Mirrors the MCP server's resolution — index wins
  // when both are passed (the parser already rejects that case, but the
  // safety net is cheap and matches the MCP semantics).
  let targetIndex: number;
  if (cmd.index != null) {
    targetIndex = cmd.index;
  } else if (cmd.text) {
    const checkboxRegex = /^\s*- \[( |x)\]\s*(.*)$/;
    const lines = task.body.split("\n");
    const query = cmd.text.toLowerCase();
    let foundIndex = -1;
    let idx = 0;
    for (const line of lines) {
      const match = line.match(checkboxRegex);
      if (match) {
        if (match[2].toLowerCase().includes(query)) {
          foundIndex = idx;
          break;
        }
        idx++;
      }
    }
    if (foundIndex === -1) {
      return {
        stderr: `No subtask matching "${cmd.text}" found in ${cmd.id}`,
        exitCode: 1,
      };
    }
    targetIndex = foundIndex;
  } else {
    // Should be unreachable — the parser rejects this case.
    return {
      stderr: "complete-subtask requires --index or --text",
      exitCode: 1,
    };
  }

  // Detect already-complete to give a clearer message than the MCP's
  // "toggled to unchecked." The CLI semantically means "mark done."
  const checkboxRegex = /^\s*- \[( |x)\]\s*(.*)$/;
  const lines = task.body.split("\n");
  let idx = 0;
  for (const line of lines) {
    const match = line.match(checkboxRegex);
    if (match) {
      if (idx === targetIndex) {
        if (match[1] === "x") {
          return {
            stdout: `Subtask ${targetIndex} is already complete: ${match[2].trim()}`,
            exitCode: 0,
          };
        }
        break;
      }
      idx++;
    }
  }

  const updated = await toggleSubtask(ctx.tasksDir, cmd.id, targetIndex);
  return {
    stdout: `Completed subtask ${targetIndex} in ${updated.id}`,
    exitCode: 0,
  };
}

export async function runTaskReorder(
  cmd: TaskReorderCommand,
  ctx: TaskCtx,
): Promise<HandlerResult> {
  const updated = await reorderTask(
    ctx.tasksDir,
    cmd.id,
    cmd.afterId ?? null,
    cmd.beforeId ?? null,
  );
  return {
    stdout: `Reordered ${updated.id} (new order: ${updated.order})`,
    exitCode: 0,
  };
}
