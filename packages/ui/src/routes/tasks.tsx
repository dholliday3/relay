import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { useAppContext } from "../context/AppContext";
import { TaskList } from "../components/TaskList";
import { KanbanBoard } from "../components/KanbanBoard";
import { TaskDetail } from "../components/TaskDetail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import type { Status, Task } from "../types";

const tasksSearchSchema = z.object({
  view: z.enum(["list", "board"]).catch("list"),
  status: z.array(z.string()).catch([]),
  project: z.array(z.string()).catch([]),
  epic: z.array(z.string()).catch([]),
  sprint: z.array(z.string()).catch([]),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/tasks")({
  validateSearch: (search) => tasksSearchSchema.parse(search),
  component: TasksRoute,
});

function TasksRoute() {
  const ctx = useAppContext();
  const navigate = useNavigate();
  const { view, status, project, epic, sprint, q } = Route.useSearch();

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return ctx.tasks.filter((t) => {
      if (q) {
        const query = q.toLowerCase();
        if (!t.title.toLowerCase().includes(query) && !t.body.toLowerCase().includes(query)) {
          return false;
        }
      }
      if (status.length > 0 && !status.includes(t.status)) return false;
      if (project.length > 0 && (!t.project || !project.includes(t.project))) return false;
      if (epic.length > 0 && (!t.epic || !epic.includes(t.epic))) return false;
      if (sprint.length > 0 && (!t.sprint || !sprint.includes(t.sprint))) return false;
      return true;
    });
  }, [ctx.tasks, q, status, project, epic, sprint]);

  const activeTask = ctx.tasks.find((t) => t.id === ctx.activeTaskId) ?? null;

  if (view === "board") {
    return (
      <div className="board-content">
        {ctx.tasks.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-content">
              <p className="empty-state-title">Welcome to Ticketbook</p>
              <p className="empty-state-subtitle">Create your first task to get started.</p>
              <div className="empty-state-hints">
                <span className="hint-row"><kbd>C</kbd> New task</span>
              </div>
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-content">
              <p className="empty-state-title">No tasks match</p>
              <p className="empty-state-subtitle">Try adjusting your search or filters.</p>
            </div>
          </div>
        ) : (
          <KanbanBoard
            tasks={filteredTasks}
            activeTaskId={ctx.activeTaskId}
            onSelect={ctx.handleSelect}
            onMove={ctx.handleKanbanMove}
            onCreateInColumn={ctx.handleCreateInColumn}
          />
        )}
        <Dialog
          open={activeTask != null}
          onOpenChange={(open) => {
            if (!open) ctx.setActiveTaskId(null);
          }}
        >
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6 pt-10">
            {activeTask && (
              <TaskDetail
                task={activeTask}
                meta={ctx.meta}
                onUpdated={ctx.loadTasks}
                onDelete={ctx.handleDeleteRequest}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="list-content">
      {(!ctx.isMobile || !ctx.mobileShowDetail) && (
        <aside className="list-panel">
          {ctx.tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-content">
                <p className="empty-state-title">Welcome to Ticketbook</p>
                <p className="empty-state-subtitle">Create your first task to get started.</p>
                <div className="empty-state-hints">
                  <span className="hint-row"><kbd>C</kbd> New task</span>
                </div>
              </div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-content">
                <p className="empty-state-title">No tasks match</p>
                <p className="empty-state-subtitle">Try adjusting your search or filters.</p>
              </div>
            </div>
          ) : (
            <TaskList
              tasks={filteredTasks}
              activeTaskId={ctx.activeTaskId}
              onSelect={ctx.handleSelect}
              onReorder={ctx.handleReorder}
              onMove={ctx.handleKanbanMove}
              onCreateInStatus={ctx.handleCreateInColumn}
            />
          )}
        </aside>
      )}
      {(!ctx.isMobile || ctx.mobileShowDetail) && (
        <main className="detail-panel">
          {ctx.isMobile && (
            <button className="mobile-back-btn" onClick={ctx.handleMobileBack}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          )}
          {ctx.openTabs.length > 0 && !ctx.isMobile && (
            <TabBar />
          )}
          {activeTask ? (
            <TaskDetail
              task={activeTask}
              meta={ctx.meta}
              onUpdated={ctx.loadTasks}
              onDelete={ctx.handleDeleteRequest}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-content">
                <p className="empty-state-title">No task selected</p>
                <div className="empty-state-hints">
                  <span className="hint-row"><kbd>&uarr;</kbd> <kbd>&darr;</kbd> Navigate</span>
                  <span className="hint-row"><kbd>Enter</kbd> Open</span>
                  <span className="hint-row"><kbd>C</kbd> New task</span>
                  <span className="hint-row"><kbd>Esc</kbd> Deselect</span>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function TabBar() {
  const ctx = useAppContext();
  const navigate = useNavigate();

  return (
    <div className="tab-bar">
      {ctx.openTabs.map((tabId) => {
        const isTaskTab = ctx.tasks.some((tk) => tk.id === tabId);
        const isPlanTab = ctx.plans.some((p) => p.id === tabId);
        const tabTitle =
          ctx.tasks.find((tk) => tk.id === tabId)?.title ??
          ctx.plans.find((p) => p.id === tabId)?.title ??
          tabId;
        const isActive = tabId === ctx.activeTaskId;
        return (
          <div
            key={tabId}
            className={`tab-item ${isActive ? "tab-active" : ""} ${isPlanTab && !isTaskTab ? "tab-plan" : ""}`}
          >
            <button
              className="tab-label"
              onClick={() => {
                if (isPlanTab && !isTaskTab) {
                  navigate({ to: "/plans", search: { view: "list", status: [], project: [] } });
                  ctx.setActivePlanId(tabId);
                } else {
                  ctx.setActiveTaskId(tabId);
                }
              }}
            >
              {tabTitle}
            </button>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                ctx.handleCloseTab(tabId);
              }}
              aria-label="Close tab"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
