import { useState, useRef } from "react";
import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react";

import type { PlanStatus, CreatePlanInput, PlanMeta } from "../types";
import { SelectChip, ComboboxChip, MultiComboboxChip } from "./MetaFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    }
  };

  const statusOptions = [
    { value: "draft", label: "Draft" }, { value: "active", label: "Active" },
    { value: "completed", label: "Completed" }, { value: "archived", label: "Archived" },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleEscape();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={
          expanded
            ? "flex h-[85vh] max-h-[85vh] w-full max-w-[680px] flex-col gap-3 sm:max-w-[680px]"
            : "flex max-h-[85vh] w-full max-w-[680px] flex-col gap-3 sm:max-w-[680px]"
        }
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleInputRef.current?.focus();
        }}
      >
        <DialogHeader className="flex-row items-center justify-between gap-2">
          <DialogTitle>New plan</DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ArrowsInIcon /> : <ArrowsOutIcon />}
          </Button>
        </DialogHeader>

        <input
          ref={titleInputRef}
          className="w-full border-0 border-b border-border bg-transparent py-2 text-base font-semibold text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground focus:border-ring"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            handleKeyDown(e);
          }}
          placeholder="Plan title"
        />

        <textarea
          className="w-full flex-1 resize-none border-0 bg-transparent py-1 text-xs/relaxed text-foreground outline-none placeholder:text-muted-foreground"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add overview, goals, tasks to cut..."
          rows={expanded ? 12 : 5}
        />

        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <SelectChip value={status} options={statusOptions} onChange={(v) => setStatus(v as PlanStatus)} />
          <MultiComboboxChip values={tags} options={planMeta.tags} placeholder="Tags" onChange={setTags} />
          <ComboboxChip value={project} options={planMeta.projects} placeholder="Project" onChange={setProject} />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            &#8984;&#x23CE; Create &middot; Esc save as draft
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleEscape}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
