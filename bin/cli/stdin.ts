/**
 * Shared stdin helpers used by `task`, `plan`, and `doc` handlers when a
 * user passes `--body-from-stdin`.
 *
 * History: an earlier version used `for await of process.stdin` (the
 * Node-compatible pattern) and silently returned empty when invoked via
 * `bin/relay.ts` — likely a Bun runtime quirk with the top-level imports
 * + dispatch shape. Standalone Bun scripts using the same pattern read
 * stdin fine; only the relay entry point was affected. The symptom was
 * silent data loss: `relay task update X --body-from-stdin <<EOF…` was
 * accepted, "Updated X" was printed, and the existing body was wiped to
 * an empty string. Switching to `Bun.stdin.text()` reliably drains piped
 * content; an additional empty-stdin guard refuses to silently set
 * `body=""` and tells the user how to do that explicitly.
 */

/**
 * Drain piped stdin to a string. Uses Bun's native reader because
 * `for await of process.stdin` returned empty in this entry context.
 */
export async function readStdinAll(): Promise<string> {
  return Bun.stdin.text();
}

/**
 * Thrown when `--body-from-stdin` was set but stdin yielded no bytes.
 * We refuse to silently treat that as `body=""` because doing so would
 * (a) overwrite an existing body on `update` and (b) create an empty
 * task on `create`. Both are silent data loss. The user almost always
 * meant to pipe content; better to fail loudly.
 */
export class EmptyStdinError extends Error {
  constructor() {
    super(
      "--body-from-stdin was set but stdin had no content. " +
        'Did you forget to pipe? Use `--body ""` to set an explicit empty body.',
    );
    this.name = "EmptyStdinError";
  }
}
