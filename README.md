# Relay

**Planning that lives in your repo.**

https://github.com/user-attachments/assets/bec73d7b-c4c6-43f5-ba0b-cef61e3719cb

## Two halves of one workflow

**Plans, tasks, and docs in your repo.**
Markdown with YAML frontmatter under `.relay/`. Edit by hand, query by agent over MCP, browse in a local UI. Every change is a commit; every branch carries its own plan.

**A copilot for your coding agents.**
Launch Claude Code or Codex CLI straight from a plan or task, with the relevant context already loaded. Keep a thread between "what I wanted" and "what the agent did."

## The three primitives

- **Plan** — long-form intent. What you're building and why.
- **Task** — a unit of work. Status, priority, subtasks.
- **Doc** — reference material that outlives any one task.

All three are plain markdown files with YAML frontmatter. Nothing is locked inside a database — `git log` is your history, `git blame` is your audit trail, and branches carry their own in-flight context.

In linked git worktrees, Relay uses the current checkout's `.relay/` by default so artifacts stay on the branch you're editing. Every CLI invocation walks up from the directory you run it in to find `.relay/`, so it Just Works inside worktrees without any session state — run `relay where` to confirm which `.relay/` the CLI would resolve. If you intentionally want shared artifacts instead, set `worktreeMode: shared` in `.relay/config.yaml`.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/dholliday3/relay/main/scripts/install.sh | bash
```

Installs the binary to `~/.local/bin/relay` and the agent skill to `~/.claude/skills/relay/`. macOS and Linux, x64 and arm64. Homebrew tap coming soon.

<details>
<summary>Pin a version · upgrade · install manually</summary>

```bash
# Pin to a specific release
curl -fsSL https://raw.githubusercontent.com/dholliday3/relay/main/scripts/install.sh | bash -s -- v0.1.0

# Check whether a newer release is available (exits 1 if stale — safe for prompts and CI)
relay upgrade --check

# Upgrade in place (re-runs the installer with SHA256 verification + atomic replace)
relay upgrade

# Both commands accept --json for scripting:
relay upgrade --check --json
# => {"success":true,"command":"upgrade","action":"checked","current":"0.1.0","latest":"0.2.0","upToDate":false}
```

Prefer not to run a shell script? Grab the binary and `.sha256` from the [latest release](https://github.com/dholliday3/relay/releases/latest), verify the checksum, and drop the binary on your `PATH`.

</details>

## Quick start

```bash
relay init                                # scaffold .relay/, .mcp.json, and skill files
relay onboard                             # add agent instructions to CLAUDE.md (or AGENTS.md)
relay task list --status open             # see what's ready to work on
relay task create --title "Fix login"     # create a task
relay                                     # start the UI (port 4242)
```

`relay --help` or `relay help <topic>` (e.g. `relay help task`) prints the full surface for any subcommand.

<details>
<summary>CLI reference — tasks, plans, docs, and maintenance</summary>

The CLI is the recommended way for agents and humans to interact with relay. Every command resolves `.relay/` from the directory you run it in, so it's worktree-correct without any session state.

**Tasks**

```bash
relay task list [--status S] [--priority P] [--project P] [--epic E] [--sprint S] [--tag T...] [--json]
relay task get <ID> [--json]
relay task create --title "…" [--status S] [--priority P] [--body "…" | --body-from-file <path> | --body-from-stdin] [--project P] [--tag T...] [--blocked-by ID...] [--related-to ID...] [--assignee NAME] [--created-by NAME] [--json]
relay task update <ID> [<flags>]              # same flags as create + --clear-* + --add-tag/--remove-tag deltas
relay task delete <ID>
relay task link-ref <ID> <commit-or-url>
relay task add-subtask <ID> "<text>"
relay task complete-subtask <ID> --index N | --text "<match>"
relay task reorder <ID> [--after ID] [--before ID]
```

**Plans**

```bash
relay plan list [--status S] [--project P] [--tag T...] [--json]
relay plan get <ID> [--json]
relay plan create --title "…" [--status S] [--task ID...] [--tag T...] [--body "…" | --body-from-file | --body-from-stdin] [--json]
relay plan update <ID> [<flags>]              # same flags as create + --clear-* + delta variants
relay plan delete <ID>
relay plan link-task <PLAN-ID> <TASK-ID>
relay plan cut-tasks <PLAN-ID> [--json]       # parses unchecked checkboxes into linked tasks
```

**Docs**

```bash
relay doc list [--project P] [--tag T...] [--json]
relay doc get <ID> [--json]
relay doc create --title "…" [--tag T...] [--ref URL...] [--body "…" | --body-from-file | --body-from-stdin] [--json]
relay doc update <ID> [<flags>]
relay doc delete <ID>
```

**Top-level**

```bash
relay [path]                                  # start the UI (default behavior)
relay --mcp                                   # start the MCP server (stdio)
relay init [--allowlist | --no-allowlist]     # scaffold a project; offers Bash(relay *) allowlist
relay onboard [--check] [--stdout] [--json]   # write CLAUDE.md / AGENTS.md
relay upgrade [--check] [--json]              # upgrade to latest release
relay where [--json]                          # which .relay/ would the CLI resolve to from here?
relay doctor [--fix] [--json]                 # validate artifact integrity (CI-safe; exits 1 on failures)
relay sync [--dry-run] [--push] [--json]      # commit pending artifact changes with a structured message
```

Every read/write command supports `--json` for parseable output. Always-present fields (`id`, `title`, `created`, `updated`, `body`) are guaranteed; optional fields are omitted when undefined per `JSON.stringify` convention.

</details>

<details>
<summary>MCP integration (legacy)</summary>

The CLI is the recommended path going forward — see the CLI reference above. The MCP server still works for back-compat with existing `.mcp.json` setups, but it resolves `.relay/` once at startup from the launching cwd, which makes it brittle in worktree-heavy workflows. The CLI walks up from the agent's actual cwd on every call, so it's worktree-correct by construction.

Relay still exposes an MCP server so Claude Code (and any MCP-aware agent) can read and manage your plans, tasks, and docs directly.

Add this to your Claude Code MCP config (`.claude/settings.json` or project-level `.mcp.json`):

```json
{
  "mcpServers": {
    "relay": {
      "command": "relay",
      "args": ["--mcp"],
      "cwd": "/path/to/your/repo"
    }
  }
}
```

Replace `/path/to/your/repo` with the absolute path to the directory containing your `.relay/` folder.

**Tools**

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

**Resources**

| Resource | URI | Description |
|----------|-----|-------------|
| Task List | `tasks://list` | Full task list in compact format |
| Plan List | `plans://list` | Full plan list in compact format |
| Doc List | `docs://list` | Full doc list in compact format |

**Prompts**

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `task-context` | `id` (task ID) | Returns formatted context for a task including details, subtasks, and related tasks |

</details>

<details>
<summary>Agent onboarding details</summary>

`relay onboard` injects a versioned agent instructions block into `CLAUDE.md` (or `.claude/CLAUDE.md` / `AGENTS.md`). Re-running after an upgrade surgically replaces only the bracketed region — content outside the markers is untouched.

**File preference** (first match wins, falls back to creating `CLAUDE.md`):
1. `CLAUDE.md` at project root
2. `.claude/CLAUDE.md`
3. `AGENTS.md`

**Flags:**
- `--check` — report state without writing; exits 1 if `missing` or `outdated` (CI-safe gate)
- `--stdout` — print the snippet without touching any files
- `--json` — structured `{success, command, action, file?, status?}` envelope

**Versioning.** A `<!-- relay-onboard-v:N -->` comment bumps when content changes materially. Stale sections are auto-replaced on the next `onboard` run.

</details>
