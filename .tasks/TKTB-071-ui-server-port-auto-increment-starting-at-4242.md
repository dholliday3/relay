---
id: TKTB-071
title: UI server port auto-increment starting at 4242
status: done
priority: medium
tags:
  - phase-0
  - ui
  - server
  - packaging
project: ticketbook
assignee: claude-opus
created: '2026-04-11T07:05:51.605Z'
updated: '2026-04-11T07:22:42.699Z'
---

Replace the current "bind port 0, let OS pick a random port" behavior with deterministic auto-increment starting at 4242. Makes the multi-repo UX predictable — ports resolve in launch order instead of giving you `localhost:54987`-type randoms.

Part of PLAN-005 Phase 0. Independent of Tasks A/B/C/E.

## Acceptance
- `bun bin/ticketbook.ts` in a fresh terminal binds to 4242 (or next free) ✅
- A second `bun bin/ticketbook.ts` in another terminal binds to the next free port and log line says so ✅
- Explicit `bun bin/ticketbook.ts --port 4242` when 4242 is held errors out without retrying ✅
- All tests pass (`bun test`) ✅ 318/318
- `bun run typecheck` clean ✅

<!-- agent-notes -->
## Debrief (claude-opus)

**Implementation:**
- `packages/server/src/port-bind.ts` — new file. Exports `bindWithIncrementUsing<S>(tryBind, startPort, maxTries)` which takes a *callback* rather than a Bun.serve options object. Passing a closure preserves the caller's narrow WebSocket data types — Bun's `Serve.Options<WsData>` is a discriminated union that falls apart under `Omit<…, "port">`. Also exports `isAddressInUseError(err)` which matches EADDRINUSE across the three known Bun error message shapes.
- `packages/server/src/index.ts` — added `autoIncrement?: boolean` to `ServerConfig`, added `triedPorts: number[]` to `ServerHandle`, wrapped the Bun.serve call in a local `tryServe(p)` closure so generic inference flows through. The bind path is now a ternary: `autoIncrement ? bindWithIncrementUsing(tryServe, port, 100) : { server: tryServe(port), port, triedPorts: [] }`. Used a sanity cap constant `PORT_AUTO_INCREMENT_MAX_TRIES = 100`.
- `bin/ticketbook.ts` — default port flipped from `0` to `4242`, pass `autoIncrement: args.port == null` so explicit `--port` disables retry. Log line now branches on `triedPorts.length`: if auto-increment happened, it appends `(auto-selected; 4242, 4243 in use)`. Also updated the `--help` blurb.

**Tests added:**
- `packages/server/src/port-bind.test.ts` — 11 tests using real `Bun.serve()` listeners (no mocks) in the 14242+ range to avoid colliding with dev servers. Covers: binds to startPort when free; increments past one held port; skips multiple held ports in order; throws descriptive error after N attempts; does not catch non-EADDRINUSE errors; explicit-path propagates EADDRINUSE without retry; plus 5 tests for `isAddressInUseError` covering all three Bun message shapes and non-Error values.

**Acceptance validation (end-to-end):**
- Started two real ticketbook servers concurrently in temp dirs. With 4242 and 4243 already held in the environment, server 1 landed on 4244 with log `Ticketbook server listening on http://localhost:4244 (auto-selected; 4242, 4243 in use)`, server 2 landed on 4245 with log `(auto-selected; 4242, 4243, 4244 in use)`.
- Ran `ticketbook --port 4244` while 4244 was held — exited with `error: Failed to start server. Is port 4244 in use?` and `code: "EADDRINUSE"`, no retry.

**Design note:** I chose the callback-based `bindWithIncrementUsing<S>(tryBind, ...)` over the ticket's proposed options-based `bindWithIncrement(startPort, maxTries, serveOptions)` because Bun's type union for `Serve.Options<WsData>` does not round-trip through `Omit<..., "port">` — the typecheck failed when I tried the direct approach and the callback form is both simpler and preserves WebSocket data typing cleanly.

**Out of scope (per ticket):** no port persistence (Task F backlog), dev server port untouched, default stays at 4242.
