import { useState, useRef } from "react";
import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react";

import type { Meta, Status, Priority, CreateTaskInput } from "../types";
import { SelectChip, ComboboxChip, MultiComboboxChip, KebabMenu } from "./MetaFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [assignee, setAssignee] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const buildInput = (statusOverride?: Status): CreateTaskInput => {
    const trimmed = title.trim();
    const input: CreateTaskInput = { title: trimmed || "Untitled", status: statusOverride ?? status };
    if (priority) input.priority = priority;
    if (project) input.project = project;
    if (epic) input.epic = epic;
    if (sprint) input.sprint = sprint;
    if (assignee.trim()) input.assignee = assignee.trim();
    if (createdBy.trim()) input.createdBy = createdBy.trim();
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
          <DialogTitle>New task</DialogTitle>
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
          placeholder="Task title"
        />

        <textarea
          className="w-full flex-1 resize-none border-0 bg-transparent py-1 text-xs/relaxed text-foreground outline-none placeholder:text-muted-foreground"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a description..."
          rows={expanded ? 12 : 5}
        />

        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <SelectChip value={status} options={statusOptions} onChange={(v) => setStatus(v as Status)} />
          <SelectChip value={priority ?? ""} options={priorityOptions} placeholder="Priority" onChange={(v) => setPriority(v as Priority | "")} />
          <MultiComboboxChip values={tags} options={meta.tags} placeholder="Tags" onChange={setTags} />
          <KebabMenu
            items={[
              { label: "Project", content: <ComboboxChip value={project} options={meta.projects} placeholder="None" onChange={setProject} /> },
              { label: "Epic", content: <ComboboxChip value={epic} options={meta.epics} placeholder="None" onChange={setEpic} /> },
              { label: "Cycle", content: <ComboboxChip value={sprint} options={meta.sprints} placeholder="None" onChange={setSprint} /> },
              { label: "Assignee", content: <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Unassigned" /> },
              { label: "Created by", content: <Input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} placeholder="Unknown" /> },
            ]}
          />
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
