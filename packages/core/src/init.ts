import { join, dirname, resolve, basename } from "node:path";
import {
  stat,
  mkdir,
  writeFile,
  readFile,
} from "node:fs/promises";

/**
 * Options for scaffolding a relay installation into a target project.
 */
export interface InitRelayOptions {
  /** Directory to initialize relay in (will contain .relay/). */
  baseDir: string;
  /**
   * Path to `skills/relay/SKILL.md` inside the relay package.
   * The bin script computes this from its own location and passes it in.
   * If the file does not exist, skill installation is skipped with a warning.
   */
  skillSourcePath?: string;
}

/**
 * Result summary of an init run. Fields indicate what was newly created
 * vs. left alone (init is idempotent — it never overwrites user files).
 */
export interface InitRelayResult {
  relayDir: string;
  tasksDir: string;
  plansDir: string;
  docsDir: string;
  createdRelayDir: boolean;
  wroteConfig: boolean;
  wroteSkill: boolean;
  wroteMcpConfig: boolean;
  mergedMcpConfig: boolean;
  /**
   * True if `.claude/settings.json` was newly created for the SessionStart
   * install hook. Always false in dev mode (relay source repo doesn't need
   * the hook — it runs `bun bin/relay.ts` directly, no binary required).
   */
  wroteSessionStartHook: boolean;
  /** True if an existing `.claude/settings.json` had the hook merged in. */
  mergedSessionStartHook: boolean;
  updatedGitignore: boolean;
  /**
   * True when init detected it was running against the relay source
   * repo itself (via package.json name + bin/relay.ts presence) and
   * wrote a dev-mode MCP command that runs the bin script directly instead
   * of relying on `bunx relay` (which won't resolve while the package
   * is `"private": true`).
   */
  devMode: boolean;
}

/**
 * Published-mode MCP command. Used when init scaffolds a foreign repo that
 * has `relay` available on its PATH (via a future binary install or an
 * eventual npm publish). Until the package is actually published, this
 * command will fail — so init auto-detects dev mode (running against the
 * relay source repo itself) and swaps to DEV_MCP_ENTRY below.
 */
const PUBLISHED_MCP_ENTRY = {
  command: "relay",
  args: ["--mcp"],
} as const;

/**
 * Dev-mode MCP command. Used when init detects it's running against the
 * relay source repo. Paths are relative to the project root (which
 * Claude Code uses as cwd when auto-loading .mcp.json), so this works for
 * anyone who clones the repo without any additional setup.
 */
const DEV_MCP_ENTRY = {
  command: "bun",
  args: ["bin/relay.ts", "--mcp"],
} as const;

/**
 * URL of the install script used by the SessionStart hook to self-install
 * relay in a fresh environment (e.g. Claude Code cloud sandboxes). The
 * script is idempotent and SHA-verifies the downloaded binary.
 */
export const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/dholliday3/relay/main/scripts/install.sh";

/**
 * Shell snippet wired into Claude Code's SessionStart hook. Fast no-op when
 * `relay` is already on PATH; otherwise pipes install.sh to bash. Trailing
 * `|| true` prevents a failed install (e.g. sandbox with no network egress)
 * from aborting the session — the agent will still boot and can fall back
 * to the manual install instructions in CLAUDE.md / AGENTS.md.
 */
export const SESSION_START_HOOK_COMMAND = `command -v relay >/dev/null 2>&1 || curl -fsSL ${INSTALL_SCRIPT_URL} | bash || true`;

/**
 * Detect whether `baseDir` is the relay source repo itself. Returns
 * true only if both signals line up:
 *   - package.json exists and its `name` field is "relay"
 *   - bin/relay.ts exists (the entry point that --mcp mode relies on)
 *
 * Both checks together prevent false positives (e.g., a user's unrelated
 * project happens to have a package named "relay" in their deps).
 */
async function detectRelaySourceRepo(baseDir: string): Promise<boolean> {
  try {
    const pkgText = await readFile(join(baseDir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgText);
    if (pkg?.name !== "relay") return false;
  } catch {
    return false;
  }
  return pathExists(join(baseDir, "bin", "relay.ts"));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string): Promise<boolean> {
  if (await pathExists(p)) return false;
  await mkdir(p, { recursive: true });
  return true;
}

/**
 * Merge the relay MCP server entry into a `.mcp.json` file.
 * Returns { wrote, merged }:
 *   - wrote=true if the file was newly created
 *   - merged=true if the file existed and we added (or already had) the entry
 */
async function writeMcpConfig(
  mcpPath: string,
  entry: { command: string; args: readonly string[] },
): Promise<{ wrote: boolean; merged: boolean }> {
  if (!(await pathExists(mcpPath))) {
    const content = {
      mcpServers: {
        relay: entry,
      },
    };
    await writeFile(mcpPath, JSON.stringify(content, null, 2) + "\n", "utf-8");
    return { wrote: true, merged: false };
  }

  // Parse and merge, preserving existing entries.
  const raw = await readFile(mcpPath, "utf-8");
  let parsed: { mcpServers?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed .mcp.json — don't clobber the user's file. Leave it alone.
    return { wrote: false, merged: false };
  }

  if (!parsed.mcpServers) parsed.mcpServers = {};
  if (parsed.mcpServers.relay) {
    // Already configured — leave it alone (user may have customized).
    return { wrote: false, merged: false };
  }

  parsed.mcpServers.relay = entry;
  await writeFile(mcpPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  return { wrote: false, merged: true };
}

/**
 * Merge a SessionStart hook entry into `.claude/settings.json`. The hook
 * installs the `relay` binary on first session start if it's not already
 * on PATH — makes the repo self-bootstrapping when cloned into a fresh
 * environment like Claude Code cloud. Returns { wrote, merged }:
 *   - wrote=true if `.claude/settings.json` was newly created
 *   - merged=true if the file existed and we added the hook
 *   - both false if the exact command is already present, or the file is
 *     malformed (we never clobber user files)
 */
async function writeSessionStartHook(
  settingsPath: string,
  command: string,
): Promise<{ wrote: boolean; merged: boolean }> {
  const hookEntry = {
    hooks: [{ type: "command", command }],
  };

  if (!(await pathExists(settingsPath))) {
    const content = { hooks: { SessionStart: [hookEntry] } };
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify(content, null, 2) + "\n",
      "utf-8",
    );
    return { wrote: true, merged: false };
  }

  const raw = await readFile(settingsPath, "utf-8");
  let parsed: { hooks?: { SessionStart?: unknown[] } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed settings.json — leave it alone.
    return { wrote: false, merged: false };
  }

  if (!parsed.hooks) parsed.hooks = {};
  if (!Array.isArray(parsed.hooks.SessionStart)) {
    parsed.hooks.SessionStart = [];
  }

  // If the exact command is already present anywhere in SessionStart, bail.
  // Users may have customized the entry (different matcher, different flags);
  // we only care that the install line itself isn't duplicated.
  const alreadyPresent = parsed.hooks.SessionStart.some((group) => {
    if (!group || typeof group !== "object") return false;
    const hooks = (group as { hooks?: unknown }).hooks;
    if (!Array.isArray(hooks)) return false;
    return hooks.some(
      (h) =>
        h &&
        typeof h === "object" &&
        (h as { command?: unknown }).command === command,
    );
  });
  if (alreadyPresent) return { wrote: false, merged: false };

  parsed.hooks.SessionStart.push(hookEntry);
  await writeFile(
    settingsPath,
    JSON.stringify(parsed, null, 2) + "\n",
    "utf-8",
  );
  return { wrote: false, merged: true };
}

async function writeSkillFile(
  skillSourcePath: string,
  targetPath: string,
): Promise<boolean> {
  if (await pathExists(targetPath)) return false;
  await mkdir(dirname(targetPath), { recursive: true });
  // readFile + writeFile instead of copyFile — works for both real
  // filesystem paths (dev mode) and Bun's $bunfs/ virtual paths (compiled
  // binary). Bun's docs explicitly support Bun.file()/readFile() on
  // embedded assets; copyFile is undocumented on virtual paths.
  const content = await readFile(skillSourcePath);
  await writeFile(targetPath, content);
  return true;
}

async function updateGitignore(
  baseDir: string,
  patterns: string[],
): Promise<boolean> {
  const gitignorePath = join(baseDir, ".gitignore");
  let existing = "";
  let changed = false;
  try {
    existing = await readFile(gitignorePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  for (const pattern of patterns) {
    if (!existing.includes(pattern)) {
      const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
      existing += `${sep}${pattern}\n`;
      changed = true;
    }
  }

  if (changed) {
    await writeFile(gitignorePath, existing, "utf-8");
  }
  return changed;
}

/**
 * Scaffold a relay installation into a target project.
 *
 * Creates (idempotently — existing files are never overwritten):
 *   - .relay/ root with tasks/, plans/, docs/ subdirectories
 *   - config.yaml at .relay/config.yaml
 *   - .counter files in each subdirectory
 *   - .claude/skills/relay/SKILL.md (Claude Code skill discovery)
 *   - .agents/skills/relay/SKILL.md (Codex skill discovery)
 *   - .mcp.json (or merges a relay entry into an existing one)
 *   - .gitignore entries for .relay/{tasks,plans,docs}/.archive/
 *
 * Agent instructions are a separate concern — the new `runOnboard` in
 * ./onboard.ts writes a versioned, marker-wrapped section into CLAUDE.md or
 * AGENTS.md. Callers should invoke `relay onboard` as a follow-up step
 * (the CLI's `printInitSummary` advertises this).
 */
export async function initRelay(
  options: InitRelayOptions,
): Promise<InitRelayResult> {
  const baseDir = resolve(options.baseDir);
  const relayDir = join(baseDir, ".relay");
  const tasksDir = join(relayDir, "tasks");
  const tasksArchiveDir = join(tasksDir, ".archive");
  const plansDir = join(relayDir, "plans");
  const plansArchiveDir = join(plansDir, ".archive");
  const docsDir = join(relayDir, "docs");
  const docsArchiveDir = join(docsDir, ".archive");

  const createdRelayDir = !(await pathExists(relayDir));

  await ensureDir(tasksArchiveDir);
  await ensureDir(plansArchiveDir);
  await ensureDir(docsArchiveDir);

  // config.yaml — lives at .relay/config.yaml (governs all primitives).
  // On first init we auto-populate `name` with the basename of the target
  // directory. It's used by the MCP server to give each instance a per-project
  // identity (`relay-<name>`) so multi-repo setups are distinguishable in
  // `claude mcp list` and error logs. Existing configs are left alone — the
  // MCP server tolerates a missing `name` field and falls back to `relay`.
  let wroteConfig = false;
  const cfgPath = join(relayDir, "config.yaml");
  if (!(await pathExists(cfgPath))) {
    const projectName = basename(baseDir);
    await writeFile(
      cfgPath,
      `name: "${projectName}"\nprefix: TASK\nplanPrefix: PLAN\ndocPrefix: DOC\ndeleteMode: archive\nworktreeMode: local\n`,
      "utf-8",
    );
    wroteConfig = true;
  }

  // .counter files
  for (const dir of [tasksDir, plansDir, docsDir]) {
    const counterPath = join(dir, ".counter");
    if (!(await pathExists(counterPath))) {
      await writeFile(counterPath, "0", "utf-8");
    }
  }

  // .gitignore updates
  const updatedGitignore = await updateGitignore(baseDir, [
    ".relay/tasks/.archive/",
    ".relay/plans/.archive/",
    ".relay/docs/.archive/",
  ]);

  // Skill files — copied to both Claude and Codex discovery paths.
  // We deliberately copy twice (rather than symlink) so the project works on
  // Windows and so the two files can diverge if the user edits one.
  let wroteSkill = false;
  if (options.skillSourcePath && (await pathExists(options.skillSourcePath))) {
    const claudeSkillPath = join(
      baseDir,
      ".claude",
      "skills",
      "relay",
      "SKILL.md",
    );
    const codexSkillPath = join(
      baseDir,
      ".agents",
      "skills",
      "relay",
      "SKILL.md",
    );
    const claudeWrote = await writeSkillFile(
      options.skillSourcePath,
      claudeSkillPath,
    );
    const codexWrote = await writeSkillFile(
      options.skillSourcePath,
      codexSkillPath,
    );
    wroteSkill = claudeWrote || codexWrote;
  }

  // Detect whether we're scaffolding relay against itself (dogfooding)
  // or against a foreign repo. Dev mode rewrites the MCP command so it runs
  // the local bin script directly — `bunx relay` won't resolve while
  // the package is still `"private": true`.
  const devMode = await detectRelaySourceRepo(baseDir);
  const mcpEntry = devMode ? DEV_MCP_ENTRY : PUBLISHED_MCP_ENTRY;

  // .mcp.json — project-level MCP config Claude Code auto-loads.
  const mcpResult = await writeMcpConfig(join(baseDir, ".mcp.json"), mcpEntry);

  // .claude/settings.json SessionStart hook — self-installs the `relay`
  // binary when the repo is cloned into a fresh environment (Claude Code
  // cloud, a new laptop, etc). Skipped in dev mode because the relay
  // source repo runs via `bun bin/relay.ts` and doesn't need the binary.
  const hookResult = devMode
    ? { wrote: false, merged: false }
    : await writeSessionStartHook(
        join(baseDir, ".claude", "settings.json"),
        SESSION_START_HOOK_COMMAND,
      );

  return {
    relayDir,
    tasksDir,
    plansDir,
    docsDir,
    createdRelayDir,
    wroteConfig,
    wroteSkill,
    wroteMcpConfig: mcpResult.wrote,
    mergedMcpConfig: mcpResult.merged,
    wroteSessionStartHook: hookResult.wrote,
    mergedSessionStartHook: hookResult.merged,
    updatedGitignore,
    devMode,
  };
}

/**
 * Returns the Codex TOML snippet users need to paste into ~/.codex/config.toml
 * to register the relay MCP server. Codex doesn't support project-scoped
 * MCP config without a trusted-workspace flag, so this is a manual step.
 */
export function codexMcpInstructions(): string {
  return `[mcp_servers.relay]
command = "relay"
args = ["--mcp"]`;
}

// Re-export for tests.
export { PUBLISHED_MCP_ENTRY, DEV_MCP_ENTRY };
