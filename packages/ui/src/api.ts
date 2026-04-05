import type { Ticket, TicketPatch, Meta, TicketbookConfig, CreateTicketInput, Plan, PlanPatch, CreatePlanInput, PlanMeta } from "./types";

const BASE = "/api";

export async function fetchTickets(): Promise<Ticket[]> {
  const res = await fetch(`${BASE}/tickets`);
  if (!res.ok) throw new Error(`Failed to fetch tickets: ${res.status}`);
  return res.json();
}

export async function fetchTicket(id: string): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to fetch ticket: ${res.status}`);
  return res.json();
}

export async function patchTicket(id: string, patch: TicketPatch): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to patch ticket: ${res.status}`);
  return res.json();
}

export async function patchTicketBody(id: string, body: string): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets/${encodeURIComponent(id)}/body`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Failed to patch ticket body: ${res.status}`);
  return res.json();
}

export async function fetchMeta(): Promise<Meta> {
  const res = await fetch(`${BASE}/meta`);
  if (!res.ok) throw new Error(`Failed to fetch meta: ${res.status}`);
  return res.json();
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create ticket: ${res.status}`);
  return res.json();
}

export async function deleteTicket(id: string): Promise<void> {
  const res = await fetch(`${BASE}/tickets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete ticket: ${res.status}`);
}

export async function fetchConfig(): Promise<TicketbookConfig> {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export async function patchConfig(patch: Partial<TicketbookConfig>): Promise<TicketbookConfig> {
  const res = await fetch(`${BASE}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update config: ${res.status}`);
  return res.json();
}

export async function reorderTicket(
  id: string,
  afterId: string | null,
  beforeId: string | null,
): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets/${encodeURIComponent(id)}/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ afterId, beforeId }),
  });
  if (!res.ok) throw new Error(`Failed to reorder ticket: ${res.status}`);
  return res.json();
}

// --- Plans ---

export async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch(`${BASE}/plans`);
  if (!res.ok) throw new Error(`Failed to fetch plans: ${res.status}`);
  return res.json();
}

export async function fetchPlan(id: string): Promise<Plan> {
  const res = await fetch(`${BASE}/plans/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to fetch plan: ${res.status}`);
  return res.json();
}

export async function patchPlan(id: string, patch: PlanPatch): Promise<Plan> {
  const res = await fetch(`${BASE}/plans/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to patch plan: ${res.status}`);
  return res.json();
}

export async function patchPlanBody(id: string, body: string): Promise<Plan> {
  const res = await fetch(`${BASE}/plans/${encodeURIComponent(id)}/body`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Failed to patch plan body: ${res.status}`);
  return res.json();
}

export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const res = await fetch(`${BASE}/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create plan: ${res.status}`);
  return res.json();
}

export async function deletePlan(id: string): Promise<void> {
  const res = await fetch(`${BASE}/plans/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete plan: ${res.status}`);
}

export async function fetchPlanMeta(): Promise<PlanMeta> {
  const res = await fetch(`${BASE}/plans/meta`);
  if (!res.ok) throw new Error(`Failed to fetch plan meta: ${res.status}`);
  return res.json();
}

export async function cutTicketsFromPlan(planId: string): Promise<{ plan: Plan; createdTickets: any[]; count: number }> {
  const res = await fetch(`${BASE}/plans/${encodeURIComponent(planId)}/cut-tickets`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to cut tickets: ${res.status}`);
  return res.json();
}

export function subscribeSSE(onEvent: (event: { type: string; ticketId?: string; source?: string }) => void): () => void {
  let es: EventSource | null = new EventSource(`${BASE}/events`);

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      onEvent(data);
    } catch {
      // ignore malformed events
    }
  };

  es.onerror = () => {
    // EventSource auto-reconnects by default
  };

  return () => {
    if (es) {
      es.close();
      es = null;
    }
  };
}
