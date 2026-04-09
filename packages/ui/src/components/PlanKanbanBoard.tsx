import { useState, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Plan, PlanStatus } from "../types";

const KANBAN_COLUMNS: { key: PlanStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];

function sortByUpdated(plans: Plan[]): Plan[] {
  return [...plans].sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
  );
}

function buildGroups(plans: Plan[]): Record<PlanStatus, string[]> {
  const grouped: Partial<Record<PlanStatus, Plan[]>> = {};
  for (const col of KANBAN_COLUMNS) grouped[col.key] = [];
  for (const p of plans) grouped[p.status]?.push(p);
  const result: Record<string, string[]> = {};
  for (const col of KANBAN_COLUMNS) {
    result[col.key] = sortByUpdated(grouped[col.key] || []).map((p) => p.id);
  }
  return result as Record<PlanStatus, string[]>;
}

interface PlanKanbanBoardProps {
  plans: Plan[];
  activePlanId: string | null;
  onSelect: (plan: Plan) => void;
  onMove: (planId: string, newStatus: PlanStatus) => void;
}

function DroppableColumn({
  status,
  isOver,
  children,
}: {
  status: PlanStatus;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `column-${status}` });
  return (
    <div
      ref={setNodeRef}
      className={`kanban-column-body ${isOver ? "kanban-column-drag-over" : ""}`}
    >
      {children}
    </div>
  );
}

function SortablePlanCard({
  plan,
  activePlanId,
  onSelect,
  showDropIndicator,
}: {
  plan: Plan;
  activePlanId: string | null;
  onSelect: (plan: Plan) => void;
  showDropIndicator: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="kanban-card-wrapper">
      {showDropIndicator && <div className="kanban-drop-indicator" />}
      <button
        className={`kanban-card ${plan.id === activePlanId ? "active" : ""}`}
        onClick={() => onSelect(plan)}
        {...attributes}
        {...listeners}
      >
        <div className="kanban-card-title">
          <span className="kanban-card-title-text">{plan.title}</span>
        </div>
        <div className="kanban-card-meta">
          <span className="ticket-id">{plan.id}</span>
          {plan.tasks && plan.tasks.length > 0 && (
            <span className="tag-chip">
              {plan.tasks.length} task{plan.tasks.length !== 1 ? "s" : ""}
            </span>
          )}
          {plan.tags && plan.tags.length > 0 && (
            <span className="ticket-tags">
              {plan.tags.map((tag) => (
                <span key={tag} className="tag-chip">{tag}</span>
              ))}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function PlanCardOverlay({ plan }: { plan: Plan }) {
  return (
    <div className="kanban-card kanban-card-overlay">
      <div className="kanban-card-title">
        <span className="kanban-card-title-text">{plan.title}</span>
      </div>
      <div className="kanban-card-meta">
        <span className="ticket-id">{plan.id}</span>
      </div>
    </div>
  );
}

export function PlanKanbanBoard({ plans, activePlanId, onSelect, onMove }: PlanKanbanBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    archived: false,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<PlanStatus | null>(null);

  const [itemGroups, setItemGroups] = useState<Record<PlanStatus, string[]>>(() => buildGroups(plans));

  const planMap = useMemo(() => {
    const map = new Map<string, Plan>();
    for (const p of plans) map.set(p.id, p);
    return map;
  }, [plans]);

  useEffect(() => {
    if (!activeId) {
      setItemGroups(buildGroups(plans));
    }
  }, [plans, activeId]);

  function findContainer(id: string): PlanStatus | undefined {
    for (const col of KANBAN_COLUMNS) {
      if (id === `column-${col.key}`) return col.key;
    }
    for (const col of KANBAN_COLUMNS) {
      if (itemGroups[col.key]?.includes(id)) return col.key;
    }
    return undefined;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setOverId(null);
      setOverColumn(null);
      return;
    }

    const overIdStr = over.id as string;
    setOverId(overIdStr);

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(overIdStr);

    if (!activeContainer || !overContainer) return;
    setOverColumn(overContainer);

    if (activeContainer === overContainer) return;

    setItemGroups((prev) => {
      const activeItems = [...(prev[activeContainer] || [])];
      const overItems = [...(prev[overContainer] || [])];

      const activeIndex = activeItems.indexOf(active.id as string);
      if (activeIndex === -1) return prev;

      activeItems.splice(activeIndex, 1);

      const overIndex = overItems.indexOf(overIdStr);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;
      overItems.splice(newIndex, 0, active.id as string);

      return {
        ...prev,
        [activeContainer]: activeItems,
        [overContainer]: overItems,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setOverId(null);
    setOverColumn(null);

    if (!over) {
      setItemGroups(buildGroups(plans));
      setActiveId(null);
      return;
    }

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer) {
      setActiveId(null);
      return;
    }

    const plan = planMap.get(active.id as string);
    const originalStatus = plan?.status;

    if (activeContainer === overContainer) {
      const finalItems = [...(itemGroups[overContainer] || [])];
      const activeIndex = finalItems.indexOf(active.id as string);
      const overIndex = finalItems.indexOf(over.id as string);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        setItemGroups((prev) => ({
          ...prev,
          [overContainer]: arrayMove(finalItems, activeIndex, overIndex),
        }));
      }

      if (originalStatus !== overContainer) {
        onMove(active.id as string, overContainer);
      }
    } else {
      onMove(active.id as string, overContainer);
    }

    setActiveId(null);
  };

  const toggleCollapse = (status: PlanStatus) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const collapsible = (status: PlanStatus) => status === "archived";

  const activePlan = activeId ? planMap.get(activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board">
        {KANBAN_COLUMNS.map(({ key, label }) => {
          const groupIds = itemGroups[key] || [];
          const isCollapsed = collapsible(key) && collapsed[key];
          const isColumnOver = overColumn === key && activeId != null;

          if (isCollapsed) {
            return (
              <div key={key} className="kanban-column kanban-column-collapsed" onClick={() => toggleCollapse(key)}>
                <div className="kanban-collapsed-strip">
                  <span className="kanban-collapsed-label">{label}</span>
                  <span className="kanban-collapsed-count">{groupIds.length}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={key} className={`kanban-column ${isColumnOver ? "kanban-column-highlight" : ""}`}>
              <div className="kanban-column-header">
                <span className="kanban-column-title">{label}</span>
                <span className="kanban-column-count">{groupIds.length}</span>
                {collapsible(key) && (
                  <button
                    className="kanban-collapse-btn"
                    onClick={() => toggleCollapse(key)}
                    title={`Collapse ${label}`}
                    aria-label={`Collapse ${label} column`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="11 17 6 12 11 7" />
                      <polyline points="18 17 13 12 18 7" />
                    </svg>
                  </button>
                )}
              </div>
              <DroppableColumn status={key} isOver={isColumnOver}>
                <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                  {groupIds.map((id) => {
                    const plan = planMap.get(id);
                    if (!plan) return null;
                    return (
                      <SortablePlanCard
                        key={id}
                        plan={plan}
                        activePlanId={activePlanId}
                        onSelect={onSelect}
                        showDropIndicator={overId === id && activeId !== id}
                      />
                    );
                  })}
                </SortableContext>
                {overId === `column-${key}` && activeId && (
                  <div className="kanban-drop-indicator" />
                )}
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePlan ? <PlanCardOverlay plan={activePlan} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
