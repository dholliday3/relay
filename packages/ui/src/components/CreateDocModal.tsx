import { useState, useRef } from "react";
import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import type { CreateDocInput, DocMeta } from "../types";
import { ComboboxChip, MultiComboboxChip } from "./MetaFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CreateDocModal({
  docMeta,
  onCreate,
  onCancel,
}: {
  docMeta: DocMeta;
  onCreate: (input: CreateDocInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const buildInput = (): CreateDocInput => {
    const trimmed = title.trim();
    const input: CreateDocInput = { title: trimmed || "Untitled" };
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
          <DialogTitle>New doc</DialogTitle>
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
          placeholder="Doc title"
        />

        <textarea
          className="w-full flex-1 resize-none border-0 bg-transparent py-1 text-xs/relaxed text-foreground outline-none placeholder:text-muted-foreground"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add reference notes, patterns, architecture decisions..."
          rows={expanded ? 12 : 5}
        />

        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <MultiComboboxChip
            values={tags}
            options={docMeta.tags}
            placeholder="Tags"
            onChange={setTags}
          />
          <ComboboxChip
            value={project}
            options={docMeta.projects}
            placeholder="Project"
            onChange={setProject}
          />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            &#8984;&#x23CE; Create &middot; Esc save draft
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
