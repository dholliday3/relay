/**
 * Argv parser for the `relay` CLI.
 *
 * The parser dispatches on the first non-flag arg:
 *
 *   relay                       → serve
 *   relay [path]                → serve at path
 *   relay --mcp [path]          → serve, MCP mode
 *   relay --port N [path]       → serve on port
 *   relay init [path]           → scaffold .relay/
 *   relay onboard [...]         → write CLAUDE.md section
 *   relay upgrade [...]         → upgrade to latest release
 *   relay where [path]          → print resolved .relay/ (worktree-aware)
 *   relay help [topic]          → usage
 *
 * Phases 2–5 of PLAN-010 will extend this with `task`, `plan`, `doc`,
 * `doctor`, and `sync` nouns. The shape here is intentionally open —
 * each command is its own discriminated variant on `Command` so adding
 * a new noun means adding a new variant + a new branch in `parseArgv`,
 * not threading flags through a shared bag.
 */

export type Command =
  | ServeCommand
  | InitCommand
  | OnboardCommand
  | UpgradeCommand
  | WhereCommand
  | HelpCommand
  | ErrorCommand;

export interface ServeCommand {
  kind: "serve";
  dir?: string;
  port?: number;
  noUi: boolean;
  mcp: boolean;
}

export interface InitCommand {
  kind: "init";
  dir?: string;
}

export interface OnboardCommand {
  kind: "onboard";
  dir?: string;
  check: boolean;
  stdout: boolean;
  json: boolean;
}

export interface UpgradeCommand {
  kind: "upgrade";
  check: boolean;
  json: boolean;
}

export interface WhereCommand {
  kind: "where";
  dir?: string;
  json: boolean;
}

export interface HelpCommand {
  kind: "help";
  topic?: string;
}

export interface ErrorCommand {
  kind: "error";
  message: string;
  /** When true, the caller should print help and exit 1. */
  showHelp?: boolean;
}

/** Top-level subcommands recognized by the parser. Used for help routing too. */
const KNOWN_COMMANDS = new Set([
  "init",
  "onboard",
  "upgrade",
  "where",
  "help",
]);

/**
 * Parse the full process.argv (caller passes process.argv directly; we
 * slice off node + script ourselves for symmetry with the current code).
 */
export function parseArgv(argv: string[]): Command {
  const args = argv.slice(2);

  if (args.length === 0) return parseServe([]);

  // `--help` / `-h` anywhere in the top-level args route to help. We do
  // this before subcommand dispatch so `relay --help` works without
  // having to spell out a noun.
  if (args.includes("--help") || args.includes("-h")) {
    // If there's a known noun before the help flag, route help to that
    // topic. Otherwise show top-level help.
    const noun = args.find((a) => KNOWN_COMMANDS.has(a));
    return { kind: "help", topic: noun };
  }

  // Legacy entry point: `relay --port 4242`, `relay --mcp`, `relay /path`.
  // Anything that starts with a flag, or a positional that isn't a known
  // subcommand, is routed to serve.
  const first = args[0];
  if (first.startsWith("-") || !KNOWN_COMMANDS.has(first)) {
    return parseServe(args);
  }

  const rest = args.slice(1);
  switch (first) {
    case "init":
      return parseInit(rest);
    case "onboard":
      return parseOnboard(rest);
    case "upgrade":
      return parseUpgrade(rest);
    case "where":
      return parseWhere(rest);
    case "help":
      return { kind: "help", topic: rest[0] };
    default:
      // Should be unreachable given KNOWN_COMMANDS gate above.
      return {
        kind: "error",
        message: `Unknown command: ${first}`,
        showHelp: true,
      };
  }
}

function parseServe(args: string[]): Command {
  const result: ServeCommand = {
    kind: "serve",
    noUi: false,
    mcp: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--dir" && i + 1 < args.length) {
      result.dir = args[++i];
    } else if (arg === "--port" && i + 1 < args.length) {
      const n = parseInt(args[++i], 10);
      if (Number.isNaN(n)) {
        return { kind: "error", message: "--port must be an integer" };
      }
      result.port = n;
    } else if (arg === "--no-ui") {
      result.noUi = true;
    } else if (arg === "--mcp") {
      result.mcp = true;
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for serve: ${arg}`,
        showHelp: true,
      };
    } else {
      result.dir = arg;
    }
    i++;
  }

  return result;
}

function parseInit(args: string[]): Command {
  const result: InitCommand = { kind: "init" };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--dir" && i + 1 < args.length) {
      result.dir = args[++i];
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for init: ${arg}`,
        showHelp: true,
      };
    } else {
      result.dir = arg;
    }
    i++;
  }

  return result;
}

function parseOnboard(args: string[]): Command {
  const result: OnboardCommand = {
    kind: "onboard",
    check: false,
    stdout: false,
    json: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--dir" && i + 1 < args.length) {
      result.dir = args[++i];
    } else if (arg === "--check") {
      result.check = true;
    } else if (arg === "--stdout") {
      result.stdout = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for onboard: ${arg}`,
        showHelp: true,
      };
    } else {
      result.dir = arg;
    }
    i++;
  }

  return result;
}

function parseUpgrade(args: string[]): Command {
  const result: UpgradeCommand = {
    kind: "upgrade",
    check: false,
    json: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--check") {
      result.check = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for upgrade: ${arg}`,
        showHelp: true,
      };
    } else {
      return {
        kind: "error",
        message: `upgrade does not take a positional argument: ${arg}`,
        showHelp: true,
      };
    }
    i++;
  }

  return result;
}

function parseWhere(args: string[]): Command {
  const result: WhereCommand = { kind: "where", json: false };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--json") {
      result.json = true;
    } else if (arg === "--dir" && i + 1 < args.length) {
      result.dir = args[++i];
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for where: ${arg}`,
        showHelp: true,
      };
    } else {
      result.dir = arg;
    }
    i++;
  }

  return result;
}

/**
 * Render usage text for a topic. `undefined` topic = top-level help.
 */
export function helpText(topic?: string): string {
  switch (topic) {
    case "init":
      return [
        "Usage: relay init [path]",
        "",
        "Scaffold .relay/, .mcp.json, and skill files in a project.",
        "",
        "Arguments:",
        "  path           Project directory (default: cwd)",
      ].join("\n");
    case "onboard":
      return [
        "Usage: relay onboard [options] [path]",
        "",
        "Write or update the relay agent instructions section in CLAUDE.md / AGENTS.md.",
        "",
        "Options:",
        "  --check        Report status without side effects (exits 1 if stale)",
        "  --stdout       Print the wrapped section to stdout, touch no files",
        "  --json         Emit structured JSON output",
      ].join("\n");
    case "upgrade":
      return [
        "Usage: relay upgrade [options]",
        "",
        "Upgrade relay to the latest release from GitHub.",
        "",
        "Options:",
        "  --check        Check for updates without installing (exits 1 if behind)",
        "  --json         Emit structured JSON output",
      ].join("\n");
    case "where":
      return [
        "Usage: relay where [options] [path]",
        "",
        "Print the resolved .relay/ directory for the current cwd (or [path]).",
        "Useful for confirming worktree resolution: relay always operates on",
        "the .relay/ found by walking up from the directory you run it in.",
        "",
        "Arguments:",
        "  path           Directory to resolve from (default: cwd)",
        "",
        "Options:",
        "  --json         Emit structured JSON output",
      ].join("\n");
    case "help":
      return helpText(undefined);
    default:
      return [
        "Usage: relay [command] [options] [path]",
        "",
        "Commands:",
        "  init           Scaffold .relay/ directory, .mcp.json, and skill files",
        "  onboard        Write/update agent instructions in CLAUDE.md / AGENTS.md",
        "  upgrade        Upgrade relay to the latest release",
        "  where          Print the resolved .relay/ directory (worktree-aware)",
        "  help [topic]   Show help for a topic",
        "  (default)      Start the server and open the UI",
        "",
        "Options:",
        "  --dir <path>   Path to .relay/ directory (or directory containing it)",
        "  --port <num>   Server port (default: 4242, auto-increment on collision)",
        "  --no-ui        Server only, no static UI serving",
        "  --mcp          Start MCP server mode (stdio transport, no HTTP)",
        "  -h, --help     Show this help message",
      ].join("\n");
  }
}
