import { listTasks } from "./reader.js";
import { updateTask } from "./writer.js";
import type { Task } from "./types.js";

const REBALANCE_STEP = 1000;
const MAX_DECIMAL_PLACES = 10;

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function decimalPlaces(n: number): number {
  const s = n.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Sort tasks: ordered tasks first (by order asc), then unordered
 * tasks by priority (urgent→low) then updated date (newest first).
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aHasOrder = a.order != null;
    const bHasOrder = b.order != null;

    if (aHasOrder && bHasOrder) return a.order! - b.order!;
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;

    // Both unordered: sort by priority then updated date
    const aPri = a.priority ? (PRIORITY_RANK[a.priority] ?? 4) : 4;
    const bPri = b.priority ? (PRIORITY_RANK[b.priority] ?? 4) : 4;
    if (aPri !== bPri) return aPri - bPri;

    return b.updated.getTime() - a.updated.getTime();
  });
}

/**
 * Rebalance order values for all tasks with a given status to clean
 * integers (1000, 2000, 3000, ...).
 */
export async function rebalanceOrder(
  dir: string,
  status: string,
): Promise<void> {
  const tasks = await listTasks(dir, { status: status as "draft" | "backlog" | "open" | "in-progress" | "done" | "cancelled" });
  const sorted = sortTasks(tasks);

  for (let i = 0; i < sorted.length; i++) {
    const newOrder = (i + 1) * REBALANCE_STEP;
    if (sorted[i].order !== newOrder) {
      await updateTask(dir, sorted[i].id, { order: newOrder });
    }
  }
}

/**
 * Reorder a task by placing it between two neighbors. Calculates the
 * midpoint order value. If the midpoint requires more than 10 decimal
 * places, triggers an automatic rebalance first, then recalculates.
 *
 * @param dir - .tasks directory path
 * @param id - task to move
 * @param afterId - task above (lower order), or null if placing at top
 * @param beforeId - task below (higher order), or null if placing at bottom
 */
export async function reorderTask(
  dir: string,
  id: string,
  afterId: string | null,
  beforeId: string | null,
): Promise<Task> {
  const task = await getNeighborOrder(dir, id);
  if (!task) throw new Error(`Task not found: ${id}`);

  const afterOrder = afterId ? await getNeighborOrder(dir, afterId) : null;
  const beforeOrder = beforeId ? await getNeighborOrder(dir, beforeId) : null;

  let newOrder = calculateMidpoint(
    afterOrder?.order ?? null,
    beforeOrder?.order ?? null,
  );

  if (decimalPlaces(newOrder) > MAX_DECIMAL_PLACES) {
    await rebalanceOrder(dir, task.status);
    // Re-read neighbor orders after rebalance
    const afterRebalanced = afterId
      ? await getNeighborOrder(dir, afterId)
      : null;
    const beforeRebalanced = beforeId
      ? await getNeighborOrder(dir, beforeId)
      : null;
    newOrder = calculateMidpoint(
      afterRebalanced?.order ?? null,
      beforeRebalanced?.order ?? null,
    );
  }

  return updateTask(dir, id, { order: newOrder });
}

async function getNeighborOrder(
  dir: string,
  id: string,
): Promise<{ order: number | undefined; status: string } | null> {
  const tasks = await listTasks(dir);
  const t = tasks.find((t) => t.id === id);
  if (!t) return null;
  return { order: t.order, status: t.status };
}

function calculateMidpoint(
  afterOrder: number | null | undefined,
  beforeOrder: number | null | undefined,
): number {
  const after = afterOrder ?? null;
  const before = beforeOrder ?? null;

  if (after != null && before != null) {
    return (after + before) / 2;
  }
  if (after != null) {
    return after + REBALANCE_STEP;
  }
  if (before != null) {
    return before > REBALANCE_STEP ? before - REBALANCE_STEP : before / 2;
  }
  return REBALANCE_STEP;
}
