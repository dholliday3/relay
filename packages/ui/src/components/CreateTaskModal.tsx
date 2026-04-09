import { useState, useEffect, useRef } from "react";
import type { Meta, Status, Priority, CreateTaskInput } from "../types";
import { SelectChip, ComboboxChip, MultiComboboxChip, KebabMenu } from "./MetaFields";

export function CreateTaskModal({
  meta,
  defaultStatus = "open",
  onCreate,
  onCancel,
}: {
  meta: Meta;
  defaultStatus?: Status;
  onCreate: (input: CreateTaskInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>(defaultStatus);
  const [priority, setPriority] = useState<Priority | "">("");
  const [project, setProject] = useState("");
  const [epic, setEpic] = useState("");
  const [sprint, setSprint] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const buildInput = (statusOverride?: Status): CreateTaskInput => {
    const trimmed = title.trim();
    const input: CreateTaskInput = { title: trimmed || "Untitled", status: statusOverride ?? status };
    if (priority) input.priority = priority;
    if (project) input.project = project;
    if (epic) input.epic = epic;
    if (sprint) input.sprint = sprint;
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
      onCreate(buildInput("draft"));
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
    { value: "draft", label: "Draft" }, { value: "backlog", label: "Backlog" },
    { value: "open", label: "Open" }, { value: "in-progress", label: "In Progress" },
    { value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" },
  ];
  const priorityOptions = [
    { value: "", label: "None" }, { value: "low", label: "Low" },
    { value: "medium", label: "Medium" }, { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
  ];

  return (
    <div className="dialog-overlay" onClick={handleEscape} onKeyDown={handleKeyDown}>
      <div
        className={`dialog create-ticket-dialog ${expanded ? "create-ticket-expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="create-ticket-header">
          <p className="dialog-title">New task</p>
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
          placeholder="Task title"
        />

        <textarea
          className="create-ticket-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a description..."
          rows={expanded ? 12 : 5}
        />

        <div className="create-ticket-meta">
          <SelectChip value={status} options={statusOptions} onChange={(v) => setStatus(v as Status)} />
          <SelectChip value={priority ?? ""} options={priorityOptions} placeholder="Priority" onChange={(v) => setPriority(v as Priority | "")} />
          <MultiComboboxChip values={tags} options={meta.tags} placeholder="Tags" onChange={setTags} />
          <KebabMenu
            items={[
              { label: "Project", content: <ComboboxChip value={project} options={meta.projects} placeholder="None" onChange={setProject} /> },
              { label: "Epic", content: <ComboboxChip value={epic} options={meta.epics} placeholder="None" onChange={setEpic} /> },
              { label: "Cycle", content: <ComboboxChip value={sprint} options={meta.sprints} placeholder="None" onChange={setSprint} /> },
            ]}
          />
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
