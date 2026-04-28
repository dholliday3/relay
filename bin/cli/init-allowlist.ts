/**
 * Adds a `Bash(relay *)` permission entry to a project's
 * `.claude/settings.json` so Claude Code stops prompting for every
 * relay invocation. Idempotent: if the entry is already present, this
 * is a no-op.
 *
 * Used by `relay init` when the user passes `--allowlist` (or accepts
 * the interactive prompt). Separated from init.ts so the policy
 * (when to write) and the mechanics (how to merge into existing JSON
 * without clobbering other settings) stay independent and testable.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const ALLOWLIST_ENTRY = "Bash(relay *)";

export type AllowlistAction = "added" | "already-present" | "created";

export interface AllowlistResult {
  /** What happened to the file. */
  action: AllowlistAction;
  /** Absolute path to the settings.json that was written or read. */
  file: string;
}

/**
 * Read JSON safely. Returns null when the file doesn't exist; throws
 * when it exists but is malformed (caller should surface that as a
 * user-fixable error rather than silently overwriting their config).
 */
async function readJsonOrNull(path: string): Promise<unknown> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

interface SettingsShape {
  permissions?: { allow?: unknown };
  [key: string]: unknown;
}

/**
 * Add `Bash(relay *)` to `.claude/settings.json` at the given baseDir.
 * Creates the file if absent. Preserves any unrelated keys; only
 * touches `permissions.allow`.
 */
export async function addRelayAllowlist(
  baseDir: string,
): Promise<AllowlistResult> {
  const settingsPath = join(baseDir, ".claude", "settings.json");

  let existing: SettingsShape = {};
  let created = false;
  const parsed = await readJsonOrNull(settingsPath);

  if (parsed === null) {
    created = true;
  } else if (typeof parsed === "object" && !Array.isArray(parsed)) {
    existing = parsed as SettingsShape;
  } else {
    throw new Error(
      `${settingsPath} is not a JSON object. Refusing to overwrite.`,
    );
  }

  const permissions =
    (existing.permissions && typeof existing.permissions === "object"
      ? (existing.permissions as { allow?: unknown })
      : {}) ?? {};
  const rawAllow = permissions.allow;
  const allow: string[] = Array.isArray(rawAllow)
    ? rawAllow.filter((v): v is string => typeof v === "string")
    : [];

  if (allow.includes(ALLOWLIST_ENTRY)) {
    return { action: "already-present", file: settingsPath };
  }

  allow.push(ALLOWLIST_ENTRY);

  const next: SettingsShape = {
    ...existing,
    permissions: {
      ...(existing.permissions as object | undefined),
      allow,
    },
  };

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return { action: created ? "created" : "added", file: settingsPath };
}
