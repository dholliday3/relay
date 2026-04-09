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
import type { Task, Status } from "../types";

const KANBAN_COLUMNS: { key: Status; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "backlog", label: "Backlog" },
  { key: "open", label: "Open" },
  { key: "in-progress", label: "In Progress" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_INDICATOR: Record<string, { color: string; label: string }> = {
  urgent: { color: "#ef4444", label: "Urgent" },
  high: { color: "#f97316", label: "High" },
  medium: { color: "#eab308", label: "Medium" },
  low: { color: "#9ca3af", label: "Low" },
};

function sortWithinGroup(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aHasOrder = a.order != null;
    const bHasOrder = b.order != null;
    if (aHasOrder && bHasOrder) return a.order! - b.order!;
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;

    const aPri = a.priority ? (PRIORITY_RANK[a.priority] ?? 4) : 4;
    const bPri = b.priority ? (PRIORITY_RANK[b.priority] ?? 4) : 4;
    if (aPri !== bPri) return aPri - bPri;

    return new Date(b.updated).getTime() - new Date(a.updated).getTime();
  });
}

function buildGroups(tasks: Task[]): Record<Status, string[]> {
  const grouped: Partial<Record<Status, Task[]>> = {};
  for (const col of KANBAN_COLUMNS) grouped[col.key] = [];
  for (const t of tasks) grouped[t.status]?.push(t);
  const result: Record<string, string[]> = {};
  for (const col of KANBAN_COLUMNS) {
    result[col.key] = sortWithinGroup(grouped[col.key] || []).map((t) => t.id);
  }
  return result as Record<Status, string[]>;
}

interface KanbanBoardProps {
  tasks: Task[];
  activeTaskId: string | null;
  onSelect: (task: Task) => void;
  onMove: (taskId: string, newStatus: Status, afterId: string | null, beforeId: string | null) => void;
  onCreateInColumn?: (status: Status) => void;
}

function DroppableColumn({
  status,
  isOver,
  children,
}: {
  status: Status;
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

function SortableKanbanCard({
  task,
  activeTaskId,
  onSelect,
  showDropIndicator,
}: {
  task: Task;
  activeTaskId: string | null;
  onSelect: (task: Task) => void;
  showDropIndicator: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="kanban-card-wrapper">
      {showDropIndicator && <div className="kanban-drop-indicator" />}
      <button
        className={`kanban-card ${task.id === activeTaskId ? "active" : ""} ${task.status === "draft" ? "kanban-card-draft" : ""}`}
        onClick={() => onSelect(task)}
        {...attributes}
        {...listeners}
      >
        <div className="kanban-card-title">
          {task.priority && PRIORITY_INDICATOR[task.priority] && (
            <span
              className="priority-dot"
              style={{ backgroundColor: PRIORITY_INDICATOR[task.priority].color }}
              title={PRIORITY_INDICATOR[task.priority].label}
            />
          )}
          <span className="kanban-card-title-text">{task.title}</span>
        </div>
        <div className="kanban-card-meta">
          <span className="ticket-id">{task.id}</span>
          {task.tags && task.tags.length > 0 && (
            <span className="ticket-tags">
              {task.tags.map((tag) => (
                <span key={tag} className="tag-chip">{tag}</span>
              ))}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function KanbanCardOverlay({ task }: { task: Task }) {
  return (
    <div className="kanban-card kanban-card-overlay">
      <div className="kanban-card-title">
        {task.priority && PRIORITY_INDICATOR[task.priority] && (
          <span
            className="priority-dot"
            style={{ backgroundColor: PRIORITY_INDICATOR[task.priority].color }}
          />
        )}
        <span className="kanban-card-title-text">{task.title}</span>
      </div>
      <div className="kanban-card-meta">
        <span className="ticket-id">{task.id}</span>
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, activeTaskId, onSelect, onMove, onCreateInColumn }: KanbanBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    done: false,
    cancelled: false,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);

  // Local state for multi-container drag: maps status -> ordered task IDs
  const [itemGroups, setItemGroups] = useState<Record<Status, string[]>>(() => buildGroups(tasks));

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  // Sync from props when not dragging
  useEffect(() => {
    if (!activeId) {
      setItemGroups(buildGroups(tasks));
    }
  }, [tasks, activeId]);

  function findContainer(id: string): Status | undefined {
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

    // Move item to new container
    setItemGroups((prev) => {
      const activeItems = [...(prev[activeContainer] || [])];
      const overItems = [...(prev[overContainer] || [])];

      const activeIndex = activeItems.indexOf(active.id as string);
      if (activeIndex === -1) return prev;

      // Remove from source
      activeItems.splice(activeIndex, 1);

      // Find insertion index in target
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
      // Cancelled — reset
      setItemGroups(buildGroups(tasks));
      setActiveId(null);
      return;
    }

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer) {
      setActiveId(null);
      return;
    }

    const task = taskMap.get(active.id as string);
    const originalStatus = task?.status;
    const statusChanged = originalStatus !== overContainer;

    let finalItems = [...(itemGroups[overContainer] || [])];

    if (activeContainer === overContainer) {
      const activeIndex = finalItems.indexOf(active.id as string);
      const overIndex = finalItems.indexOf(over.id as string);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        finalItems = arrayMove(finalItems, activeIndex, overIndex);
        setItemGroups((prev) => ({ ...prev, [overContainer]: finalItems }));
      } else if (!statusChanged) {
        // Same container, same position, no status change — nothing to do
        setActiveId(null);
        return;
      }
    }

    // Compute afterId/beforeId from the final item list
    const newIndex = finalItems.indexOf(active.id as string);
    if (newIndex === -1) {
      setActiveId(null);
      return;
    }
    const afterId = newIndex > 0 ? finalItems[newIndex - 1] : null;
    const beforeId = newIndex < finalItems.length - 1 ? finalItems[newIndex + 1] : null;

    onMove(active.id as string, overContainer, afterId, beforeId);
    setActiveId(null);
  };

  const toggleCollapse = (status: Status) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const collapsible = (status: Status) => status === "done" || status === "cancelled";

  const activeTask = activeId ? taskMap.get(activeId) ?? null : null;

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
                {onCreateInColumn && (
                  <button
                    className="kanban-add-btn kanban-header-add"
                    onClick={() => onCreateInColumn(key)}
                    title={`New ${label} task`}
                    aria-label={`New ${label} task`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
              </div>
              <DroppableColumn status={key} isOver={isColumnOver}>
                <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                  {groupIds.map((id) => {
                    const task = taskMap.get(id);
                    if (!task) return null;
                    return (
                      <SortableKanbanCard
                        key={id}
                        task={task}
                        activeTaskId={activeTaskId}
                        onSelect={onSelect}
                        showDropIndicator={overId === id && activeId !== id}
                      />
                    );
                  })}
                </SortableContext>
                {overId === `column-${key}` && activeId && (
                  <div className="kanban-drop-indicator" />
                )}
                {onCreateInColumn && (
                  <button
                    className="kanban-add-btn kanban-footer-add"
                    onClick={() => onCreateInColumn(key)}
                    aria-label={`New ${label} task`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
