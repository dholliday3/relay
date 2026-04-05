import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { fetchTickets, subscribeSSE, createTicket, deleteTicket, fetchConfig, patchConfig, fetchMeta, reorderTicket, patchTicket, patchPlan, fetchPlans, createPlan, deletePlan as apiDeletePlan, fetchPlanMeta } from "./api";
import { TicketList } from "./components/TicketList";
import { KanbanBoard } from "./components/KanbanBoard";
import { PlanKanbanBoard } from "./components/PlanKanbanBoard";
import { TicketDetail } from "./components/TicketDetail";
import { PlanList } from "./components/PlanList";
import { PlanDetail } from "./components/PlanDetail";
import { Dashboard } from "./components/Dashboard";
import { SelectChip, ComboboxChip, MultiComboboxChip, KebabMenu } from "./components/MetaFields";
import { TerminalPane } from "./components/TerminalPane";
import type { Ticket, TicketbookConfig, Status, Priority, Meta, CreateTicketInput, DebriefStyle, Plan, PlanStatus, CreatePlanInput, PlanMeta } from "./types";

type ViewMode = "home" | "list" | "board";
type Space = "tickets" | "plans";

type Filters = {
  status: Status[];
  project: string[];
  epic: string[];
  sprint: string[];
};

import "./App.css";

function readUrlParams(): {
  space: Space;
  view: ViewMode;
  search: string;
  filters: Filters;
  planFilters: { status: PlanStatus[]; project: string[] };
} {
  const p = new URLSearchParams(window.location.search);
  const rawSpace = p.get("space");
  const rawView = p.get("view");
  return {
    space: rawSpace === "plans" ? "plans" : "tickets",
    view: rawView === "board" ? "board" : rawView === "home" ? "home" : "list",
    search: p.get("q") ?? "",
    filters: {
      status: p.getAll("status") as Status[],
      project: p.getAll("project"),
      epic: p.getAll("epic"),
      sprint: p.getAll("sprint"),
    },
    planFilters: {
      status: p.getAll("status") as PlanStatus[],
      project: p.getAll("project"),
    },
  };
}

export function App() {
  const initUrl = useMemo(() => readUrlParams(), []);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] = useState<Status>("open");
  const [searchInput, setSearchInput] = useState(initUrl.search);
  const [searchQuery, setSearchQuery] = useState(initUrl.search);
  const [config, setConfig] = useState<TicketbookConfig>({ prefix: "TKT", deleteMode: "archive", debriefStyle: "very-concise" });
  const [meta, setMeta] = useState<Meta>({ projects: [], epics: [], sprints: [], tags: [] });
  const [filters, setFilters] = useState<Filters>(initUrl.filters);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initUrl.view);
  const [space, setSpace] = useState<Space>(initUrl.space);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [planMeta, setPlanMeta] = useState<PlanMeta>({ projects: [], tags: [] });
  const [planFilters, setPlanFilters] = useState<{ status: PlanStatus[]; project: string[] }>(initUrl.planFilters);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(() => localStorage.getItem("ticketbook-terminal-open") === "true");
  const [terminalWidth, setTerminalWidth] = useState(() => parseInt(localStorage.getItem("ticketbook-terminal-width") || "400", 10));
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const isDraggingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track narrow viewport
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const loadTickets = useCallback(async () => {
    try {
      const data = await fetchTickets();
      setTickets(data);
    } catch (err) {
      console.error("Failed to load tickets:", err);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const data = await fetchPlans();
      setPlans(data);
    } catch (err) {
      console.error("Failed to load plans:", err);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    loadPlans();
    fetchConfig().then(setConfig).catch(console.error);
    fetchMeta().then(setMeta).catch(console.error);
    fetchPlanMeta().then(setPlanMeta).catch(console.error);
  }, [loadTickets, loadPlans]);

  // SSE: refresh on any change event
  useEffect(() => {
    const unsub = subscribeSSE((event) => {
      if (event.source === "plan") {
        loadPlans();
        fetchPlanMeta().then(setPlanMeta).catch(console.error);
      } else {
        loadTickets();
        fetchMeta().then(setMeta).catch(console.error);
      }
    });
    return unsub;
  }, [loadTickets, loadPlans]);

  // Debounced search (200ms)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchInput]);

  // Sync state to URL params
  useEffect(() => {
    const p = new URLSearchParams();
    if (space !== "tickets") p.set("space", space);
    if (viewMode !== "list") p.set("view", viewMode);
    if (searchQuery) p.set("q", searchQuery);

    const activeFilters = space === "tickets" ? filters : null;
    const activePlanFilts = space === "plans" ? planFilters : null;

    if (activeFilters) {
      for (const s of activeFilters.status) p.append("status", s);
      for (const v of activeFilters.project) p.append("project", v);
      for (const v of activeFilters.epic) p.append("epic", v);
      for (const v of activeFilters.sprint) p.append("sprint", v);
    }
    if (activePlanFilts) {
      for (const s of activePlanFilts.status) p.append("status", s);
      for (const v of activePlanFilts.project) p.append("project", v);
    }

    const qs = p.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [space, viewMode, searchQuery, filters, planFilters]);

  // Client-side filtering: compose search + filter chips
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.body.toLowerCase().includes(q)) {
          return false;
        }
      }
      // Chip filters (multi-select: ticket must match at least one selected value)
      if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
      if (filters.project.length > 0 && (!t.project || !filters.project.includes(t.project))) return false;
      if (filters.epic.length > 0 && (!t.epic || !filters.epic.includes(t.epic))) return false;
      if (filters.sprint.length > 0 && (!t.sprint || !filters.sprint.includes(t.sprint))) return false;
      return true;
    });
  }, [tickets, searchQuery, filters]);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.body.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (planFilters.status.length > 0 && !planFilters.status.includes(p.status)) return false;
      if (planFilters.project.length > 0 && (!p.project || !planFilters.project.includes(p.project))) return false;
      return true;
    });
  }, [plans, searchQuery, planFilters]);

  const toggleFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => {
      const current = prev[key] as string[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const hasActiveFilters = filters.status.length > 0 || filters.project.length > 0 || filters.epic.length > 0 || filters.sprint.length > 0;

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("ticketbook-view-mode", mode);
  }, []);

  const handleSpaceChange = useCallback((s: Space) => {
    setSpace(s);
    localStorage.setItem("ticketbook-space", s);
  }, []);

  const togglePlanFilter = useCallback((key: "status" | "project", value: string) => {
    setPlanFilters((prev) => {
      const current = prev[key] as string[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }, []);

  // Flat ordered ticket list for keyboard navigation
  const flatTicketList = useMemo(() => {
    const statusOrder: Status[] = viewMode === "board"
      ? ["draft", "backlog", "open", "in-progress", "done", "cancelled"]
      : ["in-progress", "open", "backlog", "draft", "done", "cancelled"];
    const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const result: Ticket[] = [];
    for (const status of statusOrder) {
      const group = filteredTickets.filter((t) => t.status === status);
      const sorted = [...group].sort((a, b) => {
        const aHas = a.order != null, bHas = b.order != null;
        if (aHas && bHas) return a.order! - b.order!;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        const aPri = a.priority ? (priorityRank[a.priority] ?? 4) : 4;
        const bPri = b.priority ? (priorityRank[b.priority] ?? 4) : 4;
        if (aPri !== bPri) return aPri - bPri;
        return new Date(b.updated).getTime() - new Date(a.updated).getTime();
      });
      result.push(...sorted);
    }
    return result;
  }, [filteredTickets, viewMode]);

  // Global keyboard shortcuts
  useEffect(() => {
    const isEditing = (): boolean => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K: focus search input
      if (meta && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Cmd+Shift+L: switch to list view
      if (meta && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        handleViewModeChange("list");
        return;
      }

      // Cmd+Shift+B: switch to board view
      if (meta && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleViewModeChange("board");
        return;
      }

      // Escape: close dialogs / deselect
      if (e.key === "Escape") {
        if (confirmDelete) {
          setConfirmDelete(null);
          return;
        }
        if (isCreating) {
          setIsCreating(false);
          return;
        }
        if (isEditing()) {
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        setActiveTicketId(null);
        return;
      }

      // Remaining shortcuts require no editable element to be focused
      if (isEditing()) return;

      // "c": create new item (quick shortcut, like Linear)
      if (e.key === "c" && !meta && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (space === "plans") {
          handleNewPlan();
        } else {
          setCreateDefaultStatus("open");
          setIsCreating(true);
          setActiveTicketId(null);
        }
        return;
      }

      // Up/Down: navigate ticket list
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (flatTicketList.length === 0) return;
        const currentIndex = activeTicketId
          ? flatTicketList.findIndex((t) => t.id === activeTicketId)
          : -1;
        let nextIndex: number;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < flatTicketList.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }
        setActiveTicketId(flatTicketList[nextIndex].id);
        setIsCreating(false);
        // Scroll the active row into view
        setTimeout(() => {
          document.querySelector(".ticket-row.active, .kanban-card.active")
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 0);
        return;
      }

      // Enter: open selected ticket (focus body editor)
      if (e.key === "Enter" && activeTicketId) {
        e.preventDefault();
        // Small delay for board view slide-over to render
        setTimeout(() => {
          const editor = document.querySelector(".tiptap-editor .ProseMirror") as HTMLElement;
          editor?.focus();
        }, 50);
        return;
      }

      // 1-4: set priority when a ticket is selected
      if (activeTicketId && e.key >= "1" && e.key <= "4") {
        const priorityMap: Record<string, Priority> = {
          "1": "urgent",
          "2": "high",
          "3": "medium",
          "4": "low",
        };
        const priority = priorityMap[e.key];
        if (priority) {
          patchTicket(activeTicketId, { priority }).then(() => loadTickets()).catch(console.error);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTicketId, flatTicketList, isCreating, confirmDelete, loadTickets, handleViewModeChange]);

  const handleSelect = (ticket: Ticket) => {
    setIsCreating(false);
    setActiveTicketId(ticket.id);
    setOpenTabs((tabs) => tabs.includes(ticket.id) ? tabs : [...tabs, ticket.id]);
    if (isMobile) setMobileShowDetail(true);
  };

  const handleCloseTab = useCallback((tabId: string) => {
    setOpenTabs((tabs) => {
      const newTabs = tabs.filter((id) => id !== tabId);
      if (activeTicketId === tabId) {
        const idx = tabs.indexOf(tabId);
        const next = newTabs[Math.min(idx, newTabs.length - 1)] ?? null;
        setActiveTicketId(next);
      }
      if (activePlanId === tabId) {
        const idx = tabs.indexOf(tabId);
        const next = newTabs[Math.min(idx, newTabs.length - 1)] ?? null;
        setActivePlanId(next);
      }
      return newTabs;
    });
  }, [activeTicketId, activePlanId]);

  const handleNewTicket = () => {
    setCreateDefaultStatus("open");
    setIsCreating(true);
    setActiveTicketId(null);
    if (isMobile) setMobileShowDetail(true);
  };

  const handleCreateTicket = async (input: CreateTicketInput) => {
    try {
      const ticket = await createTicket(input);
      setIsCreating(false);
      await loadTickets();
      setActiveTicketId(ticket.id);
      setOpenTabs((tabs) => tabs.includes(ticket.id) ? tabs : [...tabs, ticket.id]);
    } catch (err) {
      console.error("Failed to create ticket:", err);
    }
  };

  const handleCreateInColumn = useCallback((status: Status) => {
    setCreateDefaultStatus(status);
    setIsCreating(true);
    setActiveTicketId(null);
  }, []);

  const handleCancelCreate = () => {
    setIsCreating(false);
  };

  const handleDeleteRequest = (id: string) => {
    setConfirmDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const isPlan = plans.some((p) => p.id === confirmDelete);
    try {
      if (isPlan) {
        await apiDeletePlan(confirmDelete);
        setConfirmDelete(null);
        setActivePlanId(null);
        setOpenTabs((tabs) => tabs.filter((id) => id !== confirmDelete));
        await loadPlans();
      } else {
        await deleteTicket(confirmDelete);
        setConfirmDelete(null);
        setActiveTicketId(null);
        setOpenTabs((tabs) => tabs.filter((id) => id !== confirmDelete));
        await loadTickets();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  const handleReorder = useCallback(
    async (ticketId: string, afterId: string | null, beforeId: string | null) => {
      // Snapshot for rollback
      const prevTickets = tickets;

      // Optimistic: reorder tickets locally by computing an approximate order value
      setTickets((current) => {
        const ticket = current.find((t) => t.id === ticketId);
        if (!ticket) return current;

        // Find neighbor orders to compute midpoint
        const afterTicket = afterId ? current.find((t) => t.id === afterId) : null;
        const beforeTicket = beforeId ? current.find((t) => t.id === beforeId) : null;

        let newOrder: number;
        if (afterTicket?.order != null && beforeTicket?.order != null) {
          newOrder = (afterTicket.order + beforeTicket.order) / 2;
        } else if (afterTicket?.order != null) {
          newOrder = afterTicket.order + 1000;
        } else if (beforeTicket?.order != null) {
          newOrder = beforeTicket.order > 1000 ? beforeTicket.order - 1000 : beforeTicket.order / 2;
        } else {
          newOrder = 1000;
        }

        return current.map((t) =>
          t.id === ticketId ? { ...t, order: newOrder } : t,
        );
      });

      try {
        await reorderTicket(ticketId, afterId, beforeId);
        // Refresh to get server-canonical order values
        await loadTickets();
      } catch (err) {
        console.error("Failed to reorder ticket:", err);
        // Rollback on error
        setTickets(prevTickets);
      }
    },
    [tickets, loadTickets],
  );

  const handleKanbanMove = useCallback(
    async (ticketId: string, newStatus: Status, afterId: string | null, beforeId: string | null) => {
      const prevTickets = tickets;
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket) return;

      const statusChanged = ticket.status !== newStatus;

      // Optimistic update: change status and compute approximate order
      setTickets((current) => {
        const t = current.find((t) => t.id === ticketId);
        if (!t) return current;

        const afterTicket = afterId ? current.find((t) => t.id === afterId) : null;
        const beforeTicket = beforeId ? current.find((t) => t.id === beforeId) : null;

        let newOrder: number;
        if (afterTicket?.order != null && beforeTicket?.order != null) {
          newOrder = (afterTicket.order + beforeTicket.order) / 2;
        } else if (afterTicket?.order != null) {
          newOrder = afterTicket.order + 1000;
        } else if (beforeTicket?.order != null) {
          newOrder = beforeTicket.order > 1000 ? beforeTicket.order - 1000 : beforeTicket.order / 2;
        } else {
          newOrder = 1000;
        }

        return current.map((t) =>
          t.id === ticketId ? { ...t, status: newStatus, order: newOrder } : t,
        );
      });

      try {
        // Change status first so reorder operates in the correct column
        if (statusChanged) {
          await patchTicket(ticketId, { status: newStatus });
        }
        await reorderTicket(ticketId, afterId, beforeId);
        await loadTickets();
      } catch (err) {
        console.error("Failed to move ticket:", err);
        setTickets(prevTickets);
      }
    },
    [tickets, loadTickets],
  );

  const handleSelectPlan = (plan: Plan) => {
    setIsCreating(false);
    setActivePlanId(plan.id);
    setOpenTabs((tabs) => tabs.includes(plan.id) ? tabs : [...tabs, plan.id]);
    if (isMobile) setMobileShowDetail(true);
  };

  const handleNewPlan = () => {
    setIsCreating(true);
    setActivePlanId(null);
    if (isMobile) setMobileShowDetail(true);
  };

  const handleCreatePlan = async (input: CreatePlanInput) => {
    try {
      const plan = await createPlan(input);
      setIsCreating(false);
      await loadPlans();
      setActivePlanId(plan.id);
      setOpenTabs((tabs) => tabs.includes(plan.id) ? tabs : [...tabs, plan.id]);
    } catch (err) {
      console.error("Failed to create plan:", err);
    }
  };

  const handleDeletePlanRequest = (id: string) => {
    setConfirmDelete(id);
  };

  const handlePlanTicketClick = (ticketId: string) => {
    handleSpaceChange("tickets");
    setActiveTicketId(ticketId);
    setOpenTabs((tabs) => tabs.includes(ticketId) ? tabs : [...tabs, ticketId]);
  };

  const handlePlanKanbanMove = useCallback(
    async (planId: string, newStatus: PlanStatus) => {
      const prevPlans = plans;
      setPlans((current) =>
        current.map((p) => (p.id === planId ? { ...p, status: newStatus } : p)),
      );
      try {
        await patchPlan(planId, { status: newStatus });
        await loadPlans();
      } catch (err) {
        console.error("Failed to move plan:", err);
        setPlans(prevPlans);
      }
    },
    [plans, loadPlans],
  );

  const handleMobileBack = () => {
    setMobileShowDetail(false);
    setActiveTicketId(null);
    setIsCreating(false);
  };

  const handleToggleTerminal = useCallback(() => {
    setTerminalOpen((prev) => {
      const next = !prev;
      localStorage.setItem("ticketbook-terminal-open", String(next));
      return next;
    });
  }, []);

  const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = terminalWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(200, Math.min(window.innerWidth * 0.7, startWidth + delta));
      setTerminalWidth(newWidth);
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setTerminalWidth((w) => { localStorage.setItem("ticketbook-terminal-width", String(w)); return w; });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [terminalWidth]);

  const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null;
  const deleteItemTitle = confirmDelete
    ? tickets.find((t) => t.id === confirmDelete)?.title
      ?? plans.find((p) => p.id === confirmDelete)?.title
      ?? confirmDelete
    : "";
  const deleteItemType = confirmDelete && plans.some((p) => p.id === confirmDelete) ? "plan" : "ticket";

  return (
    <div className={`app-layout ${viewMode === "board" ? "app-layout-board" : ""}`}>
      <header className="shared-header">
        <button
          className={`home-btn ${viewMode === "home" ? "home-btn-active" : ""}`}
          onClick={() => handleViewModeChange("home")}
          title="Home"
          aria-label="Home"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <div className="view-segmented-control" role="radiogroup" aria-label="Space">
          <button
            className={`segmented-btn ${space === "tickets" ? "segmented-btn-active" : ""}`}
            onClick={() => handleSpaceChange("tickets")}
            role="radio"
            aria-checked={space === "tickets"}
            aria-label="Tickets"
          >
            Tickets
          </button>
          <button
            className={`segmented-btn ${space === "plans" ? "segmented-btn-active" : ""}`}
            onClick={() => handleSpaceChange("plans")}
            role="radio"
            aria-checked={space === "plans"}
            aria-label="Plans"
          >
            Plans
          </button>
        </div>
        <div className="view-segmented-control" role="radiogroup" aria-label="View mode">
          <button
            className={`segmented-btn ${viewMode === "list" ? "segmented-btn-active" : ""}`}
            onClick={() => handleViewModeChange("list")}
            role="radio"
            aria-checked={viewMode === "list"}
            aria-label="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            List
          </button>
          <button
            className={`segmented-btn ${viewMode === "board" ? "segmented-btn-active" : ""}`}
            onClick={() => handleViewModeChange("board")}
            role="radio"
            aria-checked={viewMode === "board"}
            aria-label="Board view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="18" rx="1" />
            </svg>
            Board
          </button>
        </div>
        <div className="filter-chips">
          {space === "tickets" ? (
            <>
              <FilterChip
                label="Status"
                options={["draft", "backlog", "open", "in-progress", "done", "cancelled"]}
                selected={filters.status}
                onToggle={(v) => toggleFilter("status", v)}
              />
              <FilterChip
                label="Project"
                options={meta.projects}
                selected={filters.project}
                onToggle={(v) => toggleFilter("project", v)}
              />
              <FilterChip
                label="Epic"
                options={meta.epics}
                selected={filters.epic}
                onToggle={(v) => toggleFilter("epic", v)}
              />
              <FilterChip
                label="Sprint"
                options={meta.sprints}
                selected={filters.sprint}
                onToggle={(v) => toggleFilter("sprint", v)}
              />
            </>
          ) : (
            <>
              <FilterChip
                label="Status"
                options={["draft", "active", "completed", "archived"]}
                selected={planFilters.status}
                onToggle={(v) => togglePlanFilter("status", v)}
              />
              <FilterChip
                label="Project"
                options={planMeta.projects}
                selected={planFilters.project}
                onToggle={(v) => togglePlanFilter("project", v)}
              />
            </>
          )}
        </div>
        <div className="header-spacer" />
        <button
          className="new-ticket-btn"
          onClick={space === "tickets" ? handleNewTicket : handleNewPlan}
          title={space === "tickets" ? "New ticket (C)" : "New plan (C)"}
          aria-label={space === "tickets" ? "New ticket" : "New plan"}
        >
          +
        </button>
        <div className="search-container">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {(searchQuery || hasActiveFilters || planFilters.status.length > 0 || planFilters.project.length > 0) && (
            <span className="search-result-count">
              {space === "tickets"
                ? `${filteredTickets.length} result${filteredTickets.length !== 1 ? "s" : ""}`
                : `${filteredPlans.length} result${filteredPlans.length !== 1 ? "s" : ""}`}
            </span>
          )}
          {searchInput && (
            <button
              className="search-clear"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>
      <div className="main-with-terminal">
      <div className="main-content">
      {viewMode === "home" ? (
        <Dashboard
          tickets={tickets}
          plans={plans}
          meta={meta}
          onNavigate={(mode, filterKey, filterValue) => {
            if (filterKey && filterValue) {
              setFilters({ status: [], project: [], epic: [], sprint: [], [filterKey]: [filterValue] });
            }
            handleSpaceChange("tickets");
            handleViewModeChange(mode);
          }}
          onNavigatePlans={() => {
            handleSpaceChange("plans");
            handleViewModeChange("list");
          }}
        />
      ) : viewMode === "list" ? (
        <div className="list-content">
          {(!isMobile || !mobileShowDetail) && (
            <aside className="list-panel">
              {space === "tickets" ? (
                tickets.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <p className="empty-state-title">Welcome to Ticketbook</p>
                      <p className="empty-state-subtitle">Create your first ticket to get started.</p>
                      <div className="empty-state-hints">
                        <span className="hint-row"><kbd>C</kbd> New ticket</span>
                      </div>
                    </div>
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <p className="empty-state-title">No tickets match</p>
                      <p className="empty-state-subtitle">Try adjusting your search or filters.</p>
                    </div>
                  </div>
                ) : (
                  <TicketList
                    tickets={filteredTickets}
                    activeTicketId={activeTicketId}
                    onSelect={handleSelect}
                    onReorder={handleReorder}
                    onMove={handleKanbanMove}
                    onCreateInStatus={handleCreateInColumn}
                  />
                )
              ) : (
                plans.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <p className="empty-state-title">No plans yet</p>
                      <p className="empty-state-subtitle">Create your first plan to start brainstorming.</p>
                      <div className="empty-state-hints">
                        <span className="hint-row"><kbd>C</kbd> New plan</span>
                      </div>
                    </div>
                  </div>
                ) : filteredPlans.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <p className="empty-state-title">No plans match</p>
                      <p className="empty-state-subtitle">Try adjusting your search or filters.</p>
                    </div>
                  </div>
                ) : (
                  <PlanList
                    plans={filteredPlans}
                    activePlanId={activePlanId}
                    onSelect={handleSelectPlan}
                  />
                )
              )}
            </aside>
          )}
          {(!isMobile || mobileShowDetail) && (
            <main className="detail-panel">
              {isMobile && (
                <button className="mobile-back-btn" onClick={handleMobileBack}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
              )}
              {openTabs.length > 0 && !isMobile && (
                <div className="tab-bar">
                  {openTabs.map((tabId) => {
                    const isTicketTab = tickets.some((tk) => tk.id === tabId);
                    const isPlanTab = plans.some((p) => p.id === tabId);
                    const tabTitle = tickets.find((tk) => tk.id === tabId)?.title
                      ?? plans.find((p) => p.id === tabId)?.title
                      ?? tabId;
                    const isActive = (space === "tickets" && tabId === activeTicketId)
                      || (space === "plans" && tabId === activePlanId);
                    return (
                      <div
                        key={tabId}
                        className={`tab-item ${isActive ? "tab-active" : ""} ${isPlanTab && !isTicketTab ? "tab-plan" : ""}`}
                      >
                        <button
                          className="tab-label"
                          onClick={() => {
                            if (isPlanTab && !isTicketTab) {
                              handleSpaceChange("plans");
                              setActivePlanId(tabId);
                            } else {
                              handleSpaceChange("tickets");
                              setActiveTicketId(tabId);
                            }
                          }}
                        >
                          {tabTitle}
                        </button>
                        <button
                          className="tab-close"
                          onClick={(e) => { e.stopPropagation(); handleCloseTab(tabId); }}
                          aria-label="Close tab"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {space === "tickets" && activeTicket ? (
                <TicketDetail
                  ticket={activeTicket}
                  meta={meta}
                  onUpdated={loadTickets}
                  onDelete={handleDeleteRequest}
                />
              ) : space === "plans" && activePlanId ? (
                (() => {
                  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;
                  return activePlan ? (
                    <PlanDetail
                      plan={activePlan}
                      planMeta={planMeta}
                      onUpdated={loadPlans}
                      onDelete={handleDeletePlanRequest}
                      onTicketClick={handlePlanTicketClick}
                      onTicketsCreated={loadTickets}
                    />
                  ) : null;
                })()
              ) : (
                <div className="empty-state">
                  <div className="empty-state-content">
                    <p className="empty-state-title">
                      {space === "tickets" ? "No ticket selected" : "No plan selected"}
                    </p>
                    <div className="empty-state-hints">
                      <span className="hint-row"><kbd>&uarr;</kbd> <kbd>&darr;</kbd> Navigate</span>
                      <span className="hint-row"><kbd>Enter</kbd> Open</span>
                      <span className="hint-row"><kbd>C</kbd> {space === "tickets" ? "New ticket" : "New plan"}</span>
                      <span className="hint-row"><kbd>Esc</kbd> Deselect</span>
                    </div>
                  </div>
                </div>
              )}
            </main>
          )}
        </div>
      ) : space === "plans" ? (
        <div className="board-content">
          {plans.length === 0 ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-state-content">
                <p className="empty-state-title">No plans yet</p>
                <p className="empty-state-subtitle">Create your first plan to start brainstorming.</p>
                <div className="empty-state-hints">
                  <span className="hint-row"><kbd>C</kbd> New plan</span>
                </div>
              </div>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-state-content">
                <p className="empty-state-title">No plans match</p>
                <p className="empty-state-subtitle">Try adjusting your search or filters.</p>
              </div>
            </div>
          ) : (
            <PlanKanbanBoard
              plans={filteredPlans}
              activePlanId={activePlanId}
              onSelect={handleSelectPlan}
              onMove={handlePlanKanbanMove}
            />
          )}
          {activePlanId && (() => {
            const activePlan = plans.find((p) => p.id === activePlanId) ?? null;
            if (!activePlan) return null;
            return (
              <>
                <div
                  className="board-modal-backdrop"
                  onClick={() => setActivePlanId(null)}
                />
                <div className="board-modal">
                  <button
                    className="board-modal-close"
                    onClick={() => setActivePlanId(null)}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                  <PlanDetail
                    plan={activePlan}
                    planMeta={planMeta}
                    onUpdated={loadPlans}
                    onDelete={handleDeletePlanRequest}
                    onTicketClick={handlePlanTicketClick}
                    onTicketsCreated={loadTickets}
                  />
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="board-content">
          {tickets.length === 0 ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-state-content">
                <p className="empty-state-title">Welcome to Ticketbook</p>
                <p className="empty-state-subtitle">Create your first ticket to get started.</p>
                <div className="empty-state-hints">
                  <span className="hint-row"><kbd>C</kbd> New ticket</span>
                </div>
              </div>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-state-content">
                <p className="empty-state-title">No tickets match</p>
                <p className="empty-state-subtitle">Try adjusting your search or filters.</p>
              </div>
            </div>
          ) : (
            <KanbanBoard
              tickets={filteredTickets}
              activeTicketId={activeTicketId}
              onSelect={handleSelect}
              onMove={handleKanbanMove}
              onCreateInColumn={handleCreateInColumn}
            />
          )}
          {activeTicket && (
            <>
              <div
                className="board-modal-backdrop"
                onClick={() => { setActiveTicketId(null); }}
              />
              <div className="board-modal">
                <button
                  className="board-modal-close"
                  onClick={() => setActiveTicketId(null)}
                  aria-label="Close"
                >
                  &times;
                </button>
                <TicketDetail
                  ticket={activeTicket}
                  meta={meta}
                  onUpdated={loadTickets}
                  onDelete={handleDeleteRequest}
                />
              </div>
            </>
          )}
        </div>
      )}

      </div>{/* end main-content */}

      {/* Terminal pane (right side) */}
      {!isMobile && (
        terminalOpen ? (
          <>
            <div
              className="terminal-drag-handle"
              onMouseDown={handleTerminalDragStart}
            />
            <div className="terminal-side" style={{ width: terminalWidth }}>
              <TerminalPane onClose={handleToggleTerminal} />
            </div>
          </>
        ) : (
          <button
            className="terminal-collapsed-bar"
            onClick={handleToggleTerminal}
            title="Open terminal"
            aria-label="Open terminal"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
        )
      )}
      </div>{/* end main-with-terminal */}

      {/* Status bar */}
      <footer className="status-bar">
        {space === "tickets" ? (
          <>
            <span className="status-bar-item">
              <span className="status-bar-dot status-bar-dot-total" />
              {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
            </span>
            <span className="status-bar-item">
              <span className="status-bar-dot status-bar-dot-open" />
              {tickets.filter((t) => t.status === "open").length} open
            </span>
            <span className="status-bar-item">
              <span className="status-bar-dot status-bar-dot-in-progress" />
              {tickets.filter((t) => t.status === "in-progress").length} in progress
            </span>
          </>
        ) : (
          <>
            <span className="status-bar-item">
              <span className="status-bar-dot status-bar-dot-total" />
              {plans.length} plan{plans.length !== 1 ? "s" : ""}
            </span>
            <span className="status-bar-item">
              <span className="status-bar-dot status-bar-dot-open" />
              {plans.filter((p) => p.status === "active").length} active
            </span>
            <span className="status-bar-item">
              <span className="status-bar-dot status-bar-dot-in-progress" />
              {plans.filter((p) => p.status === "draft").length} draft
            </span>
          </>
        )}
      </footer>

      {/* Create modal */}
      {isCreating && space === "tickets" && (
        <CreateTicketModal
          meta={meta}
          defaultStatus={createDefaultStatus}
          onCreate={handleCreateTicket}
          onCancel={handleCancelCreate}
        />
      )}
      {isCreating && space === "plans" && (
        <CreatePlanModal
          planMeta={planMeta}
          onCreate={handleCreatePlan}
          onCancel={handleCancelCreate}
        />
      )}

      {/* Settings dialog */}
      {showSettings && (
        <SettingsDialog
          config={config}
          onSave={async (patch) => {
            const updated = await patchConfig(patch);
            setConfig(updated);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="dialog-overlay" onClick={handleCancelDelete}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-title">
              {config.deleteMode === "archive" ? "Archive" : "Delete"} {deleteItemType}?
            </p>
            <p className="dialog-message">
              {config.deleteMode === "archive"
                ? `"${deleteItemTitle}" will be moved to the archive and can be restored later.`
                : `"${deleteItemTitle}" will be permanently deleted. This cannot be undone.`}
            </p>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn-cancel" onClick={handleCancelDelete}>
                Cancel
              </button>
              <button
                className={`dialog-btn ${config.deleteMode === "hard" ? "dialog-btn-danger" : "dialog-btn-primary"}`}
                onClick={handleConfirmDelete}
              >
                {config.deleteMode === "archive" ? "Archive" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const active = selected.length > 0;

  return (
    <div className="filter-chip-wrapper" ref={ref}>
      <button
        className={`filter-chip-btn ${active ? "filter-chip-active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
        {active && <span className="filter-chip-count">{selected.length}</span>}
        <svg className="filter-chip-chevron" width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>
      {open && (
        <div className="filter-chip-dropdown">
          {options.length === 0 ? (
            <div className="filter-chip-empty">No options</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt}
                className={`filter-chip-option ${selected.includes(opt) ? "filter-chip-option-selected" : ""}`}
                onClick={() => onToggle(opt)}
              >
                <span className="filter-chip-check">{selected.includes(opt) ? "\u2713" : ""}</span>
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CreateTicketModal({
  meta,
  defaultStatus = "open",
  onCreate,
  onCancel,
}: {
  meta: Meta;
  defaultStatus?: Status;
  onCreate: (input: CreateTicketInput) => void;
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

  const buildInput = (statusOverride?: Status): CreateTicketInput => {
    const trimmed = title.trim();
    const input: CreateTicketInput = { title: trimmed || "Untitled", status: statusOverride ?? status };
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
          <p className="dialog-title">New ticket</p>
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
          placeholder="Ticket title"
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

function CreatePlanModal({
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

function SettingsDialog({
  config,
  onSave,
  onClose,
}: {
  config: TicketbookConfig;
  onSave: (patch: Partial<TicketbookConfig>) => Promise<void>;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState(config.prefix);
  const [deleteMode, setDeleteMode] = useState(config.deleteMode);
  const [debriefStyle, setDebriefStyle] = useState<DebriefStyle>(config.debriefStyle ?? "very-concise");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ prefix, deleteMode, debriefStyle });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaving(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-title">Settings</p>
        <div className="settings-field">
          <label className="settings-label" htmlFor="settings-prefix">
            Ticket ID prefix
          </label>
          <input
            id="settings-prefix"
            className="settings-input"
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="e.g. TKT, ART"
          />
          <span className="settings-hint">
            New tickets will be created as {prefix || "TKT"}-001, {prefix || "TKT"}-002, etc.
          </span>
        </div>
        <div className="settings-field">
          <label className="settings-label">Delete behavior</label>
          <div className="settings-toggle-group">
            <button
              className={`settings-toggle-btn ${deleteMode === "archive" ? "settings-toggle-active" : ""}`}
              onClick={() => setDeleteMode("archive")}
            >
              Archive
            </button>
            <button
              className={`settings-toggle-btn ${deleteMode === "hard" ? "settings-toggle-active" : ""}`}
              onClick={() => setDeleteMode("hard")}
            >
              Hard delete
            </button>
          </div>
          <span className="settings-hint">
            {deleteMode === "archive"
              ? "Deleted tickets are moved to an archive and can be restored."
              : "Deleted tickets are permanently removed from disk."}
          </span>
        </div>
        <div className="settings-field">
          <label className="settings-label">Agent debrief style</label>
          <div className="settings-toggle-group">
            {(["very-concise", "concise", "detailed", "lengthy"] as const).map((style) => (
              <button
                key={style}
                className={`settings-toggle-btn ${debriefStyle === style ? "settings-toggle-active" : ""}`}
                onClick={() => setDebriefStyle(style)}
              >
                {style === "very-concise" ? "Very concise" : style.charAt(0).toUpperCase() + style.slice(1)}
              </button>
            ))}
          </div>
          <span className="settings-hint">
            Controls how detailed agent debriefs are when writing to agent notes.
          </span>
        </div>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
