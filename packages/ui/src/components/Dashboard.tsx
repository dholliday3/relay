import { useMemo } from "react";
import type { Task, Status, Meta, Plan, PlanStatus } from "../types";

type FilterKey = "status" | "project" | "epic" | "sprint";

interface DashboardProps {
  tasks: Task[];
  plans: Plan[];
  meta: Meta;
  onNavigate: (mode: "list" | "board", filterKey?: FilterKey, filterValue?: string) => void;
  onNavigatePlans?: () => void;
}

const STATUS_CONFIG: { key: Status; label: string; color: string }[] = [
  { key: "draft", label: "Draft", color: "#6b7280" },
  { key: "in-progress", label: "In Progress", color: "#3b82f6" },
  { key: "open", label: "Open", color: "#22c55e" },
  { key: "backlog", label: "Backlog", color: "#9ca3af" },
  { key: "done", label: "Done", color: "#8b5cf6" },
  { key: "cancelled", label: "Cancelled", color: "#ef4444" },
];

const PLAN_STATUS_CONFIG: { key: PlanStatus; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "#3b82f6" },
  { key: "draft", label: "Draft", color: "#9ca3af" },
  { key: "completed", label: "Completed", color: "#22c55e" },
  { key: "archived", label: "Archived", color: "#6b7280" },
];

export function Dashboard({ tasks, plans, meta, onNavigate, onNavigatePlans }: DashboardProps) {
  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = {
      draft: 0,
      "in-progress": 0,
      open: 0,
      backlog: 0,
      done: 0,
      cancelled: 0,
    };
    for (const t of tasks) counts[t.status]++;
    return counts;
  }, [tasks]);

  const activeCount = statusCounts["in-progress"] + statusCounts["open"] + statusCounts["backlog"];

  const recentTickets = useMemo(() => {
    return [...tasks]
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
      .slice(0, 5);
  }, [tasks]);

  const projectGroups = useMemo(() => groupBy(tasks, "project"), [tasks]);
  const epicGroups = useMemo(() => groupBy(tasks, "epic"), [tasks]);
  const sprintGroups = useMemo(() => groupBy(tasks, "sprint"), [tasks]);

  return (
    <div className="dashboard">
      {/* Overview stats */}
      <section className="dash-section">
        <h2 className="dash-section-title">Overview</h2>
        <div className="dash-stats">
          <div className="dash-stat-card dash-stat-total">
            <span className="dash-stat-value">{tasks.length}</span>
            <span className="dash-stat-label">Total</span>
          </div>
          <div className="dash-stat-card dash-stat-active">
            <span className="dash-stat-value">{activeCount}</span>
            <span className="dash-stat-label">Active</span>
          </div>
          {STATUS_CONFIG.map(({ key, label, color }) => (
            <button
              key={key}
              className="dash-stat-card dash-stat-clickable"
              onClick={() => onNavigate("list", "status", key)}
            >
              <span className="dash-stat-value" style={{ color }}>{statusCounts[key]}</span>
              <span className="dash-stat-label">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Status bar chart */}
      {tasks.length > 0 && (
        <section className="dash-section">
          <div className="dash-bar-chart">
            {STATUS_CONFIG.map(({ key, color }) => {
              const pct = (statusCounts[key] / tasks.length) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={key}
                  className="dash-bar-segment"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                  title={`${key}: ${statusCounts[key]}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Recently updated */}
      {recentTickets.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-section-title">Recently Updated</h2>
          <div className="dash-ticket-list">
            {recentTickets.map((t) => (
              <div key={t.id} className="dash-ticket-row">
                <span className="dash-ticket-status" style={{ color: STATUS_CONFIG.find((s) => s.key === t.status)?.color }}>
                  {STATUS_CONFIG.find((s) => s.key === t.status)?.label}
                </span>
                <span className="dash-ticket-title">{t.title}</span>
                <span className="dash-ticket-id">{t.id}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projects */}
      {meta.projects.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-section-title">Projects</h2>
          <div className="dash-group-grid">
            {meta.projects.map((name) => {
              const group = projectGroups.get(name) ?? [];
              const active = group.filter((t) => t.status === "in-progress" || t.status === "open").length;
              return (
                <button key={name} className="dash-group-card" onClick={() => onNavigate("list", "project", name)}>
                  <span className="dash-group-name">{name}</span>
                  <span className="dash-group-counts">{group.length} tasks &middot; {active} active</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Epics */}
      {meta.epics.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-section-title">Epics</h2>
          <div className="dash-group-grid">
            {meta.epics.map((name) => {
              const group = epicGroups.get(name) ?? [];
              const done = group.filter((t) => t.status === "done").length;
              return (
                <button key={name} className="dash-group-card" onClick={() => onNavigate("list", "epic", name)}>
                  <span className="dash-group-name">{name}</span>
                  <span className="dash-group-counts">{group.length} tasks &middot; {done}/{group.length} done</span>
                  {group.length > 0 && (
                    <div className="dash-progress-bar">
                      <div className="dash-progress-fill" style={{ width: `${(done / group.length) * 100}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Sprints / Cycles */}
      {meta.sprints.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-section-title">Cycles</h2>
          <div className="dash-group-grid">
            {meta.sprints.map((name) => {
              const group = sprintGroups.get(name) ?? [];
              const done = group.filter((t) => t.status === "done").length;
              return (
                <button key={name} className="dash-group-card" onClick={() => onNavigate("list", "sprint", name)}>
                  <span className="dash-group-name">{name}</span>
                  <span className="dash-group-counts">{group.length} tasks &middot; {done}/{group.length} done</span>
                  {group.length > 0 && (
                    <div className="dash-progress-bar">
                      <div className="dash-progress-fill" style={{ width: `${(done / group.length) * 100}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
      {/* Plans */}
      {plans.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-section-title">Plans</h2>
          <div className="dash-stats">
            <div className="dash-stat-card dash-stat-total">
              <span className="dash-stat-value">{plans.length}</span>
              <span className="dash-stat-label">Total</span>
            </div>
            {PLAN_STATUS_CONFIG.map(({ key, label, color }) => {
              const count = plans.filter((p) => p.status === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  className="dash-stat-card dash-stat-clickable"
                  onClick={() => onNavigatePlans?.()}
                >
                  <span className="dash-stat-value" style={{ color }}>{count}</span>
                  <span className="dash-stat-label">{label}</span>
                </button>
              );
            })}
          </div>
          <div className="dash-ticket-list" style={{ marginTop: 12 }}>
            {[...plans]
              .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
              .slice(0, 5)
              .map((p) => (
                <button
                  key={p.id}
                  className="dash-ticket-row dash-plan-row"
                  onClick={() => onNavigatePlans?.()}
                  style={{ cursor: "pointer", background: "none", border: "none", width: "100%", textAlign: "left" }}
                >
                  <span className="dash-ticket-status" style={{ color: PLAN_STATUS_CONFIG.find((s) => s.key === p.status)?.color }}>
                    {PLAN_STATUS_CONFIG.find((s) => s.key === p.status)?.label}
                  </span>
                  <span className="dash-ticket-title">{p.title}</span>
                  <span className="dash-ticket-id">{p.id}</span>
                </button>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function groupBy(tasks: Task[], field: "project" | "epic" | "sprint"): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const val = t[field];
    if (!val) continue;
    const arr = map.get(val);
    if (arr) arr.push(t);
    else map.set(val, [t]);
  }
  return map;
}
