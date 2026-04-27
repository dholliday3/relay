---
id: PLAN-010
title: >-
  Migrate primary agent surface from MCP to CLI + skill (worktree-correct by
  design)
status: draft
tags:
  - cli
  - skill
  - agent-handoff
  - worktree
  - migration
project: relay
createdBy: claude-code
created: '2026-04-27T11:26:56.589Z'
updated: '2026-04-27T11:26:56.589Z'
---

> **Status:** draft. This plan migrates Relay's primary agent integration surface from a long-lived MCP server to a per-call CLI driven by the `relay` skill. The MCP server stays available during the transition but is no longer the recommended path.

## Why this plan exists

Relay's current MCP integration has a structural worktree problem: `bin/relay.ts --mcp` resolves `.relay/` once at server startup from `process.cwd()` and bakes `tasksDir`/`plansDir`/`docsDir` into a long-lived process. When the user starts a Claude Code session in the main checkout and an agent later creates a worktree and `cd`s into it, every MCP tool call still operates on the **main checkout's** `.relay/` — tasks created mid-feature land on the wrong branch, plans get edited from the wrong tree, and the `worktreeMode: shared` config is the wrong knob (it changes *which* `.relay/` to use, not *when* to re-resolve).

We considered a `set_workspace` MCP tool that rebinds dirs mid-session (cleanest *within* the MCP model). On reflection, the MCP transport is the wrong shape for relay altogether:

- **Every CLI invocation is a fresh process inheriting the agent's actual cwd.** `findRelayDirWithWorktree(process.cwd())` already does the right thing — the worktree bug evaporates without any rebinding logic, set_workspace dance, or session state.
- **One transport, not two.** The MCP server is ~1100 lines of stdio plumbing wrapping calls into `@relay/core`. The CLI is the same wrapping with less ceremony.
- **Universal across agents.** The skill *is* the integration. Codex, Cursor, Claude Code, raw shell — same surface. No per-agent MCP config, no `.mcp.json` to merge, no version drift between MCP-shipping and skill.
- **Easier to debug and demo.** `relay task list --status open` is greppable, scriptable, manually runnable. MCP tool calls go through a JSON-RPC channel users can't see.
- **Lower long-term maintenance.** When we add a new field, it's one CLI flag, not a CLI flag + an MCP arg + a zod schema + a tool description.

The tradeoffs we accept:

- **No structured tool schemas.** Agents parse text by default; `--json` is available when they need typed output.
- **One Bash permission prompt per command.** A `Bash(relay *)` allowlist entry in `.claude/settings.json` (which `relay init` can offer to write) makes this a one-time cost.
- **Tool discoverability shifts from "MCP handshake" to "skill description."** The skill has to be loaded for the agent to know what's available. This is already the dominant pattern in our setup.

## Scope

In scope for this plan:

1. A complete CLI surface that mirrors every existing MCP tool (tasks, plans, docs, doctor, sync) plus a `where` debug command for verifying worktree resolution
2. `--json` flag on every read/write command for structured output
3. A rewritten `skills/relay/SKILL.md` driven by CLI commands, with worktree behavior called out explicitly
4. `relay init` updates: still writes `.mcp.json` (back-compat), but also offers to add a `Bash(relay *)` permission entry to `.claude/settings.json`, and the printed next-steps point at the CLI/skill flow
5. README updates and a CHANGELOG entry; minor version bump (new user-facing surface)
6. Integration tests that shell out to the CLI binary and assert behavior, including a worktree test that proves running `relay task list` from a worktree resolves the worktree's `.relay/` not the main checkout's
7. Soft deprecation messaging for the MCP path: it keeps working, but the skill no longer references it as the primary path

Out of scope (explicit non-goals):

- **Removing the MCP server.** Existing `.mcp.json` configs keep working. We document deprecation, we don't break anyone.
- **A new release channel or distribution mechanism.** The same `relay` binary ships the same way; it just gains subcommands.
- **Reshaping the on-disk format.** Frontmatter, file naming, counter mechanics, and IDs are unchanged. The CLI is a new client over the existing `@relay/core` primitives.
- **Solving the "agent forgot to use the skill" problem.** Out of scope here — it's a skill-loading problem, not a relay one.
- **A separate `relay-cli` binary.** One binary, multiple subcommands.

## Sequencing

### Phase 1 — CLI scaffold and argument parsing

The current `bin/relay.ts` is a flat parser handling `serve`, `init`, `onboard`, `upgrade`, `--mcp`. Restructure it to support `relay <noun> <verb> [args]` while keeping the existing top-level commands working unchanged.

- Extract the existing argv parser into `bin/cli/parse.ts` (or similar) and add noun/verb dispatch (`task`, `plan`, `doc`, `doctor`, `sync`, `where`)
- Each noun gets its own dispatch module: `bin/cli/task.ts`, `bin/cli/plan.ts`, `bin/cli/doc.ts`, `bin/cli/maintenance.ts`
- Every subcommand resolves `.relay/` per-invocation via `findRelayDirWithWorktree(process.cwd())` (existing helper) — **this is the worktree fix**
- `--help` and `--help <subcommand>` print a coherent usage tree
- Exit codes: 0 success, 1 user error (bad args, not found), 2 internal error

### Phase 2 — Task subcommands

Map 1:1 to existing MCP tools. Default output is human-readable (mirror the MCP server's text output); `--json` flag emits structured JSON.

- [ ] `relay task list` — flags: `--status`, `--priority`, `--project`, `--epic`, `--sprint`, `--tag` (repeatable), `--json`
- [ ] `relay task get <ID>` — flags: `--json`; non-zero exit if not found
- [ ] `relay task create` — flags: `--title` (required), `--status`, `--priority`, `--body`, `--project`, `--epic`, `--sprint`, `--tag` (repeatable), `--blocked-by` (repeatable), `--related-to` (repeatable), `--assignee`, `--created-by`, `--body-from-file <path>`, `--body-from-stdin`, `--json`
- [ ] `relay task update <ID>` — same flags as create plus `--clear-priority`, `--clear-project`, `--clear-epic`, `--clear-sprint`, `--clear-assignee`. Replaces semantics: `--tag` replaces tags; for incremental tag changes use `--add-tag` / `--remove-tag`
- [ ] `relay task delete <ID>`
- [ ] `relay task link-ref <ID> <commit-or-url>`
- [ ] `relay task subtask add <ID> "<text>"`
- [ ] `relay task subtask done <ID>` — flags: `--index N` or `--text "<match>"` (one required)
- [ ] `relay task reorder <ID>` — flags: `--after <ID>`, `--before <ID>` (at least one)

### Phase 3 — Plan subcommands

- [ ] `relay plan list` — flags: `--status`, `--project`, `--tag`, `--json`
- [ ] `relay plan get <ID>` — flags: `--json`
- [ ] `relay plan create` — flags: `--title`, `--status`, `--project`, `--tag`, `--task` (repeatable, links existing task IDs), `--assignee`, `--created-by`, `--body`, `--body-from-file`, `--body-from-stdin`, `--json`
- [ ] `relay plan update <ID>` — same as create with clears
- [ ] `relay plan delete <ID>`
- [ ] `relay plan link-task <PLAN-ID> <TASK-ID>`
- [ ] `relay plan cut-tasks <PLAN-ID>` — flags: `--json`; output the list of created task IDs

### Phase 4 — Doc subcommands

- [ ] `relay doc list` — flags: `--project`, `--tag`, `--json`
- [ ] `relay doc get <ID>` — flags: `--json`
- [ ] `relay doc create` — flags: `--title`, `--project`, `--tag`, `--ref` (repeatable), `--created-by`, `--body`, `--body-from-file`, `--body-from-stdin`, `--json`
- [ ] `relay doc update <ID>` — same as create with clears
- [ ] `relay doc delete <ID>`

### Phase 5 — Maintenance + introspection

- [ ] `relay doctor` — flags: `--fix`, `--json`. Wraps `runDoctor` + `formatDoctorReport`
- [ ] `relay sync` — flags: `--dry-run`, `--push`, `--json`. Wraps the `sync` core function
- [ ] `relay where` — print the resolved `.relay/` path, whether a worktree was detected, and which mode was used. Useful for the agent to confirm worktree resolution. JSON shape: `{ relayDir, isWorktree, usesMainRootRelayDir, cwd }`

### Phase 6 — Skill rewrite

Rewrite `skills/relay/SKILL.md` from MCP-first to CLI-first. Key changes:

- Frontmatter `description` keeps existing trigger phrases (no behavior change for skill loading)
- Replace every "Call `<tool>` with…" with "Run `relay …`" examples
- Add a **Worktree behavior** section near the top: "Every relay command resolves `.relay/` from the directory you run it in. If you're in a git worktree and the worktree contains its own `.relay/`, that's what's used. If the worktree doesn't have one and `worktreeMode: shared` is set, the main checkout's `.relay/` is used. Run `relay where` to confirm."
- Add a **JSON output** section: every read/write command supports `--json`; use it when you need to parse structured output (e.g. extracting a task ID from `relay task create`)
- Reorder the reference table at the bottom to match CLI subcommands, not MCP tool names
- Note that the MCP server still works for backwards compatibility but **the CLI is the supported path**

### Phase 7 — Init flow updates

- [ ] `relay init` keeps writing `.mcp.json` (back-compat) but also detects `.claude/settings.json` and offers to add a `Bash(relay *)` permission entry. If the file doesn't exist, create it with that single allowlist line.
- [ ] Update the printed next-steps in `printInitSummary` to recommend the CLI flow first and mention the MCP as a legacy option.
- [ ] Update `relay onboard` so the wrapped section in `CLAUDE.md` / `AGENTS.md` references the CLI as the canonical path.

### Phase 8 — Tests

- [ ] Unit tests for the argv parser (each subcommand, edge cases, error messages)
- [ ] Integration tests that spawn the real `bun bin/relay.ts <subcommand>` against a tmp `.relay/` directory and assert observable behavior (file written, counter bumped, output format)
- [ ] **Worktree integration test** — set up a `git worktree add` in a tmp repo, run `relay task create` from inside the worktree, and assert the task lands in the worktree's `.relay/tasks/`, not the main checkout's. This is the regression test for the bug that motivated this plan.
- [ ] `--json` schema test for every command that supports it
- [ ] Existing MCP tests stay green (the MCP server still works)

### Phase 9 — Release

- [ ] Bump `packages/core/src/version.ts` and `packages/core/package.json` together — minor bump (new user-facing surface)
- [ ] CHANGELOG entry: lead with the worktree fix, the new CLI surface, and the deprecation notice for MCP-as-primary
- [ ] README updates: CLI gets pride of place; MCP gets a "Legacy" subsection
- [ ] Tag, push, let the release workflow ship

## Risks and mitigations

- **Risk:** Skill bloat — CLI commands take more flags than MCP tool calls, so the skill could become a wall of `relay foo --bar --baz` examples.
  - **Mitigation:** Lead each section with the *intent* (`When the user wants to start work…`), not the command. Examples should be the minimal form; advanced flags get a "see `relay task create --help`" pointer.
- **Risk:** Permission prompts annoy users who haven't allowlisted `relay`.
  - **Mitigation:** `relay init` offers to write the allowlist entry. The README gives a copy-pasteable one-liner. A misconfigured project costs one prompt to fix forever.
- **Risk:** Agents parse text output and break when formatting changes.
  - **Mitigation:** `--json` is the contract for parseable output. Default text output is for humans and is allowed to change.
- **Risk:** Two surfaces coexisting confuses agents — they might mix MCP tool calls and CLI invocations in the same session.
  - **Mitigation:** Skill explicitly says "use the CLI." Tool descriptions on the MCP server can be updated to add a deprecation hint. Both code paths call into `@relay/core`, so behavior is identical regardless.
- **Risk:** Scope creep — someone adds a new feature mid-migration that has to be implemented in both surfaces.
  - **Mitigation:** Keep this plan tight. New features land in the CLI; the MCP gets minimum-viable parity or skips it (with a release note).

## Definition of done

- All Phase 2–5 subcommands exist, are tested, and shell out cleanly with `--help`
- `skills/relay/SKILL.md` is rewritten and references no MCP tool by name in the primary flow sections
- A worktree integration test exists and passes
- `relay init` offers the allowlist entry; the printed next-steps lead with the CLI
- README and CHANGELOG updated; version bumped; tagged release shipped
- Manual smoke from a fresh worktree: `relay where` reports the worktree path; `relay task create --title X` writes to the worktree's `.relay/tasks/`; `relay task list` from the main checkout does **not** see that task

## Open questions for Daniel

1. **Subcommand naming:** `relay task list` vs `relay tasks list` (singular vs plural noun). Singular reads better next to a single-resource verb (`relay task get TKTB-001`). Default to singular unless you prefer plural.
2. **`--body-from-stdin` ergonomics:** the most natural way to pipe a long body in is `cat body.md | relay task create --title "..." --body-from-stdin`. Alternative is `--body @body.md`. Default to both — `--body-from-file <path>` for explicit, stdin for piping.
3. **Init allowlist behavior:** should `relay init` write the `Bash(relay *)` allowlist entry by default, or prompt? Default to prompting on the first run, with a `--allowlist` flag to skip the prompt.
4. **MCP deprecation timeline:** soft-deprecate now (skill stops mentioning it), hard-deprecate (`relay --mcp` prints a warning) in N+1, remove in N+2? Or never remove? Lean toward "soft-deprecate now, never remove" — the cost of carrying it is low and removal punishes users who haven't upgraded.

