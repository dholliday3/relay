# Ticketbook



https://github.com/user-attachments/assets/bec73d7b-c4c6-43f5-ba0b-cef61e3719cb


Local-first tasks, plans, and reference docs for working alongside coding agents. Everything is stored as markdown with YAML frontmatter under `.ticketbook/` — editable by hand, queryable by agents over MCP, and browsable in a small web UI.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/dholliday3/ticketbook/main/scripts/install.sh | bash
```

Installs the release binary to `~/.local/bin/ticketbook` and the `ticketbook` agent skill to `~/.claude/skills/ticketbook/`. macOS and Linux, x64 and arm64.

<details>
<summary>Pin a version · upgrade · install manually</summary>

```bash
# Pin to a specific release
curl -fsSL https://raw.githubusercontent.com/dholliday3/ticketbook/main/scripts/install.sh | bash -s -- v0.1.0

# Check whether a newer release is available (exits 1 if stale — safe for prompts and CI)
ticketbook upgrade --check

# Upgrade in place (re-runs the installer with SHA256 verification + atomic replace)
ticketbook upgrade

# Both commands accept --json for scripting:
ticketbook upgrade --check --json
# => {"success":true,"command":"upgrade","action":"checked","current":"0.1.0","latest":"0.2.0","upToDate":false}
```

Prefer not to run a shell script? Grab the binary and `.sha256` from the [latest release](https://github.com/dholliday3/ticketbook/releases/latest), verify the checksum, and drop the binary on your `PATH`.

</details>

## Quick Start

```bash
# Scaffold data directories, .mcp.json, and skill files
ticketbook init

# Add agent instructions to CLAUDE.md (or AGENTS.md)
ticketbook onboard

# Start the web UI (default port 4242, auto-increments on collision)
ticketbook

# Start with a specific directory
ticketbook --dir /path/to/project
```

## CLI Options

```
ticketbook [command] [options] [path]

Commands:
  init        Scaffold .ticketbook/ directory, .mcp.json, and skill files
  onboard     Write/update the ticketbook agent instructions section in CLAUDE.md (or AGENTS.md)
  (default)   Start the server and open the UI

Options:
  --dir <path>   Path to .ticketbook/ directory (or directory containing it)
  --port <num>   Server port (default: 4242, auto-increment on collision)
  --no-ui        Server only, no static UI serving
  --mcp          Start MCP server mode (stdio transport, no HTTP)
  --check        (onboard only) Report status without modifying files; exits 1 if stale
  --stdout       (onboard only) Print the onboarding section to stdout, touching no files
  --json         Emit structured JSON output (onboard mode)
  -h, --help     Show this help message
```

## Onboarding

`ticketbook onboard` writes a versioned, marker-wrapped section of agent instructions into your project's `CLAUDE.md` (or `.claude/CLAUDE.md`, or `AGENTS.md` — whichever exists first). The section is bracketed by `<!-- ticketbook:start -->` and `<!-- ticketbook:end -->` markers with an embedded `<!-- ticketbook-onboard-v:N -->` version comment. Re-running `onboard` after a ticketbook upgrade surgically replaces just the bracketed region — any content you wrote outside the markers is preserved byte-for-byte.

**File preference.** `onboard` walks the following candidate paths and takes the first that exists. If none exist, it creates `CLAUDE.md` at the project root.

1. `CLAUDE.md` at the project root
2. `.claude/CLAUDE.md`
3. `AGENTS.md`

**Modes.**

- `bunx ticketbook onboard` — create, update, append, or no-op based on current state
- `bunx ticketbook onboard --check` — report current state without modifying files. Exits 1 when the section is `missing` or `outdated`, so CI can use it as a freshness gate (`ticketbook onboard --check || fail`)
- `bunx ticketbook onboard --stdout` — print the wrapped snippet to stdout without touching any files. Useful for previewing before committing
- `bunx ticketbook onboard --json` — emit a structured JSON envelope (`{success, command, action, file?, status?}`), pairs well with `--check` for scripting

**Versioning.** The `<!-- ticketbook-onboard-v:N -->` version marker bumps when the onboarding content materially changes. Projects with an older marker get their bracketed section surgically replaced on the next `onboard` run; content outside the markers is left alone.

## Claude Code MCP Integration

Ticketbook exposes an MCP server so Claude Code can read and manage your tasks directly.

Add this to your Claude Code MCP config (`.claude/settings.json` or project-level `.mcp.json`):

```json
{
  "mcpServers": {
    "ticketbook": {
      "command": "bunx",
      "args": ["ticketbook", "--mcp"],
      "cwd": "/path/to/your/repo"
    }
  }
}
```

Replace `/path/to/your/repo` with the absolute path to the directory containing your `.ticketbook/` folder.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with optional filters (status, priority, project, epic, sprint, tags) |
| `get_task` | Get full task details including body content |
| `create_task` | Create a new task |
| `update_task` | Update task fields |
| `delete_task` | Delete (archive) a task |
| `complete_subtask` | Mark a subtask as done (by index or text match) |
| `add_subtask` | Add a new subtask to a task |
| `reorder_task` | Reorder a task within its status group |
| `list_plans` | List plans with optional filters (status, project, tags) |
| `get_plan` | Get full plan details including body content |
| `create_plan` | Create a new plan |
| `update_plan` | Update plan fields |
| `delete_plan` | Delete (archive) a plan |
| `cut_tasks_from_plan` | Create linked tasks from unchecked plan checklist items |
| `list_docs` | List reference docs with optional filters (project, tags, search) |
| `get_doc` | Get full doc details including body content |
| `create_doc` | Create a new reference doc |
| `update_doc` | Update doc fields |
| `delete_doc` | Delete (archive) a doc |

### Available MCP Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Task List | `tasks://list` | Full task list in compact format |
| Plan List | `plans://list` | Full plan list in compact format |
| Doc List | `docs://list` | Full doc list in compact format |

### Available MCP Prompts

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `task-context` | `id` (task ID) | Returns formatted context for a task including details, subtasks, and related tasks |
