import { readdir, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { getConfig } from "./config.js";

const ID_SUFFIX_LENGTH = 5;
// Crockford-style base32 (lowercase, no i/l/o/u) — visually unambiguous,
// case-insensitive grep-friendly, and 5 chars gives ~33M values which makes
// cross-branch collisions vanishingly unlikely without coordination.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const MAX_RETRIES = 10;

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] & 31];
  return out;
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

export function formatId(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

export function formatFilename(id: string, title: string): string {
  const slug = slugify(title);
  return slug ? `${id}-${slug}.md` : `${id}.md`;
}

async function existingIds(dir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(dir);
    const ids = new Set<string>();
    for (const name of entries) {
      const m = name.match(/^([A-Z]+-[0-9a-z]+)/);
      if (m) ids.add(m[1]);
    }
    return ids;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw err;
  }
}

export async function nextIdForDir(
  dir: string,
  prefix: string,
): Promise<{ id: string; filename: (title: string) => string }> {
  await mkdir(dir, { recursive: true });
  const taken = await existingIds(dir);

  let id = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    id = formatId(prefix, randomSuffix(ID_SUFFIX_LENGTH));
    if (!taken.has(id)) {
      return {
        id,
        filename: (title: string) => formatFilename(id, title),
      };
    }
  }
  throw new Error(
    `Could not allocate a unique ${prefix} id after ${MAX_RETRIES} attempts`,
  );
}

export async function nextId(
  dir: string,
): Promise<{ id: string; filename: (title: string) => string }> {
  const config = await getConfig(dirname(dir));
  return nextIdForDir(dir, config.prefix);
}
