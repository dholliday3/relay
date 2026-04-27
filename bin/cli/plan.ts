/**
 * Handlers for `relay plan <verb>` commands. Same shape as task.ts —
 * pure handlers that return HandlerResult and do all I/O through the
 * dispatcher in bin/relay.ts.
 *
 * Plans are simpler than tasks (no subtasks, priority, epic/sprint,
 * reorder), so the surface is correspondingly tighter — but the
 * delta-vs-replace-vs-clear pattern on `tags` and `tasks` is shared
 * with task update.
 */

import { readFile } from "node:fs/promises";
import {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  cutTasksFromPlan,
} from "../../packages/core/src/index.ts";
import type { Plan } from "../../packages/core/src/index.ts";
import type {
  PlanListCommand,
  PlanGetCommand,
  PlanCreateCommand,
  PlanUpdateCommand,
  PlanDeleteCommand,
  PlanLinkTaskCommand,
  PlanCutTasksCommand,
} from "./parse.ts";
import type { HandlerResult } from "./task.ts";

export interface PlanCtx {
  /** Project root (parent of .relay/) — required for createPlan, deletePlan, cutTasksFromPlan. */
  rootDir: string;
  plansDir: string;
  /** Inject stdin reader for tests. */
  readStdin?: () => Promise<string>;
}

// --- Output formatters ---------------------------------------------

function planSummary(p: Plan): string {
  const parts: string[] = [`[${p.id}] ${p.title}`, `status: ${p.status}`];
  if (p.project) parts.push(`project: ${p.project}`);
  if (p.tags && p.tags.length > 0) parts.push(`tags: ${p.tags.join(", ")}`);
  if (p.tasks && p.tasks.length > 0) parts.push(`tasks: ${p.tasks.join(", ")}`);
  return parts.join(" | ");
}

function formatPlanFull(p: Plan): string {
  const lines: string[] = [
    `# ${p.id}: ${p.title}`,
    "",
    `- Status: ${p.status}`,
  ];
  if (p.project) lines.push(`- Project: ${p.project}`);
  if (p.assignee) lines.push(`- Assignee: ${p.assignee}`);
  if (p.createdBy) lines.push(`- Created by: ${p.createdBy}`);
  if (p.tags && p.tags.length > 0) lines.push(`- Tags: ${p.tags.join(", ")}`);
  if (p.tasks && p.tasks.length > 0)
    lines.push(`- Linked tasks: ${p.tasks.join(", ")}`);
  if (p.refs && p.refs.length > 0) lines.push(`- Refs: ${p.refs.join(", ")}`);
  lines.push(`- Created: ${p.created.toISOString()}`);
  lines.push(`- Updated: ${p.updated.toISOString()}`);
  if (p.body) {
    lines.push("", "---", "", p.body);
  }
  return lines.join("\n");
}

function planJson(p: Plan): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    project: p.project,
    tags: p.tags,
    tasks: p.tasks,
    assignee: p.assignee,
    createdBy: p.createdBy,
    refs: p.refs,
    created: p.created.toISOString(),
    updated: p.updated.toISOString(),
    body: p.body,
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
  ctx: PlanCtx,
): Promise<string | undefined> {
  if (cmd.body !== undefined) return cmd.body;
  if (cmd.bodyFromFile) return readFile(cmd.bodyFromFile, "utf-8");
  if (cmd.bodyFromStdin) {
    return ctx.readStdin ? ctx.readStdin() : readStdinAll();
  }
  return undefined;
}

/**
 * Same shape as task.ts#applyListOps. Duplicated rather than shared so
 * the two callers stay independent — when doc handlers (Phase 4) need
 * the same pattern, all three callers will move to a shared module.
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
  const noOps =
    ops.replace === undefined &&
    ops.add.length === 0 &&
    ops.remove.length === 0 &&
    !ops.clear;
  if (noOps) return undefined;
  return base;
}

// --- Handlers ------------------------------------------------------

export async function runPlanList(
  cmd: PlanListCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const filters: Record<string, unknown> = {};
  if (cmd.status) filters.status = cmd.status;
  if (cmd.project) filters.project = cmd.project;
  if (cmd.tags.length > 0) filters.tags = cmd.tags;

  const plans = await listPlans(
    ctx.plansDir,
    Object.keys(filters).length > 0 ? filters : undefined,
  );

  if (cmd.json) {
    return { stdout: JSON.stringify(plans.map(planJson)), exitCode: 0 };
  }

  if (plans.length === 0) {
    return { stdout: "No plans found.", exitCode: 0 };
  }

  const text = plans.map(planSummary).join("\n");
  return {
    stdout: `${plans.length} plan(s):\n\n${text}`,
    exitCode: 0,
  };
}

export async function runPlanGet(
  cmd: PlanGetCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const plan = await getPlan(ctx.plansDir, cmd.id);
  if (!plan) {
    return { stderr: `Plan not found: ${cmd.id}`, exitCode: 1 };
  }
  if (cmd.json) {
    return { stdout: JSON.stringify(planJson(plan)), exitCode: 0 };
  }
  return { stdout: formatPlanFull(plan), exitCode: 0 };
}

export async function runPlanCreate(
  cmd: PlanCreateCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const body = await resolveBody(cmd, ctx);

  const plan = await createPlan(ctx.rootDir, ctx.plansDir, {
    title: cmd.title,
    ...(cmd.status ? { status: cmd.status } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(cmd.project ? { project: cmd.project } : {}),
    ...(cmd.tags.length > 0 ? { tags: cmd.tags } : {}),
    ...(cmd.tasks.length > 0 ? { tasks: cmd.tasks } : {}),
    ...(cmd.assignee ? { assignee: cmd.assignee } : {}),
    ...(cmd.createdBy ? { createdBy: cmd.createdBy } : {}),
  });

  if (cmd.json) {
    return { stdout: JSON.stringify(planJson(plan)), exitCode: 0 };
  }
  return {
    stdout: `Created ${plan.id}: ${plan.title}\n\n${formatPlanFull(plan)}`,
    exitCode: 0,
  };
}

export async function runPlanUpdate(
  cmd: PlanUpdateCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const existing = await getPlan(ctx.plansDir, cmd.id);
  if (!existing) {
    return { stderr: `Plan not found: ${cmd.id}`, exitCode: 1 };
  }

  const body = await resolveBody(cmd, ctx);

  const tags = applyListOps(existing.tags, {
    replace: cmd.replaceTags,
    add: cmd.addTags,
    remove: cmd.removeTags,
    clear: cmd.clearTags,
  });
  const tasks = applyListOps(existing.tasks, {
    replace: cmd.replaceTasks,
    add: cmd.addTasks,
    remove: cmd.removeTasks,
    clear: cmd.clearTasks,
  });

  const patch: Parameters<typeof updatePlan>[2] = {};
  if (cmd.title !== undefined) patch.title = cmd.title;
  if (cmd.status !== undefined) patch.status = cmd.status;
  if (body !== undefined) patch.body = body;
  if (cmd.project !== undefined) patch.project = cmd.project;
  else if (cmd.clearProject) patch.project = null;
  if (cmd.assignee !== undefined) patch.assignee = cmd.assignee;
  else if (cmd.clearAssignee) patch.assignee = null;
  if (cmd.createdBy !== undefined) patch.createdBy = cmd.createdBy;
  else if (cmd.clearCreatedBy) patch.createdBy = null;
  if (tags !== undefined) patch.tags = tags;
  if (tasks !== undefined) patch.tasks = tasks;

  const updated = await updatePlan(ctx.plansDir, cmd.id, patch);
  if (cmd.json) {
    return { stdout: JSON.stringify(planJson(updated)), exitCode: 0 };
  }
  return {
    stdout: `Updated ${updated.id}\n\n${formatPlanFull(updated)}`,
    exitCode: 0,
  };
}

export async function runPlanDelete(
  cmd: PlanDeleteCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const existing = await getPlan(ctx.plansDir, cmd.id);
  if (!existing) {
    return { stderr: `Plan not found: ${cmd.id}`, exitCode: 1 };
  }
  await deletePlan(ctx.rootDir, ctx.plansDir, cmd.id);
  return { stdout: `Deleted plan ${cmd.id}`, exitCode: 0 };
}

export async function runPlanLinkTask(
  cmd: PlanLinkTaskCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const plan = await getPlan(ctx.plansDir, cmd.planId);
  if (!plan) {
    return { stderr: `Plan not found: ${cmd.planId}`, exitCode: 1 };
  }
  const existing = plan.tasks ?? [];
  if (existing.includes(cmd.taskId)) {
    return {
      stdout: `Task ${cmd.taskId} already linked to ${cmd.planId}`,
      exitCode: 0,
    };
  }
  await updatePlan(ctx.plansDir, cmd.planId, {
    tasks: [...existing, cmd.taskId],
  });
  return {
    stdout: `Linked ${cmd.taskId} to plan ${cmd.planId}`,
    exitCode: 0,
  };
}

export async function runPlanCutTasks(
  cmd: PlanCutTasksCommand,
  ctx: PlanCtx,
): Promise<HandlerResult> {
  const result = await cutTasksFromPlan(ctx.rootDir, ctx.plansDir, cmd.planId);

  if (cmd.json) {
    return {
      stdout: JSON.stringify({
        planId: cmd.planId,
        createdTaskIds: result.createdTasks.map((t) => t.id),
      }),
      exitCode: 0,
    };
  }

  if (result.createdTasks.length === 0) {
    return {
      stdout: `No unchecked items found in ${cmd.planId}`,
      exitCode: 0,
    };
  }

  const lines = result.createdTasks
    .map((t) => `  - ${t.id}: ${t.title}`)
    .join("\n");
  return {
    stdout: `Cut ${result.createdTasks.length} task(s) from plan ${cmd.planId}:\n${lines}`,
    exitCode: 0,
  };
}
