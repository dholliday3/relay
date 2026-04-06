import { useState, useEffect, useRef } from "react";
import type { PlanStatus, CreatePlanInput, PlanMeta } from "../types";
import { SelectChip, ComboboxChip, MultiComboboxChip } from "./MetaFields";

export function CreatePlanModal({
  planMeta,
  onCreate,
  onCancel,
}: {
  planMeta: PlanMeta;
  onCreate: (input: CreatePlanInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<PlanStatus>("draft");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const buildInput = (): CreatePlanInput => {
    const trimmed = title.trim();
    const input: CreatePlanInput = { title: trimmed || "Untitled", status };
    if (project) input.project = project;
    if (tags.length > 0) input.tags = tags;
    if (body.trim()) input.body = body.trim();
    return input;
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate(buildInput());
  };

  const handleEscape = () => {
    if (title.trim() || body.trim()) {
      onCreate(buildInput());
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      handleEscape();
    }
  };

  const statusOptions = [
    { value: "draft", label: "Draft" }, { value: "active", label: "Active" },
    { value: "completed", label: "Completed" }, { value: "archived", label: "Archived" },
  ];

  return (
    <div className="dialog-overlay" onClick={handleEscape} onKeyDown={handleKeyDown}>
      <div
        className={`dialog create-ticket-dialog ${expanded ? "create-ticket-expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="create-ticket-header">
          <p className="dialog-title">New plan</p>
          <button
            className="create-ticket-expand-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {expanded ? (
                <>
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              ) : (
                <>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              )}
            </svg>
          </button>
        </div>

        <input
          ref={titleInputRef}
          className="create-ticket-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            handleKeyDown(e);
          }}
          placeholder="Plan title"
        />

        <textarea
          className="create-ticket-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add overview, goals, tasks to cut..."
          rows={expanded ? 12 : 5}
        />

        <div className="create-ticket-meta">
          <SelectChip value={status} options={statusOptions} onChange={(v) => setStatus(v as PlanStatus)} />
          <MultiComboboxChip values={tags} options={planMeta.tags} placeholder="Tags" onChange={setTags} />
          <ComboboxChip value={project} options={planMeta.projects} placeholder="Project" onChange={setProject} />
        </div>

        <div className="dialog-actions">
          <span className="dialog-hint">&#8984;&#x23CE; Create &middot; Esc save as draft</span>
          <button className="dialog-btn dialog-btn-cancel" onClick={handleEscape}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-primary"
            onClick={handleSubmit}
            disabled={!title.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
