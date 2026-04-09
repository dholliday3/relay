import { useState } from "react";
import type { Plan, PlanStatus } from "../types";

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

interface PlanListProps {
  plans: Plan[];
  activePlanId: string | null;
  onSelect: (plan: Plan) => void;
}

export function PlanList({ plans, activePlanId, onSelect }: PlanListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    completed: true,
    archived: true,
  });

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

  return (
    <div className="ticket-list">
      {STATUS_ORDER.map(({ key, label }) => {
        const group = sortedGroups.get(key) ?? [];
        const isCollapsed = collapsed[key];

        return (
          <div key={key} className="ticket-group">
            <div className="ticket-group-header-row">
              <button
                className="ticket-group-header"
                onClick={() => toggleGroup(key)}
                aria-expanded={!isCollapsed}
              >
                <span className={`chevron ${isCollapsed ? "collapsed" : ""}`}>&#9662;</span>
                <span className="group-label">{label}</span>
                <span className="group-count">{group.length}</span>
              </button>
            </div>
            {!isCollapsed && (
              <div className="ticket-group-items">
                {group.map((plan) => (
                  <button
                    key={plan.id}
                    className={`ticket-row ${plan.id === activePlanId ? "active" : ""}`}
                    onClick={() => onSelect(plan)}
                  >
                    <div className="ticket-row-content">
                      <div className="ticket-row-main">
                        <span className="ticket-title">{plan.title}</span>
                      </div>
                      <div className="ticket-row-meta">
                        <span className="ticket-id">{plan.id}</span>
                        {plan.tasks && plan.tasks.length > 0 && (
                          <span className="tag-chip">
                            {plan.tasks.length} task{plan.tasks.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {plan.tags?.map((tag) => (
                          <span key={tag} className="tag-chip">{tag}</span>
                        ))}
                        <span className="ticket-time">{relativeTime(plan.updated)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
