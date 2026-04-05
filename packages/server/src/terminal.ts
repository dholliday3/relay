import { resolve, dirname } from "node:path";
import { Subprocess } from "bun";

interface PtySession {
  proc: Subprocess;
  alive: boolean;
  onData: ((data: string) => void) | null;
  onExit: ((code: number) => void) | null;
}

const sessions = new Map<string, PtySession>();

const WORKER_PATH = resolve(dirname(import.meta.path), "pty-worker.py");

export function createPtySession(sessionId: string, cwd: string, cols = 80, rows = 24): PtySession {
  const existing = sessions.get(sessionId);
  if (existing?.alive) return existing;

  const proc = Bun.spawn(["python3", WORKER_PATH], {
    cwd,
    env: {
      ...process.env,
      PTY_CWD: cwd,
      PTY_COLS: String(cols),
      PTY_ROWS: String(rows),
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });

  const session: PtySession = { proc, alive: true, onData: null, onExit: null };
  sessions.set(sessionId, session);

  // Read stdout lines (JSON messages from worker)
  const reader = proc.stdout.getReader();
  let buffer = "";

  async function readLoop() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += new TextDecoder().decode(value);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "output" && session.onData) {
              session.onData(msg.data);
            } else if (msg.type === "exit") {
              session.alive = false;
              sessions.delete(sessionId);
              session.onExit?.(msg.code ?? 0);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      // stream closed
    }
    session.alive = false;
    sessions.delete(sessionId);
  }

  readLoop();

  return session;
}

function writeToStdin(session: PtySession, msg: string): void {
  const stdin = session.proc.stdin;
  if (stdin && typeof stdin === "object" && "write" in stdin) {
    (stdin as { write: (data: string) => void }).write(msg);
  }
}

export function writeToPty(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session?.alive) return;
  writeToStdin(session, JSON.stringify({ type: "input", data }) + "\n");
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (!session?.alive) return;
  writeToStdin(session, JSON.stringify({ type: "resize", cols, rows }) + "\n");
}

export function getPtySession(sessionId: string): PtySession | undefined {
  return sessions.get(sessionId);
}

export function destroyPtySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.alive = false;
    try { session.proc.kill(); } catch { /* already dead */ }
    sessions.delete(sessionId);
  }
}

export function destroyAllSessions(): void {
  for (const [id] of sessions) {
    destroyPtySession(id);
  }
}
