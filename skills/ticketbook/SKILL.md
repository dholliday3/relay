---
name: ticketbook
description: Use whenever the user mentions tasks, plans, TKT-*/TKTB-*/PLAN-* IDs, the .tasks/ or .plans/ directories, creating/updating/reviewing tasks or plans, picking up work, handing off tasks to an agent, reviewing what an agent did, breaking plans into actionable tasks, linking commits/PRs to tasks, or asking "what should I work on next". Covers the full ticketbook workflow via the ticketbook MCP server.
---

# Ticketbook

Ticketbook is a local-first task and plan tracker. Tasks live in `.tasks/` and plans live in `.plans/` as markdown files with YAML frontmatter. The `ticketbook` MCP server exposes tools for reading and writing them — **always prefer the MCP tools over editing the markdown files directly**. Direct edits skip ID assignment, file naming, ordering, and watcher sync.

## Primitives

**Plans** (`PLAN-*`) are strategic documents — PRDs, feature specs, brainstorms. They are higher-level than tasks and can link to the tasks that implement them. Statuses: `draft`, `active`, `completed`, `archived`.

**Tasks** (`TKT-*`, or a project prefix like `TKTB-*`) are the unit of work. Statuses: `draft`, `backlog`, `open`, `in-progress`, `done`, `cancelled`. Priorities: `low`, `medium`, `high`, `urgent`. Tasks can have subtasks (markdown checkboxes in the body), be blocked by other tasks, relate to other tasks, and link to commits/PRs via `refs`.

The typical flow is: brainstorm in a plan → cut tasks from the plan → pick up a task → hand off to an agent → review what changed → mark done and link the commit.

## When the user asks what to work on

Call `list_tasks` with `status: "open"` (optionally add `priority: "high"` or a `project`/`epic`/`sprint` filter). Results come back sorted by priority and order — the top item is the recommendation. Don't open every task; the summary line is enough to propose what to pick up. If there are no open tasks, check `status: "backlog"` before telling the user there's nothing to do.

## When the user wants to start work on a task

1. Call `get_task` to load the full body, subtasks, refs, and any prior agent notes.
2. Call `update_task` to set `status: "in-progress"` and `assignee: "<your agent name>"` (e.g. `"claude-code"`, `"codex"`). This is how humans and other agents see who is working on what.
3. Read the body carefully before doing anything. Subtasks are markdown checkboxes (`- [ ]`), and any section after a `<!-- agent-notes -->` marker contains debriefs from prior agents — read these so you don't repeat their mistakes or redo their work.

## When the user wants to create a task

Call `create_task` with at minimum a `title`. Defaults: `status: "open"`, no priority. Only set a `priority` if the user specified one or the context clearly calls for it. If a `project`, `epic`, `sprint`, `blockedBy`, or `relatedTo` is obvious from context, include it — but don't interrogate the user for metadata they didn't ask to set. **Never invent projects, epics, or sprints that don't already exist** — call `list_tasks` first to see what's in use if you need to check.

## When the user wants to break a plan into tasks

If the plan has a checklist of unchecked items in its body, call `cut_tasks_from_plan` with the plan ID. One tool call parses every unchecked checkbox, creates a task for each, links them back to the plan, and checks off the items. Preview the plan with `get_plan` first if you're unsure what will be cut, especially for plans with many items.

If the plan has prose instead of a checklist, ask whether to (a) add checklist items to the plan first (so the user can review and edit before cutting), or (b) create tasks directly with `create_task` and then link them via `link_task_to_plan`. Default to (a) unless the user wants to move fast.

## When finishing work on a task

1. Check off completed subtasks: `complete_subtask` with either `index` (0-based) or `text` (substring match).
2. Add a debrief to the task body under a `<!-- agent-notes -->` marker. Use `update_task` with a new `body` that **preserves the original content** and appends `<!-- agent-notes -->` plus your notes (or appends underneath the existing marker if one is already there). Notes should cover: what changed, what you deliberately didn't do, what the user should verify, and any follow-up tasks that should be filed.
3. Set `status: "done"` via `update_task`.
4. If you created a commit or PR, call `link_ref` with the commit SHA or PR URL. Convention: include the task ID in the commit message itself (e.g. `"TKTB-015: fix kanban reorder bug"`) so the link is discoverable from git history too.

## When the user wants to review what an agent did on a task

Call `get_task`. The `<!-- agent-notes -->` section, linked `refs`, and current `status` are the sources of truth. If refs point to commits or PR URLs, offer to read them for the user. Summarize: what was the goal, what actually landed, what's still open, and what follow-up tasks were filed (if any).

## When the user wants to create a plan

Call `create_plan`. Plans default to `status: "draft"`. Put the brainstorm or spec content in `body`. If the user wants to kick off work immediately, finish writing the body first, then use `cut_tasks_from_plan` to break it into tasks — don't interleave plan writing with task creation.

## Reference: MCP tools

**Tasks**
| Tool | Purpose |
|---|---|
| `list_tasks` | List with filters (status, priority, project, epic, sprint, tags). Sorted. |
| `get_task` | Full task including body, subtasks, refs, agent notes |
| `create_task` | New task; `title` required |
| `update_task` | Change any field; only provided fields update |
| `delete_task` | Archive a task |
| `link_ref` | Attach a commit SHA or PR URL to a task |
| `complete_subtask` | Check off a subtask by `index` or `text` match |
| `add_subtask` | Append a new checkbox to a task body |
| `reorder_task` | Move a task within its status column |

**Plans**
| Tool | Purpose |
|---|---|
| `list_plans` | List with filters (status, project, tags) |
| `get_plan` | Full plan including body and linked task IDs |
| `create_plan` | New plan; `title` required |
| `update_plan` | Change any field |
| `delete_plan` | Archive a plan |
| `link_task_to_plan` | Attach an existing task to a plan |
| `cut_tasks_from_plan` | Parse unchecked checkboxes into tasks and link them |

## Rules of thumb

- **Never edit `.tasks/*.md` or `.plans/*.md` directly.** Use the MCP tools.
- **Never invent task or plan IDs.** IDs are assigned by `create_task` / `create_plan`.
- **Preserve prior agent notes when updating a body.** Append to the existing `<!-- agent-notes -->` section; don't overwrite it.
- **Prefer `list_tasks` filters over loading everything.** The server already sorts and filters.
- **Confirm before bulk operations.** For `cut_tasks_from_plan` on a plan with many items, show the user what will be created first unless they've told you to just go.
- **Status changes are how work is coordinated.** Always flip to `in-progress` when starting and `done` when finishing — don't leave tasks in the wrong state because it looks cosmetic.
