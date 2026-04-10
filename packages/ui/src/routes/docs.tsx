import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { useAppContext } from "../context/AppContext";
import { DocList } from "../components/DocList";
import { DocDetail } from "../components/DocDetail";
import { EmptyState, HintRow } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const docsSearchSchema = z.object({
  project: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/docs")({
  validateSearch: (search) => docsSearchSchema.parse(search),
  component: DocsRoute,
});

function DocsRoute() {
  const ctx = useAppContext();
  const navigate = useNavigate();
  const { project, tags, q } = Route.useSearch();

  const filteredDocs = useMemo(() => {
    return ctx.docs.filter((doc) => {
      if (q) {
        const query = q.toLowerCase();
        if (
          !doc.title.toLowerCase().includes(query) &&
          !doc.body.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      if (project.length > 0 && (!doc.project || !project.includes(doc.project))) {
        return false;
      }
      if (tags.length > 0 && (!doc.tags || !tags.every((tag) => doc.tags!.includes(tag)))) {
        return false;
      }
      return true;
    });
  }, [ctx.docs, q, project, tags]);

  const activeDoc = ctx.docs.find((doc) => doc.id === ctx.activeDocId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      {(!ctx.isMobile || !ctx.mobileShowDetail) && (
        <aside className="flex min-h-0 w-[300px] min-w-[300px] flex-col overflow-y-auto border-r border-border bg-card md:w-[300px] max-md:w-full max-md:min-w-0 max-md:border-r-0">
          {ctx.docs.length === 0 ? (
            <EmptyState
              title="No docs yet"
              subtitle="Create your first reference doc."
            >
              <HintRow><kbd>C</kbd> New doc</HintRow>
            </EmptyState>
          ) : filteredDocs.length === 0 ? (
            <EmptyState
              title="No docs match"
              subtitle="Try adjusting your search or filters."
            />
          ) : (
            <DocList
              docs={filteredDocs}
              activeDocId={ctx.activeDocId}
              hideBadges={ctx.hideItemBadges}
              onSelect={ctx.handleSelectDoc}
            />
          )}
        </aside>
      )}
      {(!ctx.isMobile || ctx.mobileShowDetail) && (
        <main className="min-h-0 flex-1 overflow-y-auto p-6 max-md:w-full">
          {ctx.isMobile && (
            <Button
              variant="outline"
              size="sm"
              className="mb-3"
              onClick={ctx.handleMobileBack}
            >
              <CaretLeftIcon />
              Back
            </Button>
          )}
          {ctx.openTabs.length > 0 && !ctx.isMobile && <DocTabBar />}
          {activeDoc ? (
            <div className="pt-4">
              <DocDetail
                doc={activeDoc}
                docMeta={ctx.docMeta}
                onUpdated={ctx.loadDocs}
                onDelete={ctx.handleDeleteRequest}
              />
            </div>
          ) : (
            <EmptyState title="No doc selected">
              <HintRow><kbd>C</kbd> New doc</HintRow>
              <HintRow>Use docs for stable reference material and notes.</HintRow>
            </EmptyState>
          )}
        </main>
      )}
    </div>
  );
}

function DocTabBar() {
  const ctx = useAppContext();
  const navigate = useNavigate();

  return (
    <div className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ctx.openTabs.map((tabId) => {
        const isTaskTab = ctx.tasks.some((task) => task.id === tabId);
        const isPlanTab = ctx.plans.some((plan) => plan.id === tabId);
        const isDocTab = ctx.docs.some((doc) => doc.id === tabId);
        const tabTitle =
          ctx.tasks.find((task) => task.id === tabId)?.title ??
          ctx.plans.find((plan) => plan.id === tabId)?.title ??
          ctx.docs.find((doc) => doc.id === tabId)?.title ??
          tabId;
        const isActive = tabId === ctx.activeDocId;
        const isSecondary = (isTaskTab || isPlanTab) && !isDocTab;

        return (
          <div
            key={tabId}
            className={cn(
              "group/tab flex max-w-[180px] shrink-0 items-center gap-0.5 border-r border-border",
              isActive && "border-b-2 border-b-primary bg-background",
            )}
          >
            <button
              type="button"
              className={cn(
                "cursor-pointer truncate border-0 bg-transparent py-1.5 pl-3 pr-2 text-xs transition-colors hover:text-foreground",
                isActive ? "font-medium text-foreground" : "text-muted-foreground",
                isSecondary && "italic",
              )}
              onClick={() => {
                if (isTaskTab && !isPlanTab && !isDocTab) {
                  navigate({
                    to: "/tasks",
                    search: { view: "list", status: [], project: [], epic: [], sprint: [] },
                  });
                  ctx.setActiveTaskId(tabId);
                } else if (isPlanTab && !isTaskTab && !isDocTab) {
                  navigate({ to: "/plans", search: { view: "list", status: [], project: [] } });
                  ctx.setActivePlanId(tabId);
                } else {
                  ctx.setActiveDocId(tabId);
                }
              }}
            >
              {tabTitle}
            </button>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent py-0.5 pl-0.5 pr-1.5 text-sm leading-none text-muted-foreground opacity-0 transition-opacity group-hover/tab:opacity-100 hover:text-foreground"
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
