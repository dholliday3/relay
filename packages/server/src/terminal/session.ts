/**
 * Terminal session abstraction.
 *
 * This is the seam between the WebSocket/REST layer and the concrete PTY
 * backend. Today there is one implementation (BunPtyHeadlessBackend — Bun.spawn
 * PTY with a server-side @xterm/headless mirror for state snapshots). Future
 * implementations (libghostty, native) replace the backend module without
 * touching anything above this interface.
 *
 * Design notes:
 * - `serialize()` returns the terminal state as escape sequences — writing the
 *   result into a fresh xterm reproduces the visible buffer at the current
 *   dimensions. Used for replay on reconnect.
 * - `onEvent` is the structured event stream for shell integration (OSC 133 /
 *   633). No events are emitted in PR 1; the shape is defined now so the
 *   consumer side (SessionRecord, UI) can be built against a stable API.
 * - Listener methods return a dispose function. Multiple listeners allowed.
 */

export interface TerminalSession {
  readonly id: string;
  readonly alive: boolean;
  readonly cwd: string;

  /** Write raw input bytes to the PTY. */
  write(data: string): void;

  /** Resize the PTY and its state-mirror terminal. */
  resize(cols: number, rows: number): void;

  /** Snapshot the current terminal state as escape sequences for replay. */
  serialize(): string;

  /** Subscribe to raw PTY output. Returns a dispose function. */
  onData(cb: (data: string) => void): () => void;

  /** Subscribe to structured session events. Returns a dispose function. */
  onEvent(cb: (ev: SessionEvent) => void): () => void;

  /** Subscribe to the PTY exit. Returns a dispose function. */
  onExit(cb: (code: number) => void): () => void;

  /**
   * Mark the session as detached from any active client connection.
   * Starts the grace timer — if no reattach() call arrives before it
   * expires, the session is destroyed.
   */
  detach(): void;

  /**
   * Cancel the grace timer because a new client is reconnecting to this
   * session. Idempotent if no grace timer is running.
   */
  reattach(): void;

  /** Kill the PTY, release resources, and drop all listeners. */
  destroy(): void;
}

/**
 * Structured events emitted by the terminal session. Populated by shell
 * integration handlers in a future PR; for now the type is defined so
 * consumers can code against the stable shape.
 */
export type SessionEvent =
  | { type: "commandStart"; command: string; cwd: string; at: number }
  | { type: "commandEnd"; exitCode: number; at: number }
  | { type: "cwdChanged"; cwd: string; at: number };

export interface TerminalSessionCreateOptions {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
  scrollback: number;
}

export interface TerminalSessionBackend {
  create(opts: TerminalSessionCreateOptions): TerminalSession;
  get(id: string): TerminalSession | undefined;
  list(): string[];
  destroyAll(): void;
}
