import type { Doc } from "../types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

export function DocList({
  docs,
  activeDocId,
  hideBadges,
  onSelect,
}: {
  docs: Doc[];
  activeDocId: string | null;
  hideBadges: boolean;
  onSelect: (doc: Doc) => void;
}) {
  const sortedDocs = [...docs].sort(
    (a, b) =>
      new Date(b.updated).getTime() - new Date(a.updated).getTime(),
  );

  return (
    <div className="flex flex-col">
      {sortedDocs.map((doc) => {
        const isActive = doc.id === activeDocId;
        return (
          <button
            key={doc.id}
            type="button"
            className={cn(
              "flex w-full items-center border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent",
              isActive && "border-l-2 border-l-primary bg-accent pl-[10px]",
            )}
            onClick={() => onSelect(doc)}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">
                  {doc.title}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {doc.id}
                </span>
                {!hideBadges && doc.project && (
                  <Badge variant="secondary">{doc.project}</Badge>
                )}
                {!hideBadges &&
                  doc.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
                  {relativeTime(doc.updated)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
