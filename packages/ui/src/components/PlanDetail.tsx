import { useState, useEffect, useRef, useCallback } from "react";
import { patchPlan, patchPlanBody, cutTasksFromPlan } from "../api";
import type { Plan, PlanStatus, PlanMeta } from "../types";
import { TiptapEditor } from "./TiptapEditor";
import { SelectChip, ComboboxChip, MultiComboboxChip } from "./MetaFields";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

interface PlanDetailProps {
  plan: Plan;
  planMeta: PlanMeta;
  onUpdated: () => void;
  onDelete?: (id: string) => void;
  onTaskClick?: (taskId: string) => void;
  onTasksCreated?: () => void;
}

export function PlanDetail({ plan, planMeta, onUpdated, onDelete, onTaskClick, onTasksCreated }: PlanDetailProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(plan.title);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [cutting, setCutting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitleDraft(plan.title);
    setEditingTitle(false);
  }, [plan.id, plan.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    setSaveStatus("idle");
  }, [plan.id]);

  useEffect(() => {
    return () => {
      if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const saveField = useCallback(
    async (patch: Parameters<typeof patchPlan>[1]) => {
      try {
        await patchPlan(plan.id, patch);
        onUpdated();
      } catch (err) {
        console.error("Failed to save:", err);
      }
    },
    [plan.id, onUpdated],
  );

  const handleTitleSave = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== plan.title) {
      saveField({ title: trimmed });
    } else {
      setTitleDraft(plan.title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      setTitleDraft(plan.title);
      setEditingTitle(false);
    }
  };

  const handleCutTasks = useCallback(async () => {
    setCutting(true);
    try {
      await cutTasksFromPlan(plan.id);
      onUpdated();
      onTasksCreated?.();
    } catch (err) {
      console.error("Failed to cut tasks:", err);
    } finally {
      setCutting(false);
    }
  }, [plan.id, onUpdated, onTasksCreated]);

  const handleBodyChange = useCallback(
    (newBody: string) => {
      if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setSaveStatus("saving");

      bodyTimerRef.current = setTimeout(async () => {
        try {
          await patchPlanBody(plan.id, newBody);
          onUpdated();
          setSaveStatus("saved");
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (err) {
          console.error("Failed to save body:", err);
          setSaveStatus("idle");
        }
      }, 500);
    },
    [plan.id, onUpdated],
  );

  return (
    <div className="ticket-detail">
      {/* Plan ID + save indicator + action buttons */}
      <div className="detail-header-row">
        <span className="detail-ticket-id">{plan.id}</span>
        {saveStatus !== "idle" && (
          <span className={`save-indicator ${saveStatus}`}>
            {saveStatus === "saving" ? "Saving..." : "Saved"}
          </span>
        )}
        <div className="detail-header-actions">
          <button
            className="plan-cut-tickets-btn"
            onClick={handleCutTasks}
            disabled={cutting}
            title="Cut tasks from unchecked checkboxes"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
            {cutting ? "Cutting..." : "Cut Tasks"}
          </button>
          {onDelete && (
            <button
              className="delete-btn"
              onClick={() => onDelete(plan.id)}
              title="Delete plan"
              aria-label="Delete plan"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Inline editable title — same pattern as TaskDetail */}
      {editingTitle ? (
        <input
          ref={titleInputRef}
          className="detail-title-input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleSave}
          onKeyDown={handleTitleKeyDown}
        />
      ) : (
        <h1
          className="detail-title"
          onClick={() => setEditingTitle(true)}
          title="Click to edit"
        >
          {plan.title}
        </h1>
      )}

      {/* Tiptap editor */}
      <TiptapEditor
        taskId={plan.id}
        content={plan.body}
        onUpdate={handleBodyChange}
      />

      {/* Metadata row — same pattern as TaskDetail */}
      <div className="detail-meta-row">
        <SelectChip
          value={plan.status}
          options={STATUS_OPTIONS}
          onChange={(v) => saveField({ status: v as PlanStatus })}
        />
        <MultiComboboxChip
          values={plan.tags ?? []}
          options={planMeta.tags}
          placeholder="Tags"
          onChange={(tags) => saveField({ tags })}
        />
        <ComboboxChip
          value={plan.project ?? ""}
          options={planMeta.projects}
          placeholder="Project"
          onChange={(v) => saveField({ project: v || null })}
        />
      </div>

      {plan.tasks && plan.tasks.length > 0 && (
        <div className="plan-linked-tasks">
          <span className="plan-linked-label">Linked tasks:</span>
          {plan.tasks.map((tid) => (
            <button
              key={tid}
              className="plan-ticket-chip"
              onClick={() => onTaskClick?.(tid)}
            >
              {tid}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
