---
name: relay
description: Use whenever the user mentions tasks, plans, docs, TKT-*/TKTB-*/PLAN-*/DOC-* IDs, the .relay/ directory, creating/updating/reviewing tasks, plans, or docs, picking up work, handing off tasks to an agent, reviewing what an agent did, breaking plans into actionable tasks, linking commits/PRs to tasks, or asking "what should I work on next". Covers the full relay workflow via the relay CLI.
---

# Relay

Relay is a local-first task, plan, and reference-doc tracker. Everything lives under `.relay/` — tasks in `tasks/`, plans in `plans/`, and docs in `docs/` as markdown files with YAML frontmatter. The `relay` CLI is the supported integration: every command resolves `.relay/` from the directory you run it in, so it's worktree-correct by construction. **Always prefer the CLI over editing the markdown files directly** — direct edits skip ID assignment, file naming, ordering, and watcher sync.

## Worktree behavior — read this first

Every `relay <verb>` invocation walks up from `process.cwd()` to find `.relay/`. If you `cd` into a git worktree, the next CLI call operates on the worktree's `.relay/` (or, if `worktreeMode: shared` is set in `.relay/config.yaml`, the main checkout's). Run `relay where` from any directory to confirm what relay would resolve to — it prints the resolved path, whether you're in a worktree, and which mode applies. Use it whenever you're unsure which `.relay/` an agent is touching.

## Primitives

**Plans** (`PLAN-*`) are strategic documents — PRDs, feature specs, brainstorms. They are higher-level than tasks and can link to the tasks that implement them. Statuses: `draft`, `active`, `completed`, `archived`.

**Tasks** (`TKT-*`, or a project prefix like `TKTB-*`) are the unit of work. Statuses: `draft`, `backlog`, `open`, `in-progress`, `done`, `cancelled`. Priorities: `low`, `medium`, `high`, `urgent`. Tasks can have subtasks (markdown checkboxes in the body), be blocked by other tasks, relate to other tasks, and link to commits/PRs via `refs`.

**Docs** (`DOC-*`) are durable reference material — architecture notes, UX guidance, integration docs, and research summaries worth keeping around. They do not have workflow state. Treat them as stable context for humans and agents.

The typical flow is: capture durable context in docs → brainstorm in a plan → cut tasks from the plan → pick up a task → hand off to an agent → review what changed → mark done and link the commit.

## Task statuses

Statuses are how humans and agents coordinate who is working on what and what's ready. Keep them accurate.

| Status | Meaning |
|---|---|
| `draft` | Not yet fleshed out — needs more detail before it's actionable |
| `backlog` | Future work — not ready to be picked up yet |
| `open` | Ready to be picked up right now |
| `in-progress` | Actively being worked on by a human or agent |
| `done` | Complete |
| `cancelled` | Won't do |

Most tasks live in `backlog`. Only move a task to `open` when it's actually ready for someone to start. When creating tasks, default to `backlog` unless the user explicitly says it's ready to work on now or the context makes that clear.

## Keeping statuses current

**Proactively consider whether tickets should be updated based on the work you're doing.** Don't wait for the user to ask — if you're actively implementing something that corresponds to a ticket, update it:

- **Starting work on a task?** Set it to `in-progress` and assign yourself before writing any code.
- **Finished the work described in a task?** Set it to `done` (and add agent notes).
- **Work you're doing makes a task obsolete or unblocks it?** Update or flag it.
- **Creating a new task?** Think about whether it's `backlog` (future) or `open` (ready now) — don't default everything to `open`.
- **See a task marked `open` or `in-progress` that clearly isn't?** Flag it to the user rather than silently changing it — someone else may have context you don't.

The board is a shared coordination surface. Stale statuses erode trust in the system and make it harder for humans to know what's actually happening.

## Output formats: text vs --json

Every read command (`list`, `get`) and every mutating command (`create`, `update`, `delete`, …) supports `--json`. Use it whenever you need to parse the output programmatically — for example, capturing the new task's ID after `relay task create`, or filtering a list down to specific fields.

```sh
# Pull just the IDs of all open tasks:
relay task list --status open --json | jq -r '.[].id'

# Capture the new ID into a shell variable:
ID=$(relay task create --title "Fix login" --json | jq -r '.id')
```

Default text output is for humans (and is allowed to evolve). The `--json` shape is the contract: id/title/status/created/updated/body are always present on tasks; optional fields are *omitted* (not nulled) when undefined, so check with `if (t.priority)` rather than expecting the key to always exist.

## When the user asks what to work on

```sh
relay task list --status open
```

Add `--priority high` or `--project foo` to narrow further. Results come back sorted by priority and order — the top item is the recommendation. Don't open every task; the summary line is enough to propose what to pick up. If there are no open tasks, run `relay task list --status backlog` before telling the user there's nothing to do.

## When the user wants to start work on a task

1. Read the full body, subtasks, refs, and any prior agent notes:
   ```sh
   relay task get TKT-001
   ```
2. Claim the task — set status and assignee:
   ```sh
   relay task update TKT-001 --status in-progress --assignee claude-code
   ```
   Use whatever name identifies your agent (`claude-code`, `codex`, etc.). This is how humans and other agents see who is working on what.
3. Read the body carefully before doing anything. Subtasks are markdown checkboxes (`- [ ]`), and any section after a `<!-- agent-notes -->` marker contains debriefs from prior agents — read these so you don't repeat their mistakes or redo their work.

## When the user wants to create a task

```sh
relay task create --title "Fix login redirect"
```

That's the minimum. Defaults: `status: backlog`, no priority. Only set `--status open` if the user says it's ready to pick up now or the context makes that obvious. Only set `--priority` if the user specified one or the context clearly calls for it. If a `--project`, `--epic`, `--sprint`, `--blocked-by`, or `--related-to` is obvious from context, include it — but don't interrogate the user for metadata they didn't ask to set.

For long bodies, pipe via stdin or read from a file:

```sh
cat notes.md | relay task create --title "Refactor parser" --body-from-stdin
relay task create --title "…" --body-from-file ./details.md
```

**Never invent projects, epics, or sprints that don't already exist** — run `relay task list --json | jq -r '.[].project' | sort -u` first to see what's in use if you need to check.

## When the user wants to break a plan into tasks

If the plan has a checklist of unchecked items in its body:

```sh
relay plan cut-tasks PLAN-005
```

One command parses every unchecked checkbox, creates a task for each, links them back to the plan, and checks off the items. Preview the plan with `relay plan get PLAN-005` first if you're unsure what will be cut, especially for plans with many items. The `--json` form (`relay plan cut-tasks PLAN-005 --json`) returns `{ planId, createdTaskIds }` so you can chain into follow-up `relay task update` calls without parsing the bulleted output.

If the plan has prose instead of a checklist, ask whether to (a) add checklist items to the plan first (so the user can review and edit before cutting), or (b) create tasks directly with `relay task create` and link them via `relay plan link-task <PLAN-ID> <TASK-ID>`. Default to (a) unless the user wants to move fast.

## When finishing work on a task

1. Check off completed subtasks:
   ```sh
   relay task complete-subtask TKT-001 --index 0
   # or by substring match:
   relay task complete-subtask TKT-001 --text "wire up the handler"
   ```
2. Add a debrief to the task body under a `<!-- agent-notes -->` marker. Use `--body-from-stdin` so the existing body is preserved and you append cleanly:
   ```sh
   {
     relay task get TKT-001 --json | jq -r '.body'
     printf '\n<!-- agent-notes -->\n\n## Debrief\n\n…notes here…\n'
   } | relay task update TKT-001 --body-from-stdin
   ```
   Notes should cover: what changed, what you deliberately didn't do, what the user should verify, and any follow-up tasks that should be filed.
3. Mark the task done:
   ```sh
   relay task update TKT-001 --status done
   ```
4. Link the commit or PR:
   ```sh
   relay task link-ref TKT-001 abc123def
   relay task link-ref TKT-001 https://github.com/org/repo/pull/42
   ```
   Convention: include the task ID in the commit message itself (e.g. `"TKT-001: fix kanban reorder bug"`) so the link is discoverable from git history too.

## When the user wants to review what an agent did on a task

```sh
relay task get TKT-001
```

The `<!-- agent-notes -->` section, linked `refs`, and current `status` are the sources of truth. If refs point to commits or PR URLs, offer to read them for the user. Summarize: what was the goal, what actually landed, what's still open, and what follow-up tasks were filed (if any).

## When the user wants to create a plan

```sh
relay plan create --title "Q3 roadmap"
```

Plans default to `status: draft`. Put the brainstorm or spec content in `--body`, `--body-from-file`, or pipe via stdin:

```sh
cat plan.md | relay plan create --title "Q3 roadmap" --body-from-stdin --tag roadmap
```

If the user wants to kick off work immediately, finish writing the body first, then use `relay plan cut-tasks <PLAN-ID>` to break it into tasks — don't interleave plan writing with task creation.

## When the user wants to create or update a doc

Use docs for reference material that should stay true or useful beyond a single implementation cycle: architecture notes, UX principles, integration guides, and distilled research.

```sh
cat ARCH.md | relay doc create --title "Auth architecture" --body-from-stdin --tag architecture --ref https://example.com/spec
```

Use `relay doc update DOC-007 --add-tag <new>` to refine over time without overwriting existing tags.

## Updating list-shaped fields (tags, refs, blocked-by, related-to, linked tasks)

`update` commands distinguish three operations on every list field:

- `--tag x --tag y` (or `--ref`, `--task`, `--blocked-by`, `--related-to`) — **replaces** the entire list
- `--add-tag x` / `--remove-tag y` — additive / subtractive **delta** on the existing list
- `--clear-tags` — sets the field to empty/undefined

These three are mutually exclusive on the same field. Default to deltas (`--add-tag`/`--remove-tag`) when refining; use full replace only when you genuinely want to overwrite.

## First-time setup in a project

`relay init` scaffolds `.relay/` in a project. To avoid a permission prompt on every CLI call inside Claude Code, add an allowlist entry once:

```jsonc
// .claude/settings.json
{
  "permissions": {
    "allow": ["Bash(relay *)"]
  }
}
```

`relay init` will offer to write this for you on first run.

## Reference: CLI commands

**Tasks**
| Command | Purpose |
|---|---|
| `relay task list [--status S] [--priority P] [--project P] [--epic E] [--sprint S] [--tag T...]` | List tasks, sorted by priority/order |
| `relay task get <ID>` | Print full task body and metadata |
| `relay task create --title "…" […]` | Create a new task |
| `relay task update <ID> […]` | Change any field; deltas + replace + clear on lists |
| `relay task delete <ID>` | Archive a task |
| `relay task link-ref <ID> <commit-or-url>` | Attach a commit SHA or PR URL |
| `relay task add-subtask <ID> "<text>"` | Append a checkbox to the task body |
| `relay task complete-subtask <ID> --index N \| --text "…"` | Check off a subtask |
| `relay task reorder <ID> [--after ID] [--before ID]` | Move within its status column |

**Plans**
| Command | Purpose |
|---|---|
| `relay plan list [--status S] [--project P] [--tag T...]` | List plans |
| `relay plan get <ID>` | Print full plan body and metadata |
| `relay plan create --title "…" […]` | Create a new plan |
| `relay plan update <ID> […]` | Change any field; deltas + replace + clear on lists |
| `relay plan delete <ID>` | Archive a plan |
| `relay plan link-task <PLAN-ID> <TASK-ID>` | Attach an existing task to a plan |
| `relay plan cut-tasks <PLAN-ID>` | Parse unchecked checkboxes, create a task per item, link them |

**Docs**
| Command | Purpose |
|---|---|
| `relay doc list [--project P] [--tag T...]` | List reference docs |
| `relay doc get <ID>` | Print full doc body and metadata |
| `relay doc create --title "…" […]` | Create a new doc |
| `relay doc update <ID> […]` | Change any field |
| `relay doc delete <ID>` | Archive a doc |

**Maintenance + introspection**
| Command | Purpose |
|---|---|
| `relay where [--json]` | Print the resolved `.relay/` directory and worktree state |
| `relay doctor [--fix] [--json]` | Validate artifact integrity (counters, duplicates, dangling refs, .gitattributes) |
| `relay sync [--dry-run] [--push] [--json]` | Stage and commit pending artifact changes with a structured message |

Every command above accepts `--help` (or `relay help <topic>`) for full flag listings and examples.

## Rules of thumb

- **Never edit `.relay/tasks/*.md`, `.relay/plans/*.md`, or `.relay/docs/*.md` directly.** Use the CLI.
- **Never invent task or plan IDs.** IDs are assigned by `relay <noun> create`.
- **Preserve prior agent notes when updating a body.** Pipe `relay <noun> get <ID> --json | jq -r '.body'` into the new body so you append rather than overwrite.
- **Prefer filters over loading everything.** `relay task list --status open` is cheaper than reading every task.
- **Confirm before bulk operations.** For `relay plan cut-tasks` on a plan with many items, show the user what will be created first unless they've told you to just go.
- **Status changes are how work is coordinated.** Always flip to `in-progress` when starting and `done` when finishing — don't leave tasks in the wrong state because it looks cosmetic.

## Legacy: the relay MCP server

`relay --mcp` still starts an MCP server with the same tool surface as the CLI commands above, and existing `.mcp.json` configs keep working. **The CLI is the supported path going forward** — the MCP server resolves `.relay/` once at startup from `process.cwd()`, which makes it brittle in worktree-heavy workflows. Prefer the CLI.
