# AGENTS.md

This project uses **ticketbook** for task, plan, and reference-doc tracking. Tasks live in `.tasks/`, plans live in `.plans/`, and durable reference docs live in `.docs/` as markdown files with YAML frontmatter.

## If your agent supports Skills

The `ticketbook` skill at `skills/ticketbook/SKILL.md` covers the full workflow. Claude Code discovers it via the `.claude-plugin/` manifest; Codex discovers it via `.agents/skills/ticketbook/`. Nothing to configure — just ask about tasks, plans, or docs and the skill will load.

## If your agent does not support Skills

Use the `ticketbook` MCP server for all task, plan, and doc operations. Start it with:

```
bunx ticketbook --mcp
```

Never hand-edit files in `.tasks/`, `.plans/`, or `.docs/` — the MCP server owns ID assignment, file naming, ordering, and watcher sync. Direct edits will desync state.

### Core workflow

- **Start work:** set task `status: "in-progress"` and `assignee: "<your agent name>"`.
- **Finish work:** set `status: "done"`, append a debrief under a `<!-- agent-notes -->` marker in the body, and call `link_ref` with the commit SHA or PR URL.
- **Plans → tasks:** call `cut_tasks_from_plan` to parse unchecked checkboxes in a plan body into linked tasks in one step.
- **Commit convention:** include the task ID in the commit message (e.g. `TKTB-015: fix kanban reorder bug`).

### Enums

- **Task status:** `draft`, `backlog`, `open`, `in-progress`, `done`, `cancelled`
- **Task priority:** `low`, `medium`, `high`, `urgent`
- **Plan status:** `draft`, `active`, `completed`, `archived`

### Primitive roles

- **Docs:** stable reference material, architecture notes, and durable guidance that should stay useful over time
- **Plans:** higher-level proposals and implementation breakdowns that are expected to evolve as work gets clarified
- **Tasks:** concrete units of work that move through an execution lifecycle

See the full MCP tool list in the ticketbook README or by connecting to the MCP server.
