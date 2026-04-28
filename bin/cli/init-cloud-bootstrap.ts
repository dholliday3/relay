/**
 * Adds a `SessionStart` hook to a project's `.claude/settings.json`
 * that auto-installs the relay CLI when it's missing.
 *
 * **Important caveat about cloud sessions.** Claude Code requires
 * explicit user approval before running hooks defined in committed
 * `.claude/settings.json` (the trust-on-first-use model that prevents
 * a malicious repo from silently executing arbitrary shell on clone).
 * That means in a *fresh* cloud sandbox where the user has never
 * approved this project before, the hook will silently NOT run, and
 * the agent will still hit `relay: command not found` on the first
 * Bash call.
 *
 * The actual cloud bootstrap mechanism that doesn't require approval
 * is in `skills/relay/SKILL.md` — the skill instructs the agent to
 * `command -v relay || install` before any relay command. Skills are
 * loaded into agent context without an approval gate, so the agent
 * just follows the instruction.
 *
 * Where this hook IS useful: local devcontainers, persistent dev
 * environments, and any setup where the user approves the hook once
 * and reuses the same workspace — there it auto-runs forever.
 *
 * Idempotent. The hook command is identified by an exact-match string
 * (RELAY_BOOTSTRAP_COMMAND). Re-running won't duplicate the entry,
 * and if the user has edited the command we leave their version alone.
 *
 * Used by `relay init --cloud-bootstrap`. Lives next to
 * init-allowlist.ts so the two related .claude/settings.json
 * mutations stay co-located.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * The shell command we wire into `SessionStart`. Single line so it
 * round-trips cleanly through JSON without escaping headaches.
 *
 * - `command -v relay` → fast-path no-op when the binary is already on
 *   PATH (the common local-dev case)
 * - `curl … install.sh | bash` → install at `latest` from GitHub
 *   Releases when missing
 *
 * We deliberately use `latest` rather than pinning a tag: this hook
 * lives in committed config, and pinning would mean every relay bump
 * requires a follow-up commit in every consuming project. The tradeoff
 * is supply-chain trust — install.sh is fetched from main on every
 * cold-start. Acceptable because relay is a development-time tool, not
 * runtime production code.
 */
export const RELAY_BOOTSTRAP_COMMAND =
  "command -v relay >/dev/null 2>&1 || curl -fsSL https://raw.githubusercontent.com/dholliday3/relay/main/scripts/install.sh | bash";

export type BootstrapAction = "added" | "already-present" | "created";

export interface BootstrapResult {
  action: BootstrapAction;
  file: string;
}

async function readJsonOrNull(path: string): Promise<unknown> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

interface HookEntry {
  type?: unknown;
  command?: unknown;
  [key: string]: unknown;
}

interface HookGroup {
  hooks?: unknown;
  [key: string]: unknown;
}

interface SettingsShape {
  hooks?: { SessionStart?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Walks the SessionStart array and returns true if any nested hook
 * entry already has our exact bootstrap command. The Claude Code hook
 * shape is `hooks.SessionStart[].hooks[]` — two levels of array — so we
 * recurse rather than assume a fixed depth.
 */
function hasBootstrapEntry(sessionStart: unknown): boolean {
  if (!Array.isArray(sessionStart)) return false;
  for (const group of sessionStart) {
    if (!group || typeof group !== "object") continue;
    const hooks = (group as HookGroup).hooks;
    if (!Array.isArray(hooks)) continue;
    for (const entry of hooks) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as HookEntry;
      if (e.type === "command" && e.command === RELAY_BOOTSTRAP_COMMAND) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Add a SessionStart hook to `.claude/settings.json` that bootstraps
 * relay when missing. Creates the file when absent. Preserves any
 * unrelated keys (permissions, other hook events, etc.) — only touches
 * `hooks.SessionStart`.
 */
export async function addRelayCloudBootstrap(
  baseDir: string,
): Promise<BootstrapResult> {
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

  const hooks =
    (existing.hooks && typeof existing.hooks === "object"
      ? (existing.hooks as { SessionStart?: unknown; [key: string]: unknown })
      : {}) ?? {};

  if (hasBootstrapEntry(hooks.SessionStart)) {
    return { action: "already-present", file: settingsPath };
  }

  const sessionStart: unknown[] = Array.isArray(hooks.SessionStart)
    ? [...hooks.SessionStart]
    : [];

  sessionStart.push({
    hooks: [
      {
        type: "command",
        command: RELAY_BOOTSTRAP_COMMAND,
      },
    ],
  });

  const next: SettingsShape = {
    ...existing,
    hooks: {
      ...hooks,
      SessionStart: sessionStart,
    },
  };

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return { action: created ? "created" : "added", file: settingsPath };
}
