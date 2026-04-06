/**
 * Category-based debug logging, gated by the DEBUG env var.
 *
 * Usage:
 *   const dbg = createDebug("terminal");
 *   dbg("spawn", { sessionId, cols, rows });
 *   dbg(() => `expensive ${computeThis()}`);  // lazy formatter
 *
 * Enable at run time:
 *   DEBUG=terminal,ws bun run dev      # specific categories
 *   DEBUG=* bun run dev                # all categories
 *
 * When a category is disabled, createDebug returns a no-op — zero cost at
 * call sites, including no string-building for lazy formatters.
 *
 * Writes to stderr (not stdout) to avoid interfering with pipes or the
 * term-debug CLI.
 */

const enabled = new Set(
  (process.env.DEBUG ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const wildcard = enabled.has("*");

type LazyMsg = string | (() => string);

const NOOP: DebugFn = () => {};

export type DebugFn = (msg: LazyMsg, data?: unknown) => void;

export function createDebug(category: string): DebugFn {
  if (!wildcard && !enabled.has(category)) return NOOP;
  return (msg, data) => {
    const text = typeof msg === "function" ? msg() : msg;
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const suffix = data !== undefined ? " " + JSON.stringify(data) : "";
    process.stderr.write(`[${ts}] ${category} ${text}${suffix}\n`);
  };
}

export function isDebugEnabled(category: string): boolean {
  return wildcard || enabled.has(category);
}
