import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "./config.js";
import { withLock } from "./lock.js";
import { atomicWriteFile } from "./atomic.js";

const COUNTER_FILENAME = ".counter";

function counterPath(dir: string): string {
  return join(dir, COUNTER_FILENAME);
}

async function readCounter(dir: string): Promise<number> {
  try {
    const raw = await readFile(counterPath(dir), "utf-8");
    const num = parseInt(raw.trim(), 10);
    return Number.isNaN(num) ? 0 : num;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw err;
  }
}

async function writeCounter(dir: string, value: number): Promise<void> {
  await mkdir(dir, { recursive: true });
  await atomicWriteFile(counterPath(dir), String(value));
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length <= 50) return slug;

  const truncated = slug.slice(0, 50);
  const lastHyphen = truncated.lastIndexOf("-");
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}

export function formatId(prefix: string, num: number): string {
  const padded = String(num).padStart(3, "0");
  return `${prefix}-${padded}`;
}

export function formatFilename(id: string, title: string): string {
  const slug = slugify(title);
  return slug ? `${id}-${slug}.md` : `${id}.md`;
}

export async function nextIdForDir(
  dir: string,
  prefix: string,
): Promise<{ id: string; number: number; filename: (title: string) => string }> {
  return withLock(counterPath(dir), async () => {
    const current = await readCounter(dir);
    const next = current + 1;
    await writeCounter(dir, next);

    const id = formatId(prefix, next);
    return {
      id,
      number: next,
      filename: (title: string) => formatFilename(id, title),
    };
  });
}

export async function nextId(
  dir: string,
): Promise<{ id: string; number: number; filename: (title: string) => string }> {
  const config = await getConfig(dir);
  return nextIdForDir(dir, config.prefix);
}
