import { open, unlink, stat } from "node:fs/promises";

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_RETRY_BASE_MS = 50;

function jitter(base: number): number {
  return base + Math.random() * base;
}

/**
 * Advisory file lock. Creates a `.lock` file with exclusive mode (`wx`).
 * Stale locks (older than 30s) are automatically cleaned up.
 * Retries with exponential backoff + jitter until timeout.
 */
export async function withLock<T>(
  targetPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = targetPath + ".lock";
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let attempt = 0;

  while (true) {
    try {
      // Exclusive create — fails with EEXIST if lock already held
      const fd = await open(lockPath, "wx");
      await fd.close();
      break;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Check for stale lock
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        // Lock was released between our check — retry immediately
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Lock timeout: could not acquire ${lockPath} within ${LOCK_TIMEOUT_MS}ms`,
        );
      }

      const delay = jitter(LOCK_RETRY_BASE_MS * 2 ** Math.min(attempt, 6));
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }

  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}
