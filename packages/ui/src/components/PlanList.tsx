import { useCallback, useState } from "react";
import {
  DndContext,
  closestCorners,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CaretDownIcon, DotsSixVerticalIcon } from "@phosphor-icons/react";
import type { Plan, PlanStatus } from "../types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_ORDER: { key: PlanStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

// Prefer pointer-based hit testing so drops over a group header (or an empty
// group) still land on the right status group, rather than the nearest row.
const planListCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const itemHit = pointerHits.find(
      (c) => !String(c.id).startsWith("group-"),
    );
    return itemHit ? [itemHit] : pointerHits;
  }
  return closestCorners(args);
};

interface PlanListProps {
  plans: Plan[];
  activePlanId: string | null;
  hideBadges: boolean;
  onSelect: (plan: Plan) => void;
  onMove?: (planId: string, newStatus: PlanStatus) => void;
}

function PlanRowContent({ plan, hideBadges }: { plan: Plan; hideBadges: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[13px] font-semibold">{plan.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{plan.id}</span>
        {!hideBadges && plan.tasks && plan.tasks.length > 0 && (
          <Badge variant="secondary">
            {plan.tasks.length} task{plan.tasks.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {!hideBadges && plan.tags?.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
          {relativeTime(plan.updated)}
        </span>
      </div>
    </div>
  );
}

function DraggablePlanRow({
  plan,
  activePlanId,
  hideBadges,
  onSelect,
  isDragActive,
  draggable,
}: {
  plan: Plan;
  activePlanId: string | null;
  hideBadges: boolean;
  onSelect: (plan: Plan) => void;
  isDragActive: boolean;
  draggable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({ id: plan.id, disabled: !draggable });

  const isActive = plan.id === activePlanId;

  // Don't apply transform to the source — DragOverlay renders the drag preview.
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/row relative flex w-full items-center border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent",
        isActive && "border-l-2 border-l-primary bg-accent pl-[10px]",
      )}
      onClick={() => onSelect(plan)}
      {...attributes}
    >
      {draggable && (
        <span
          ref={setActivatorNodeRef}
          className={cn(
            "mr-1 flex w-[18px] shrink-0 touch-none cursor-grab items-center justify-center py-0.5 text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing group-hover/row:opacity-100",
            isDragActive && "opacity-100",
          )}
          aria-label="Drag to change status"
          {...listeners}
        >
          <DotsSixVerticalIcon className="size-3.5" />
        </span>
      )}
      <PlanRowContent plan={plan} hideBadges={hideBadges} />
    </button>
  );
}

function DroppableGroup({
  status,
  isDragActive,
  children,
}: {
  status: PlanStatus;
  isDragActive: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${status}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-colors",
        isDragActive && "ring-1 ring-inset ring-border/50",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      {children}
    </div>
  );
}

export function PlanList({
  plans,
  activePlanId,
  hideBadges,
  onSelect,
  onMove,
}: PlanListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    completed: true,
    archived: true,
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sortedGroups = new Map<PlanStatus, Plan[]>();
  for (const { key } of STATUS_ORDER) {
    const group = plans
      .filter((p) => p.status === key)
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    sortedGroups.set(key, group);
  }

  const findStatusGroup = useCallback(
    (planId: string): PlanStatus | null => {
      for (const [status, group] of sortedGroups) {
        if (group.some((p) => p.id === planId)) return status;
      }
      return null;
    },
    [sortedGroups],
  );

  const activePlan = activeId ? plans.find((p) => p.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !onMove) return;

    const activeStatus = findStatusGroup(active.id as string);
    const overIdStr = over.id as string;

    // If we dropped on a group droppable use it directly; otherwise figure out
    // which group the hovered plan belongs to.
    let targetStatus: PlanStatus | null = null;
    if (overIdStr.startsWith("group-")) {
      targetStatus = overIdStr.replace("group-", "") as PlanStatus;
    } else {
      targetStatus = findStatusGroup(overIdStr);
    }

    if (!activeStatus || !targetStatus || activeStatus === targetStatus) return;
    onMove(active.id as string, targetStatus);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={planListCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col">
        {STATUS_ORDER.map(({ key, label }) => {
          const group = sortedGroups.get(key) ?? [];
          const isCollapsed = collapsed[key];

          return (
            <DroppableGroup
              key={key}
              status={key}
              isDragActive={activeId !== null}
            >
              <div className="flex items-center">
                <button
                  className="flex flex-1 items-center gap-1.5 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => toggleGroup(key)}
                  aria-expanded={!isCollapsed}
                >
                  <CaretDownIcon
                    className={cn(
                      "size-2.5 transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                  <span>{label}</span>
                  <span className="ml-auto font-normal tabular-nums text-muted-foreground">
                    {group.length}
                  </span>
                </button>
              </div>
              {!isCollapsed && (
                <div>
                  {group.map((plan) => (
                    <DraggablePlanRow
                      key={plan.id}
                      plan={plan}
                      activePlanId={activePlanId}
                      hideBadges={hideBadges}
                      onSelect={onSelect}
                      isDragActive={activeId !== null}
                      draggable={Boolean(onMove)}
                    />
                  ))}
                </div>
              )}
            </DroppableGroup>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePlan ? (
          <div className="flex w-[280px] items-center rounded-md border border-primary bg-card px-3 py-2 opacity-95 shadow-lg">
            <PlanRowContent plan={activePlan} hideBadges={hideBadges} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
