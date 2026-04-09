# Ticketbook

A local-first task tracker that stores tasks as markdown files in a `.tasks/` directory.

## Quick Start

```bash
# Initialize a new ticketbook in the current directory
bunx ticketbook init

# Start the web UI
bunx ticketbook

# Start with a specific directory
bunx ticketbook --dir /path/to/project
```

## CLI Options

```
ticketbook [command] [options] [path]

Commands:
  init        Scaffold a new .tasks/ directory
  (default)   Start the server and open the UI

Options:
  --dir <path>   Path to .tasks/ directory (or directory containing it)
  --port <num>   Server port (default: auto-assigned)
  --no-ui        Server only, no static UI serving
  --mcp          Start MCP server mode (stdio transport, no HTTP)
  -h, --help     Show this help message
```

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

Replace `/path/to/your/repo` with the absolute path to the directory containing your `.tasks/` folder.

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

### Available MCP Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Task List | `tasks://list` | Full task list in compact format |

### Available MCP Prompts

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `task-context` | `id` (task ID) | Returns formatted context for a task including details, subtasks, and related tasks |
