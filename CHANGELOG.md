# Changelog

## 0.5.1

### Changed

- **`relay init` now runs the onboard step automatically.** The CLAUDE.md / AGENTS.md section is written as part of init by default — no more "ran init, agent still doesn't know about relay" footgun. Pass `--no-onboard` to keep init pure-scaffolding (e.g. when CLAUDE.md is hand-managed). `relay onboard` remains a standalone command for re-running, `--check`, `--stdout`, and `--json`.

## 0.5.0 — CLI as the primary agent surface

The biggest user-visible change since 0.4: agents now drive relay via a full CLI surface instead of (only) the MCP server. The MCP server still works — existing `.mcp.json` configs are unchanged — but the CLI is the recommended path going forward.

**Why:** the MCP server resolved `.relay/` once at process startup from the launching cwd. When an agent created a git worktree mid-session and `cd`-ed into it, every subsequent MCP tool call still operated on the **main checkout's** `.relay/`, silently writing tasks and plans to the wrong tree. The CLI walks up from the agent's actual cwd on every invocation, so worktrees Just Work without rebinding logic, set_workspace dances, or session state.

### Added

- **CLI subcommands** mirroring the full MCP tool surface:
  - `relay task list | get | create | update | delete | link-ref | add-subtask | complete-subtask | reorder`
  - `relay plan list | get | create | update | delete | link-task | cut-tasks`
  - `relay doc list | get | create | update | delete`
  - `relay doctor [--fix]` — exits 0 only when no FAIL diagnostics remain (CI-safe gate)
  - `relay sync [--dry-run] [--push]`
  - `relay where` — print the resolved `.relay/` directory + worktree state (debug aid)
- **`--json` on every read/write command** — stable shape: `id`, `title`, `created`, `updated`, `body` always present; optional fields omitted when undefined
- **Body input flags** on `create` / `update` for tasks/plans/docs:
  - `--body "…"` — inline string
  - `--body-from-file <path>` — read from disk
  - `--body-from-stdin` — pipe via stdin (any of the three is exclusive)
- **Delta semantics** for list-shaped fields on `update`:
  - `--tag T` (or `--ref`/`--task`/`--blocked-by`/`--related-to`) — replaces the full list
  - `--add-tag T` / `--remove-tag T` — additive / subtractive deltas on the existing list
  - `--clear-tags` — sets the field to empty
- **`relay init --allowlist` / `--no-allowlist`** — adds `Bash(relay *)` to `.claude/settings.json` so Claude Code skips per-call permission prompts. Idempotent; preserves unrelated settings keys. Defaults to interactive prompt when stdin is a TTY.

### Changed

- **`skills/relay/SKILL.md` rewritten** around the CLI. Behavior-shaping sections (status discipline, when-to-X recipes, rules of thumb) are preserved; only the example commands and tool references changed.
- **`relay onboard` content bumped to v4** — wrapped section now leads with CLI commands. Existing CLAUDE.md / AGENTS.md sections get marked as outdated by `relay onboard --check`; re-run to pick up.
- **`relay init` printed next-steps** lead with the CLI surface; MCP wiring is mentioned as a fallback for non-Claude-Code agents.
- **`relay help <topic>`** added — every subcommand has its own help (also reachable via `relay <noun> --help`).

### Internal

- New `bin/cli/` directory: typed `Command` discriminated union, per-noun parsers + handlers, shared `applyListOps` + `resolveRelayDirs` helpers. Handlers are pure functions returning `HandlerResult`; the dispatcher in `bin/relay.ts` does all I/O.
- New worktree integration test (`bin/cli/worktree-integration.test.ts`) — sets up a real git repo + linked worktree and proves the regression scenario passes: `relay task create` from a worktree writes into the worktree's `.relay/`, not the main checkout's.
- 519 tests passing (140 in `bin/`, 379 in `packages/`).
