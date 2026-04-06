/**
 * TerminalSession backend using Bun.spawn for the PTY and @xterm/headless
 * for server-side state.
 *
 * Each session owns:
 *   - A Bun.spawn subprocess with a terminal attached (the real PTY)
 *   - A headless xterm.js Terminal instance (mirror of what the client sees)
 *   - A SerializeAddon that can snapshot the headless terminal's state as
 *     a single string of escape sequences
 *
 * PTY output flow:
 *   PTY.data → headless.write(data) → forward to every onData listener
 *
 * Reconnect flow (reattach):
 *   session.reattach() → cancel grace timer
 *   session.resize(cols, rows) → resize both the real PTY and the headless
 *   session.serialize() → get the headless buffer as escape sequences
 *   (caller sends the result as a "replay" WebSocket message)
 *
 * The headless terminal reflows correctly on resize because xterm.js's
 * buffer rewraps internally. SerializeAddon emits *logical* lines, not the
 * visual wrapping, so even dimension mismatches between snapshot-time and
 * replay-time produce the correct result on the client.
 */

import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import { deleteTerminalTab } from "../db.js";
import { createDebug } from "../debug.js";
import type {
  SessionEvent,
  TerminalSession,
  TerminalSessionBackend,
  TerminalSessionCreateOptions,
} from "./session.js";

const dbg = createDebug("terminal");

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

function getShell(): string {
  return process.env.SHELL || "/bin/zsh";
}

class BunPtyHeadlessSession implements TerminalSession {
  readonly id: string;
  readonly cwd: string;
  alive = true;

  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private readonly headless: Terminal;
  private readonly serializer: SerializeAddon;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly eventListeners = new Set<(ev: SessionEvent) => void>();
  private readonly exitListeners = new Set<(code: number) => void>();
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onFullyDestroyed: () => void;

  constructor(opts: TerminalSessionCreateOptions, onFullyDestroyed: () => void) {
    this.id = opts.id;
    this.cwd = opts.cwd;
    this.onFullyDestroyed = onFullyDestroyed;

    this.headless = new Terminal({
      cols: opts.cols,
      rows: opts.rows,
      scrollback: opts.scrollback,
      allowProposedApi: true,
    });
    this.serializer = new SerializeAddon();
    this.headless.loadAddon(this.serializer);

    const shell = getShell();
    dbg("spawn", { sessionId: this.id, cwd: opts.cwd, cols: opts.cols, rows: opts.rows, scrollback: opts.scrollback, shell });

    this.proc = Bun.spawn([shell, "-l"], {
      cwd: opts.cwd,
      env: { ...process.env, TERM: "xterm-256color" },
      terminal: {
        cols: opts.cols,
        rows: opts.rows,
        data: (_terminal: unknown, data: Uint8Array) => {
          const str = new TextDecoder().decode(data);
          // Mirror into the headless terminal so serialize() reflects state
          this.headless.write(str);
          // Forward to any active listeners (WS connections)
          for (const cb of this.dataListeners) cb(str);
        },
      },
      onExit: (_proc, code) => {
        dbg("ptyExit", { sessionId: this.id, code });
        this.alive = false;
        const exitCode = typeof code === "number" ? code : 0;
        for (const cb of this.exitListeners) cb(exitCode);
      },
    });
  }

  write(data: string): void {
    if (!this.alive || !this.proc?.terminal) return;
    this.proc.terminal.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.alive) return;
    // Resize both in lock-step so serialize() matches the PTY's idea of size
    try { this.proc?.terminal?.resize(cols, rows); } catch { /* already dead */ }
    try { this.headless.resize(cols, rows); } catch { /* shouldn't fail */ }
  }

  serialize(): string {
    return this.serializer.serialize();
  }

  onData(cb: (data: string) => void): () => void {
    this.dataListeners.add(cb);
    return () => { this.dataListeners.delete(cb); };
  }

  onEvent(cb: (ev: SessionEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => { this.eventListeners.delete(cb); };
  }

  onExit(cb: (code: number) => void): () => void {
    this.exitListeners.add(cb);
    return () => { this.exitListeners.delete(cb); };
  }

  detach(): void {
    if (!this.alive) return;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    dbg("detach: grace timer started", { sessionId: this.id, graceMs: GRACE_PERIOD_MS });
    this.disconnectTimer = setTimeout(() => {
      dbg("graceExpired", { sessionId: this.id });
      this.destroy();
    }, GRACE_PERIOD_MS);
  }

  reattach(): void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      dbg("cancelGrace", { sessionId: this.id });
    }
  }

  destroy(): void {
    dbg("destroy", { sessionId: this.id });
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.alive = false;
    this.dataListeners.clear();
    this.eventListeners.clear();
    // Fire exit listeners with code 0 so anything waiting for exit wakes up
    for (const cb of this.exitListeners) {
      try { cb(0); } catch { /* ignore */ }
    }
    this.exitListeners.clear();
    try { this.proc?.terminal?.close(); } catch { /* already dead */ }
    try { this.proc?.kill(); } catch { /* already dead */ }
    try { this.headless.dispose(); } catch { /* already disposed */ }
    this.onFullyDestroyed();
  }
}

export class BunPtyHeadlessBackend implements TerminalSessionBackend {
  private readonly sessions = new Map<string, BunPtyHeadlessSession>();

  constructor(private readonly dataDir: string) {}

  create(opts: TerminalSessionCreateOptions): TerminalSession {
    const existing = this.sessions.get(opts.id);
    if (existing?.alive) return existing;

    const session = new BunPtyHeadlessSession(opts, () => {
      this.sessions.delete(opts.id);
      // Remove from DB when fully destroyed (grace expired or explicit destroy)
      deleteTerminalTab(this.dataDir, opts.id);
    });
    this.sessions.set(opts.id, session);
    return session;
  }

  get(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  list(): string[] {
    return [...this.sessions.entries()]
      .filter(([, s]) => s.alive)
      .map(([id]) => id);
  }

  destroyAll(): void {
    for (const session of [...this.sessions.values()]) {
      session.destroy();
    }
  }
}
