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
  | ErrorCommand
  | TaskListCommand
  | TaskGetCommand
  | TaskCreateCommand
  | TaskUpdateCommand
  | TaskDeleteCommand
  | TaskLinkRefCommand
  | TaskAddSubtaskCommand
  | TaskCompleteSubtaskCommand
  | TaskReorderCommand
  | PlanListCommand
  | PlanGetCommand
  | PlanCreateCommand
  | PlanUpdateCommand
  | PlanDeleteCommand
  | PlanLinkTaskCommand
  | PlanCutTasksCommand
  | DocListCommand
  | DocGetCommand
  | DocCreateCommand
  | DocUpdateCommand
  | DocDeleteCommand
  | DoctorCommand
  | SyncCommand;

// --- Task command shapes -------------------------------------------

export type TaskStatus =
  | "draft"
  | "backlog"
  | "open"
  | "in-progress"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

const TASK_STATUSES: readonly TaskStatus[] = [
  "draft",
  "backlog",
  "open",
  "in-progress",
  "done",
  "cancelled",
];
const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export interface TaskListCommand {
  kind: "task-list";
  status?: TaskStatus;
  priority?: TaskPriority;
  project?: string;
  epic?: string;
  sprint?: string;
  tags: string[];
  json: boolean;
}

export interface TaskGetCommand {
  kind: "task-get";
  id: string;
  json: boolean;
}

export interface TaskCreateCommand {
  kind: "task-create";
  title: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  body?: string;
  bodyFromFile?: string;
  bodyFromStdin: boolean;
  project?: string;
  epic?: string;
  sprint?: string;
  tags: string[];
  blockedBy: string[];
  relatedTo: string[];
  assignee?: string;
  createdBy?: string;
  json: boolean;
}

/**
 * Update is the most flag-dense command in the surface — it has to
 * express both "replace this list" and "add/remove from this list" plus
 * "clear this nullable field," which are three different operations on
 * the same underlying field.
 *
 * Convention:
 *   --tag T              — full replace; `tags = [T,...]` (last write wins)
 *   --add-tag T          — additive delta on existing tags
 *   --remove-tag T       — subtractive delta on existing tags
 *   --clear-tags         — set tags to undefined
 *
 * `replaceTags` carries the result of `--tag` (or undefined when the
 * user didn't pass any). The handler resolves the conflict between
 * replace, add/remove, and clear: if any of those three operations were
 * specified, applying them in that order produces the final tag set.
 */
export interface TaskUpdateCommand {
  kind: "task-update";
  id: string;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  clearPriority: boolean;
  body?: string;
  bodyFromFile?: string;
  bodyFromStdin: boolean;
  project?: string;
  clearProject: boolean;
  epic?: string;
  clearEpic: boolean;
  sprint?: string;
  clearSprint: boolean;
  replaceTags?: string[];
  addTags: string[];
  removeTags: string[];
  clearTags: boolean;
  replaceBlockedBy?: string[];
  addBlockedBy: string[];
  removeBlockedBy: string[];
  clearBlockedBy: boolean;
  replaceRelatedTo?: string[];
  addRelatedTo: string[];
  removeRelatedTo: string[];
  clearRelatedTo: boolean;
  assignee?: string;
  clearAssignee: boolean;
  createdBy?: string;
  clearCreatedBy: boolean;
  json: boolean;
}

export interface TaskDeleteCommand {
  kind: "task-delete";
  id: string;
}

export interface TaskLinkRefCommand {
  kind: "task-link-ref";
  id: string;
  ref: string;
}

export interface TaskAddSubtaskCommand {
  kind: "task-add-subtask";
  id: string;
  text: string;
}

export interface TaskCompleteSubtaskCommand {
  kind: "task-complete-subtask";
  id: string;
  index?: number;
  text?: string;
}

export interface TaskReorderCommand {
  kind: "task-reorder";
  id: string;
  afterId?: string;
  beforeId?: string;
}

// --- Plan command shapes -------------------------------------------

export type PlanStatus = "draft" | "active" | "completed" | "archived";

const PLAN_STATUSES: readonly PlanStatus[] = [
  "draft",
  "active",
  "completed",
  "archived",
];

export interface PlanListCommand {
  kind: "plan-list";
  status?: PlanStatus;
  project?: string;
  tags: string[];
  json: boolean;
}

export interface PlanGetCommand {
  kind: "plan-get";
  id: string;
  json: boolean;
}

export interface PlanCreateCommand {
  kind: "plan-create";
  title: string;
  status?: PlanStatus;
  body?: string;
  bodyFromFile?: string;
  bodyFromStdin: boolean;
  project?: string;
  tags: string[];
  /** Task IDs to link at create-time. */
  tasks: string[];
  assignee?: string;
  createdBy?: string;
  json: boolean;
}

/**
 * Same replace/add/remove/clear shape as TaskUpdateCommand, applied to
 * tags and the linked-tasks list. Plans don't have priority/epic/sprint
 * so the surface is smaller — but the ergonomics rule is consistent.
 */
export interface PlanUpdateCommand {
  kind: "plan-update";
  id: string;
  title?: string;
  status?: PlanStatus;
  body?: string;
  bodyFromFile?: string;
  bodyFromStdin: boolean;
  project?: string;
  clearProject: boolean;
  replaceTags?: string[];
  addTags: string[];
  removeTags: string[];
  clearTags: boolean;
  replaceTasks?: string[];
  addTasks: string[];
  removeTasks: string[];
  clearTasks: boolean;
  assignee?: string;
  clearAssignee: boolean;
  createdBy?: string;
  clearCreatedBy: boolean;
  json: boolean;
}

export interface PlanDeleteCommand {
  kind: "plan-delete";
  id: string;
}

export interface PlanLinkTaskCommand {
  kind: "plan-link-task";
  planId: string;
  taskId: string;
}

export interface PlanCutTasksCommand {
  kind: "plan-cut-tasks";
  planId: string;
  json: boolean;
}

// --- Doc command shapes --------------------------------------------

export interface DocListCommand {
  kind: "doc-list";
  project?: string;
  tags: string[];
  json: boolean;
}

export interface DocGetCommand {
  kind: "doc-get";
  id: string;
  json: boolean;
}

export interface DocCreateCommand {
  kind: "doc-create";
  title: string;
  body?: string;
  bodyFromFile?: string;
  bodyFromStdin: boolean;
  project?: string;
  tags: string[];
  refs: string[];
  createdBy?: string;
  json: boolean;
}

export interface DocUpdateCommand {
  kind: "doc-update";
  id: string;
  title?: string;
  body?: string;
  bodyFromFile?: string;
  bodyFromStdin: boolean;
  project?: string;
  clearProject: boolean;
  replaceTags?: string[];
  addTags: string[];
  removeTags: string[];
  clearTags: boolean;
  replaceRefs?: string[];
  addRefs: string[];
  removeRefs: string[];
  clearRefs: boolean;
  createdBy?: string;
  clearCreatedBy: boolean;
  json: boolean;
}

export interface DocDeleteCommand {
  kind: "doc-delete";
  id: string;
}

// --- Maintenance commands ------------------------------------------

export interface DoctorCommand {
  kind: "doctor";
  fix: boolean;
  json: boolean;
}

export interface SyncCommand {
  kind: "sync";
  dryRun: boolean;
  push: boolean;
  json: boolean;
}

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
  /**
   * Allowlist resolution for the `Bash(relay *)` permission entry in
   * `.claude/settings.json`. `undefined` means "decide at runtime"
   * (prompt if interactive, skip otherwise). Explicit true/false from
   * `--allowlist` / `--no-allowlist` flags overrides that.
   */
  allowlist?: boolean;
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
  "task",
  "plan",
  "doc",
  "doctor",
  "sync",
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
    case "task":
      return parseTask(rest);
    case "plan":
      return parsePlan(rest);
    case "doc":
      return parseDoc(rest);
    case "doctor":
      return parseDoctor(rest);
    case "sync":
      return parseSync(rest);
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
    } else if (arg === "--allowlist") {
      result.allowlist = true;
    } else if (arg === "--no-allowlist") {
      result.allowlist = false;
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

// --- Task command parsing ------------------------------------------

const TASK_VERBS = new Set([
  "list",
  "get",
  "create",
  "update",
  "delete",
  "link-ref",
  "add-subtask",
  "complete-subtask",
  "reorder",
]);

function parseTask(args: string[]): Command {
  if (args.length === 0) {
    return {
      kind: "error",
      message: "task requires a verb (list, get, create, update, delete, link-ref, add-subtask, complete-subtask, reorder)",
      showHelp: true,
    };
  }

  const verb = args[0];
  const rest = args.slice(1);

  if (!TASK_VERBS.has(verb)) {
    return {
      kind: "error",
      message: `Unknown task verb: ${verb}. Run 'relay help task' for usage.`,
      showHelp: false,
    };
  }

  switch (verb) {
    case "list":
      return parseTaskList(rest);
    case "get":
      return parseTaskGet(rest);
    case "create":
      return parseTaskCreate(rest);
    case "update":
      return parseTaskUpdate(rest);
    case "delete":
      return parseTaskDelete(rest);
    case "link-ref":
      return parseTaskLinkRef(rest);
    case "add-subtask":
      return parseTaskAddSubtask(rest);
    case "complete-subtask":
      return parseTaskCompleteSubtask(rest);
    case "reorder":
      return parseTaskReorder(rest);
    default:
      return {
        kind: "error",
        message: `Unhandled task verb: ${verb}`,
      };
  }
}

function asTaskStatus(s: string): TaskStatus | null {
  return (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : null;
}
function asTaskPriority(s: string): TaskPriority | null {
  return (TASK_PRIORITIES as readonly string[]).includes(s)
    ? (s as TaskPriority)
    : null;
}

function parseTaskList(args: string[]): Command {
  const result: TaskListCommand = {
    kind: "task-list",
    tags: [],
    json: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--status" && i + 1 < args.length) {
      const v = args[++i];
      const s = asTaskStatus(v);
      if (!s) {
        return {
          kind: "error",
          message: `Invalid --status: ${v}. Must be one of: ${TASK_STATUSES.join(", ")}`,
        };
      }
      result.status = s;
    } else if (arg === "--priority" && i + 1 < args.length) {
      const v = args[++i];
      const p = asTaskPriority(v);
      if (!p) {
        return {
          kind: "error",
          message: `Invalid --priority: ${v}. Must be one of: ${TASK_PRIORITIES.join(", ")}`,
        };
      }
      result.priority = p;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--epic" && i + 1 < args.length) {
      result.epic = args[++i];
    } else if (arg === "--sprint" && i + 1 < args.length) {
      result.sprint = args[++i];
    } else if (arg === "--tag" && i + 1 < args.length) {
      result.tags.push(args[++i]);
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return {
        kind: "error",
        message: `Unknown flag for 'task list': ${arg}`,
      };
    }
    i++;
  }

  return result;
}

function parseTaskGet(args: string[]): Command {
  let id: string | undefined;
  let json = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown flag for 'task get': ${arg}` };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'task get' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'task get' requires a task ID. Usage: relay task get <ID>",
    };
  }
  return { kind: "task-get", id, json };
}

function parseTaskCreate(args: string[]): Command {
  const result: TaskCreateCommand = {
    kind: "task-create",
    title: "",
    bodyFromStdin: false,
    tags: [],
    blockedBy: [],
    relatedTo: [],
    json: false,
  };
  let titleSet = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--title" && i + 1 < args.length) {
      result.title = args[++i];
      titleSet = true;
    } else if (arg === "--status" && i + 1 < args.length) {
      const v = args[++i];
      const s = asTaskStatus(v);
      if (!s) {
        return {
          kind: "error",
          message: `Invalid --status: ${v}. Must be one of: ${TASK_STATUSES.join(", ")}`,
        };
      }
      result.status = s;
    } else if (arg === "--priority" && i + 1 < args.length) {
      const v = args[++i];
      const p = asTaskPriority(v);
      if (!p) {
        return {
          kind: "error",
          message: `Invalid --priority: ${v}. Must be one of: ${TASK_PRIORITIES.join(", ")}`,
        };
      }
      result.priority = p;
    } else if (arg === "--body" && i + 1 < args.length) {
      result.body = args[++i];
    } else if (arg === "--body-from-file" && i + 1 < args.length) {
      result.bodyFromFile = args[++i];
    } else if (arg === "--body-from-stdin") {
      result.bodyFromStdin = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--epic" && i + 1 < args.length) {
      result.epic = args[++i];
    } else if (arg === "--sprint" && i + 1 < args.length) {
      result.sprint = args[++i];
    } else if (arg === "--tag" && i + 1 < args.length) {
      result.tags.push(args[++i]);
    } else if (arg === "--blocked-by" && i + 1 < args.length) {
      result.blockedBy.push(args[++i]);
    } else if (arg === "--related-to" && i + 1 < args.length) {
      result.relatedTo.push(args[++i]);
    } else if (arg === "--assignee" && i + 1 < args.length) {
      result.assignee = args[++i];
    } else if (arg === "--created-by" && i + 1 < args.length) {
      result.createdBy = args[++i];
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return {
        kind: "error",
        message: `Unknown flag for 'task create': ${arg}`,
      };
    }
    i++;
  }

  if (!titleSet || result.title.length === 0) {
    return {
      kind: "error",
      message: "'task create' requires --title. Usage: relay task create --title \"…\" [flags]",
    };
  }

  // --body / --body-from-file / --body-from-stdin are mutually exclusive.
  // We surface this as a parse error rather than silently picking one
  // because the user almost certainly has a stale flag in their command.
  const bodySources = [
    result.body !== undefined ? "--body" : null,
    result.bodyFromFile !== undefined ? "--body-from-file" : null,
    result.bodyFromStdin ? "--body-from-stdin" : null,
  ].filter((s): s is string => s !== null);
  if (bodySources.length > 1) {
    return {
      kind: "error",
      message: `Body flags are mutually exclusive; got: ${bodySources.join(", ")}`,
    };
  }

  return result;
}

function parseTaskUpdate(args: string[]): Command {
  let id: string | undefined;
  const result: TaskUpdateCommand = {
    kind: "task-update",
    id: "", // filled below
    bodyFromStdin: false,
    clearPriority: false,
    clearProject: false,
    clearEpic: false,
    clearSprint: false,
    addTags: [],
    removeTags: [],
    clearTags: false,
    addBlockedBy: [],
    removeBlockedBy: [],
    clearBlockedBy: false,
    addRelatedTo: [],
    removeRelatedTo: [],
    clearRelatedTo: false,
    clearAssignee: false,
    clearCreatedBy: false,
    json: false,
  };
  // Lazy-init the replace arrays only when --tag/--blocked-by/--related-to
  // are seen, so the handler can distinguish "not specified" from "explicitly
  // set to []."
  const initReplace = <K extends "replaceTags" | "replaceBlockedBy" | "replaceRelatedTo">(
    field: K,
  ): void => {
    if (result[field] === undefined) {
      result[field] = [] as TaskUpdateCommand[K];
    }
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    // Positional ID — first non-flag arg before any consumed flag value.
    if (!arg.startsWith("-")) {
      if (id === undefined) {
        id = arg;
      } else {
        return {
          kind: "error",
          message: `'task update' takes a single ID; got extra positional: ${arg}`,
        };
      }
      i++;
      continue;
    }

    if (arg === "--title" && i + 1 < args.length) {
      result.title = args[++i];
    } else if (arg === "--status" && i + 1 < args.length) {
      const v = args[++i];
      const s = asTaskStatus(v);
      if (!s) {
        return {
          kind: "error",
          message: `Invalid --status: ${v}. Must be one of: ${TASK_STATUSES.join(", ")}`,
        };
      }
      result.status = s;
    } else if (arg === "--priority" && i + 1 < args.length) {
      const v = args[++i];
      const p = asTaskPriority(v);
      if (!p) {
        return {
          kind: "error",
          message: `Invalid --priority: ${v}. Must be one of: ${TASK_PRIORITIES.join(", ")}`,
        };
      }
      result.priority = p;
    } else if (arg === "--clear-priority") {
      result.clearPriority = true;
    } else if (arg === "--body" && i + 1 < args.length) {
      result.body = args[++i];
    } else if (arg === "--body-from-file" && i + 1 < args.length) {
      result.bodyFromFile = args[++i];
    } else if (arg === "--body-from-stdin") {
      result.bodyFromStdin = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--clear-project") {
      result.clearProject = true;
    } else if (arg === "--epic" && i + 1 < args.length) {
      result.epic = args[++i];
    } else if (arg === "--clear-epic") {
      result.clearEpic = true;
    } else if (arg === "--sprint" && i + 1 < args.length) {
      result.sprint = args[++i];
    } else if (arg === "--clear-sprint") {
      result.clearSprint = true;
    } else if (arg === "--tag" && i + 1 < args.length) {
      initReplace("replaceTags");
      result.replaceTags!.push(args[++i]);
    } else if (arg === "--add-tag" && i + 1 < args.length) {
      result.addTags.push(args[++i]);
    } else if (arg === "--remove-tag" && i + 1 < args.length) {
      result.removeTags.push(args[++i]);
    } else if (arg === "--clear-tags") {
      result.clearTags = true;
    } else if (arg === "--blocked-by" && i + 1 < args.length) {
      initReplace("replaceBlockedBy");
      result.replaceBlockedBy!.push(args[++i]);
    } else if (arg === "--add-blocked-by" && i + 1 < args.length) {
      result.addBlockedBy.push(args[++i]);
    } else if (arg === "--remove-blocked-by" && i + 1 < args.length) {
      result.removeBlockedBy.push(args[++i]);
    } else if (arg === "--clear-blocked-by") {
      result.clearBlockedBy = true;
    } else if (arg === "--related-to" && i + 1 < args.length) {
      initReplace("replaceRelatedTo");
      result.replaceRelatedTo!.push(args[++i]);
    } else if (arg === "--add-related-to" && i + 1 < args.length) {
      result.addRelatedTo.push(args[++i]);
    } else if (arg === "--remove-related-to" && i + 1 < args.length) {
      result.removeRelatedTo.push(args[++i]);
    } else if (arg === "--clear-related-to") {
      result.clearRelatedTo = true;
    } else if (arg === "--assignee" && i + 1 < args.length) {
      result.assignee = args[++i];
    } else if (arg === "--clear-assignee") {
      result.clearAssignee = true;
    } else if (arg === "--created-by" && i + 1 < args.length) {
      result.createdBy = args[++i];
    } else if (arg === "--clear-created-by") {
      result.clearCreatedBy = true;
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return {
        kind: "error",
        message: `Unknown flag for 'task update': ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'task update' requires an ID. Usage: relay task update <ID> [flags]",
    };
  }
  result.id = id;

  const bodySources = [
    result.body !== undefined ? "--body" : null,
    result.bodyFromFile !== undefined ? "--body-from-file" : null,
    result.bodyFromStdin ? "--body-from-stdin" : null,
  ].filter((s): s is string => s !== null);
  if (bodySources.length > 1) {
    return {
      kind: "error",
      message: `Body flags are mutually exclusive; got: ${bodySources.join(", ")}`,
    };
  }

  // Replace and clear on the same field at the same time is incoherent.
  // We pick "replace" wins because it's strictly more informative — but
  // surfacing this as an error is friendlier than silently ignoring one.
  if (result.clearTags && (result.replaceTags || result.addTags.length > 0)) {
    return {
      kind: "error",
      message: "--clear-tags is mutually exclusive with --tag / --add-tag",
    };
  }
  if (
    result.clearBlockedBy &&
    (result.replaceBlockedBy || result.addBlockedBy.length > 0)
  ) {
    return {
      kind: "error",
      message:
        "--clear-blocked-by is mutually exclusive with --blocked-by / --add-blocked-by",
    };
  }
  if (
    result.clearRelatedTo &&
    (result.replaceRelatedTo || result.addRelatedTo.length > 0)
  ) {
    return {
      kind: "error",
      message:
        "--clear-related-to is mutually exclusive with --related-to / --add-related-to",
    };
  }
  if (result.clearPriority && result.priority) {
    return {
      kind: "error",
      message: "--clear-priority is mutually exclusive with --priority",
    };
  }
  if (result.clearProject && result.project !== undefined) {
    return {
      kind: "error",
      message: "--clear-project is mutually exclusive with --project",
    };
  }
  if (result.clearEpic && result.epic !== undefined) {
    return {
      kind: "error",
      message: "--clear-epic is mutually exclusive with --epic",
    };
  }
  if (result.clearSprint && result.sprint !== undefined) {
    return {
      kind: "error",
      message: "--clear-sprint is mutually exclusive with --sprint",
    };
  }
  if (result.clearAssignee && result.assignee !== undefined) {
    return {
      kind: "error",
      message: "--clear-assignee is mutually exclusive with --assignee",
    };
  }
  if (result.clearCreatedBy && result.createdBy !== undefined) {
    return {
      kind: "error",
      message: "--clear-created-by is mutually exclusive with --created-by",
    };
  }

  return result;
}

function parseTaskDelete(args: string[]): Command {
  let id: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown flag for 'task delete': ${arg}` };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'task delete' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'task delete' requires an ID. Usage: relay task delete <ID>",
    };
  }
  return { kind: "task-delete", id };
}

function parseTaskLinkRef(args: string[]): Command {
  const positionals: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for 'task link-ref': ${arg}`,
      };
    } else {
      positionals.push(arg);
    }
    i++;
  }

  if (positionals.length !== 2) {
    return {
      kind: "error",
      message:
        "'task link-ref' requires exactly two arguments. Usage: relay task link-ref <ID> <commit-or-url>",
    };
  }
  return {
    kind: "task-link-ref",
    id: positionals[0],
    ref: positionals[1],
  };
}

function parseTaskAddSubtask(args: string[]): Command {
  const positionals: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for 'task add-subtask': ${arg}`,
      };
    } else {
      positionals.push(arg);
    }
    i++;
  }

  if (positionals.length !== 2) {
    return {
      kind: "error",
      message:
        "'task add-subtask' requires exactly two arguments. Usage: relay task add-subtask <ID> \"<text>\"",
    };
  }
  return {
    kind: "task-add-subtask",
    id: positionals[0],
    text: positionals[1],
  };
}

function parseTaskCompleteSubtask(args: string[]): Command {
  let id: string | undefined;
  let index: number | undefined;
  let text: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--index" && i + 1 < args.length) {
      const v = args[++i];
      const n = parseInt(v, 10);
      if (Number.isNaN(n) || n < 0) {
        return {
          kind: "error",
          message: `--index must be a non-negative integer; got: ${v}`,
        };
      }
      index = n;
    } else if (arg === "--text" && i + 1 < args.length) {
      text = args[++i];
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for 'task complete-subtask': ${arg}`,
      };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'task complete-subtask' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message:
        "'task complete-subtask' requires an ID. Usage: relay task complete-subtask <ID> [--index N | --text \"…\"]",
    };
  }
  if (index === undefined && text === undefined) {
    return {
      kind: "error",
      message: "'task complete-subtask' requires either --index N or --text \"…\"",
    };
  }
  if (index !== undefined && text !== undefined) {
    return {
      kind: "error",
      message: "--index and --text are mutually exclusive; pick one",
    };
  }
  return { kind: "task-complete-subtask", id, index, text };
}

function parseTaskReorder(args: string[]): Command {
  let id: string | undefined;
  let afterId: string | undefined;
  let beforeId: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--after" && i + 1 < args.length) {
      afterId = args[++i];
    } else if (arg === "--before" && i + 1 < args.length) {
      beforeId = args[++i];
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for 'task reorder': ${arg}`,
      };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'task reorder' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message:
        "'task reorder' requires an ID. Usage: relay task reorder <ID> [--after ID] [--before ID]",
    };
  }
  if (!afterId && !beforeId) {
    return {
      kind: "error",
      message: "'task reorder' requires --after <ID> and/or --before <ID>",
    };
  }
  return { kind: "task-reorder", id, afterId, beforeId };
}

// --- Plan command parsing ------------------------------------------

const PLAN_VERBS = new Set([
  "list",
  "get",
  "create",
  "update",
  "delete",
  "link-task",
  "cut-tasks",
]);

function parsePlan(args: string[]): Command {
  if (args.length === 0) {
    return {
      kind: "error",
      message:
        "plan requires a verb (list, get, create, update, delete, link-task, cut-tasks)",
      showHelp: true,
    };
  }

  const verb = args[0];
  const rest = args.slice(1);

  if (!PLAN_VERBS.has(verb)) {
    return {
      kind: "error",
      message: `Unknown plan verb: ${verb}. Run 'relay help plan' for usage.`,
    };
  }

  switch (verb) {
    case "list":
      return parsePlanList(rest);
    case "get":
      return parsePlanGet(rest);
    case "create":
      return parsePlanCreate(rest);
    case "update":
      return parsePlanUpdate(rest);
    case "delete":
      return parsePlanDelete(rest);
    case "link-task":
      return parsePlanLinkTask(rest);
    case "cut-tasks":
      return parsePlanCutTasks(rest);
    default:
      return {
        kind: "error",
        message: `Unhandled plan verb: ${verb}`,
      };
  }
}

function asPlanStatus(s: string): PlanStatus | null {
  return (PLAN_STATUSES as readonly string[]).includes(s)
    ? (s as PlanStatus)
    : null;
}

function parsePlanList(args: string[]): Command {
  const result: PlanListCommand = {
    kind: "plan-list",
    tags: [],
    json: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--status" && i + 1 < args.length) {
      const v = args[++i];
      const s = asPlanStatus(v);
      if (!s) {
        return {
          kind: "error",
          message: `Invalid --status: ${v}. Must be one of: ${PLAN_STATUSES.join(", ")}`,
        };
      }
      result.status = s;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--tag" && i + 1 < args.length) {
      result.tags.push(args[++i]);
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return { kind: "error", message: `Unknown flag for 'plan list': ${arg}` };
    }
    i++;
  }

  return result;
}

function parsePlanGet(args: string[]): Command {
  let id: string | undefined;
  let json = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown flag for 'plan get': ${arg}` };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'plan get' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'plan get' requires a plan ID. Usage: relay plan get <ID>",
    };
  }
  return { kind: "plan-get", id, json };
}

function parsePlanCreate(args: string[]): Command {
  const result: PlanCreateCommand = {
    kind: "plan-create",
    title: "",
    bodyFromStdin: false,
    tags: [],
    tasks: [],
    json: false,
  };
  let titleSet = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--title" && i + 1 < args.length) {
      result.title = args[++i];
      titleSet = true;
    } else if (arg === "--status" && i + 1 < args.length) {
      const v = args[++i];
      const s = asPlanStatus(v);
      if (!s) {
        return {
          kind: "error",
          message: `Invalid --status: ${v}. Must be one of: ${PLAN_STATUSES.join(", ")}`,
        };
      }
      result.status = s;
    } else if (arg === "--body" && i + 1 < args.length) {
      result.body = args[++i];
    } else if (arg === "--body-from-file" && i + 1 < args.length) {
      result.bodyFromFile = args[++i];
    } else if (arg === "--body-from-stdin") {
      result.bodyFromStdin = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--tag" && i + 1 < args.length) {
      result.tags.push(args[++i]);
    } else if (arg === "--task" && i + 1 < args.length) {
      result.tasks.push(args[++i]);
    } else if (arg === "--assignee" && i + 1 < args.length) {
      result.assignee = args[++i];
    } else if (arg === "--created-by" && i + 1 < args.length) {
      result.createdBy = args[++i];
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return {
        kind: "error",
        message: `Unknown flag for 'plan create': ${arg}`,
      };
    }
    i++;
  }

  if (!titleSet || result.title.length === 0) {
    return {
      kind: "error",
      message:
        "'plan create' requires --title. Usage: relay plan create --title \"…\" [flags]",
    };
  }

  const bodySources = [
    result.body !== undefined ? "--body" : null,
    result.bodyFromFile !== undefined ? "--body-from-file" : null,
    result.bodyFromStdin ? "--body-from-stdin" : null,
  ].filter((s): s is string => s !== null);
  if (bodySources.length > 1) {
    return {
      kind: "error",
      message: `Body flags are mutually exclusive; got: ${bodySources.join(", ")}`,
    };
  }

  return result;
}

function parsePlanUpdate(args: string[]): Command {
  let id: string | undefined;
  const result: PlanUpdateCommand = {
    kind: "plan-update",
    id: "",
    bodyFromStdin: false,
    clearProject: false,
    addTags: [],
    removeTags: [],
    clearTags: false,
    addTasks: [],
    removeTasks: [],
    clearTasks: false,
    clearAssignee: false,
    clearCreatedBy: false,
    json: false,
  };
  const initReplace = <K extends "replaceTags" | "replaceTasks">(
    field: K,
  ): void => {
    if (result[field] === undefined) {
      result[field] = [] as PlanUpdateCommand[K];
    }
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg.startsWith("-")) {
      if (id === undefined) {
        id = arg;
      } else {
        return {
          kind: "error",
          message: `'plan update' takes a single ID; got extra positional: ${arg}`,
        };
      }
      i++;
      continue;
    }

    if (arg === "--title" && i + 1 < args.length) {
      result.title = args[++i];
    } else if (arg === "--status" && i + 1 < args.length) {
      const v = args[++i];
      const s = asPlanStatus(v);
      if (!s) {
        return {
          kind: "error",
          message: `Invalid --status: ${v}. Must be one of: ${PLAN_STATUSES.join(", ")}`,
        };
      }
      result.status = s;
    } else if (arg === "--body" && i + 1 < args.length) {
      result.body = args[++i];
    } else if (arg === "--body-from-file" && i + 1 < args.length) {
      result.bodyFromFile = args[++i];
    } else if (arg === "--body-from-stdin") {
      result.bodyFromStdin = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--clear-project") {
      result.clearProject = true;
    } else if (arg === "--tag" && i + 1 < args.length) {
      initReplace("replaceTags");
      result.replaceTags!.push(args[++i]);
    } else if (arg === "--add-tag" && i + 1 < args.length) {
      result.addTags.push(args[++i]);
    } else if (arg === "--remove-tag" && i + 1 < args.length) {
      result.removeTags.push(args[++i]);
    } else if (arg === "--clear-tags") {
      result.clearTags = true;
    } else if (arg === "--task" && i + 1 < args.length) {
      initReplace("replaceTasks");
      result.replaceTasks!.push(args[++i]);
    } else if (arg === "--add-task" && i + 1 < args.length) {
      result.addTasks.push(args[++i]);
    } else if (arg === "--remove-task" && i + 1 < args.length) {
      result.removeTasks.push(args[++i]);
    } else if (arg === "--clear-tasks") {
      result.clearTasks = true;
    } else if (arg === "--assignee" && i + 1 < args.length) {
      result.assignee = args[++i];
    } else if (arg === "--clear-assignee") {
      result.clearAssignee = true;
    } else if (arg === "--created-by" && i + 1 < args.length) {
      result.createdBy = args[++i];
    } else if (arg === "--clear-created-by") {
      result.clearCreatedBy = true;
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return {
        kind: "error",
        message: `Unknown flag for 'plan update': ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message:
        "'plan update' requires an ID. Usage: relay plan update <ID> [flags]",
    };
  }
  result.id = id;

  const bodySources = [
    result.body !== undefined ? "--body" : null,
    result.bodyFromFile !== undefined ? "--body-from-file" : null,
    result.bodyFromStdin ? "--body-from-stdin" : null,
  ].filter((s): s is string => s !== null);
  if (bodySources.length > 1) {
    return {
      kind: "error",
      message: `Body flags are mutually exclusive; got: ${bodySources.join(", ")}`,
    };
  }

  if (result.clearTags && (result.replaceTags || result.addTags.length > 0)) {
    return {
      kind: "error",
      message: "--clear-tags is mutually exclusive with --tag / --add-tag",
    };
  }
  if (result.clearTasks && (result.replaceTasks || result.addTasks.length > 0)) {
    return {
      kind: "error",
      message: "--clear-tasks is mutually exclusive with --task / --add-task",
    };
  }
  if (result.clearProject && result.project !== undefined) {
    return {
      kind: "error",
      message: "--clear-project is mutually exclusive with --project",
    };
  }
  if (result.clearAssignee && result.assignee !== undefined) {
    return {
      kind: "error",
      message: "--clear-assignee is mutually exclusive with --assignee",
    };
  }
  if (result.clearCreatedBy && result.createdBy !== undefined) {
    return {
      kind: "error",
      message: "--clear-created-by is mutually exclusive with --created-by",
    };
  }

  return result;
}

function parsePlanDelete(args: string[]): Command {
  let id: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown flag for 'plan delete': ${arg}` };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'plan delete' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'plan delete' requires an ID. Usage: relay plan delete <ID>",
    };
  }
  return { kind: "plan-delete", id };
}

function parsePlanLinkTask(args: string[]): Command {
  const positionals: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for 'plan link-task': ${arg}`,
      };
    } else {
      positionals.push(arg);
    }
    i++;
  }

  if (positionals.length !== 2) {
    return {
      kind: "error",
      message:
        "'plan link-task' requires exactly two arguments. Usage: relay plan link-task <PLAN-ID> <TASK-ID>",
    };
  }
  return {
    kind: "plan-link-task",
    planId: positionals[0],
    taskId: positionals[1],
  };
}

function parsePlanCutTasks(args: string[]): Command {
  let planId: string | undefined;
  let json = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown flag for 'plan cut-tasks': ${arg}`,
      };
    } else if (planId === undefined) {
      planId = arg;
    } else {
      return {
        kind: "error",
        message: `'plan cut-tasks' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!planId) {
    return {
      kind: "error",
      message:
        "'plan cut-tasks' requires a plan ID. Usage: relay plan cut-tasks <PLAN-ID>",
    };
  }
  return { kind: "plan-cut-tasks", planId, json };
}

// --- Doc command parsing -------------------------------------------

const DOC_VERBS = new Set(["list", "get", "create", "update", "delete"]);

function parseDoc(args: string[]): Command {
  if (args.length === 0) {
    return {
      kind: "error",
      message: "doc requires a verb (list, get, create, update, delete)",
      showHelp: true,
    };
  }
  const verb = args[0];
  const rest = args.slice(1);

  if (!DOC_VERBS.has(verb)) {
    return {
      kind: "error",
      message: `Unknown doc verb: ${verb}. Run 'relay help doc' for usage.`,
    };
  }

  switch (verb) {
    case "list":
      return parseDocList(rest);
    case "get":
      return parseDocGet(rest);
    case "create":
      return parseDocCreate(rest);
    case "update":
      return parseDocUpdate(rest);
    case "delete":
      return parseDocDelete(rest);
    default:
      return { kind: "error", message: `Unhandled doc verb: ${verb}` };
  }
}

function parseDocList(args: string[]): Command {
  const result: DocListCommand = { kind: "doc-list", tags: [], json: false };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--tag" && i + 1 < args.length) {
      result.tags.push(args[++i]);
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return { kind: "error", message: `Unknown flag for 'doc list': ${arg}` };
    }
    i++;
  }
  return result;
}

function parseDocGet(args: string[]): Command {
  let id: string | undefined;
  let json = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown flag for 'doc get': ${arg}` };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'doc get' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'doc get' requires a doc ID. Usage: relay doc get <ID>",
    };
  }
  return { kind: "doc-get", id, json };
}

function parseDocCreate(args: string[]): Command {
  const result: DocCreateCommand = {
    kind: "doc-create",
    title: "",
    bodyFromStdin: false,
    tags: [],
    refs: [],
    json: false,
  };
  let titleSet = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--title" && i + 1 < args.length) {
      result.title = args[++i];
      titleSet = true;
    } else if (arg === "--body" && i + 1 < args.length) {
      result.body = args[++i];
    } else if (arg === "--body-from-file" && i + 1 < args.length) {
      result.bodyFromFile = args[++i];
    } else if (arg === "--body-from-stdin") {
      result.bodyFromStdin = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--tag" && i + 1 < args.length) {
      result.tags.push(args[++i]);
    } else if (arg === "--ref" && i + 1 < args.length) {
      result.refs.push(args[++i]);
    } else if (arg === "--created-by" && i + 1 < args.length) {
      result.createdBy = args[++i];
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return {
        kind: "error",
        message: `Unknown flag for 'doc create': ${arg}`,
      };
    }
    i++;
  }

  if (!titleSet || result.title.length === 0) {
    return {
      kind: "error",
      message:
        "'doc create' requires --title. Usage: relay doc create --title \"…\" [flags]",
    };
  }

  const bodySources = [
    result.body !== undefined ? "--body" : null,
    result.bodyFromFile !== undefined ? "--body-from-file" : null,
    result.bodyFromStdin ? "--body-from-stdin" : null,
  ].filter((s): s is string => s !== null);
  if (bodySources.length > 1) {
    return {
      kind: "error",
      message: `Body flags are mutually exclusive; got: ${bodySources.join(", ")}`,
    };
  }

  return result;
}

function parseDocUpdate(args: string[]): Command {
  let id: string | undefined;
  const result: DocUpdateCommand = {
    kind: "doc-update",
    id: "",
    bodyFromStdin: false,
    clearProject: false,
    addTags: [],
    removeTags: [],
    clearTags: false,
    addRefs: [],
    removeRefs: [],
    clearRefs: false,
    clearCreatedBy: false,
    json: false,
  };
  const initReplace = <K extends "replaceTags" | "replaceRefs">(
    field: K,
  ): void => {
    if (result[field] === undefined) {
      result[field] = [] as DocUpdateCommand[K];
    }
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg.startsWith("-")) {
      if (id === undefined) {
        id = arg;
      } else {
        return {
          kind: "error",
          message: `'doc update' takes a single ID; got extra positional: ${arg}`,
        };
      }
      i++;
      continue;
    }

    if (arg === "--title" && i + 1 < args.length) {
      result.title = args[++i];
    } else if (arg === "--body" && i + 1 < args.length) {
      result.body = args[++i];
    } else if (arg === "--body-from-file" && i + 1 < args.length) {
      result.bodyFromFile = args[++i];
    } else if (arg === "--body-from-stdin") {
      result.bodyFromStdin = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      result.project = args[++i];
    } else if (arg === "--clear-project") {
      result.clearProject = true;
    } else if (arg === "--tag" && i + 1 < args.length) {
      initReplace("replaceTags");
      result.replaceTags!.push(args[++i]);
    } else if (arg === "--add-tag" && i + 1 < args.length) {
      result.addTags.push(args[++i]);
    } else if (arg === "--remove-tag" && i + 1 < args.length) {
      result.removeTags.push(args[++i]);
    } else if (arg === "--clear-tags") {
      result.clearTags = true;
    } else if (arg === "--ref" && i + 1 < args.length) {
      initReplace("replaceRefs");
      result.replaceRefs!.push(args[++i]);
    } else if (arg === "--add-ref" && i + 1 < args.length) {
      result.addRefs.push(args[++i]);
    } else if (arg === "--remove-ref" && i + 1 < args.length) {
      result.removeRefs.push(args[++i]);
    } else if (arg === "--clear-refs") {
      result.clearRefs = true;
    } else if (arg === "--created-by" && i + 1 < args.length) {
      result.createdBy = args[++i];
    } else if (arg === "--clear-created-by") {
      result.clearCreatedBy = true;
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return { kind: "error", message: `Unknown flag for 'doc update': ${arg}` };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'doc update' requires an ID. Usage: relay doc update <ID> [flags]",
    };
  }
  result.id = id;

  const bodySources = [
    result.body !== undefined ? "--body" : null,
    result.bodyFromFile !== undefined ? "--body-from-file" : null,
    result.bodyFromStdin ? "--body-from-stdin" : null,
  ].filter((s): s is string => s !== null);
  if (bodySources.length > 1) {
    return {
      kind: "error",
      message: `Body flags are mutually exclusive; got: ${bodySources.join(", ")}`,
    };
  }

  if (result.clearTags && (result.replaceTags || result.addTags.length > 0)) {
    return {
      kind: "error",
      message: "--clear-tags is mutually exclusive with --tag / --add-tag",
    };
  }
  if (result.clearRefs && (result.replaceRefs || result.addRefs.length > 0)) {
    return {
      kind: "error",
      message: "--clear-refs is mutually exclusive with --ref / --add-ref",
    };
  }
  if (result.clearProject && result.project !== undefined) {
    return {
      kind: "error",
      message: "--clear-project is mutually exclusive with --project",
    };
  }
  if (result.clearCreatedBy && result.createdBy !== undefined) {
    return {
      kind: "error",
      message: "--clear-created-by is mutually exclusive with --created-by",
    };
  }

  return result;
}

function parseDocDelete(args: string[]): Command {
  let id: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      return { kind: "error", message: `Unknown flag for 'doc delete': ${arg}` };
    } else if (id === undefined) {
      id = arg;
    } else {
      return {
        kind: "error",
        message: `'doc delete' takes a single ID; got extra positional: ${arg}`,
      };
    }
    i++;
  }

  if (!id) {
    return {
      kind: "error",
      message: "'doc delete' requires an ID. Usage: relay doc delete <ID>",
    };
  }
  return { kind: "doc-delete", id };
}

// --- Maintenance command parsing -----------------------------------

function parseDoctor(args: string[]): Command {
  const result: DoctorCommand = { kind: "doctor", fix: false, json: false };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--fix") {
      result.fix = true;
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return { kind: "error", message: `Unknown flag for 'doctor': ${arg}` };
    }
    i++;
  }
  return result;
}

function parseSync(args: string[]): Command {
  const result: SyncCommand = {
    kind: "sync",
    dryRun: false,
    push: false,
    json: false,
  };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--push") {
      result.push = true;
    } else if (arg === "--json") {
      result.json = true;
    } else {
      return { kind: "error", message: `Unknown flag for 'sync': ${arg}` };
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
        "Usage: relay init [options] [path]",
        "",
        "Scaffold .relay/, .mcp.json, and skill files in a project.",
        "",
        "Arguments:",
        "  path             Project directory (default: cwd)",
        "",
        "Options:",
        "  --allowlist      Always add a Bash(relay *) permission entry to .claude/settings.json",
        "  --no-allowlist   Never add the permission entry (default in non-interactive shells)",
        "                   With neither flag, prompts when stdin is a TTY.",
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
    case "doctor":
      return [
        "Usage: relay doctor [--fix] [--json]",
        "",
        "Validate artifact integrity. Checks counter consistency, duplicate IDs,",
        "filename drift, dangling references, stale locks, and .gitattributes.",
        "",
        "Options:",
        "  --fix          Auto-repair fixable issues",
        "  --json         Emit structured JSON instead of human-readable text",
        "",
        "Exit codes: 0 if no failures, 1 if any FAIL diagnostics remain.",
      ].join("\n");
    case "sync":
      return [
        "Usage: relay sync [--dry-run] [--push] [--json]",
        "",
        "Stage and commit pending artifact changes (.relay/{tasks,plans,docs}/*.md)",
        "with a structured commit message.",
        "",
        "Options:",
        "  --dry-run      Preview the commit without making it",
        "  --push         Push to the current branch's upstream after committing",
        "  --json         Emit structured JSON instead of human-readable text",
      ].join("\n");
    case "doc":
      return [
        "Usage: relay doc <verb> [args] [flags]",
        "",
        "Verbs:",
        "  list                       List docs (filter by --project, --tag)",
        "  get <ID>                   Print full doc body and metadata",
        "  create --title \"…\" […]      Create a new reference doc",
        "  update <ID> […]            Update a doc. --tag/--ref replace; --add-… / --remove-… are deltas; --clear-… removes",
        "  delete <ID>                Archive (or hard-delete, per config)",
        "",
        "Common flags (where applicable):",
        "  --tag <t>                  Repeatable. On 'create' adds; on 'update' replaces (use --add-tag / --remove-tag)",
        "  --ref <url-or-sha>         Repeatable. Same semantics as --tag",
        "  --body \"…\" / --body-from-file <path> / --body-from-stdin",
        "  --json                     Emit structured JSON instead of human-readable text",
        "",
        "Examples:",
        "  relay doc list --tag architecture --json",
        "  cat ARCH.md | relay doc create --title \"Auth architecture\" --body-from-stdin --tag architecture",
      ].join("\n");
    case "plan":
      return [
        "Usage: relay plan <verb> [args] [flags]",
        "",
        "Verbs:",
        "  list                       List plans (filter by --status, --project, --tag)",
        "  get <ID>                   Print full plan body and metadata",
        "  create --title \"…\" […]      Create a new plan (default status: draft)",
        "  update <ID> […]            Update a plan. --tag/--task replace; --add-… / --remove-… are deltas; --clear-… removes",
        "  delete <ID>                Archive (or hard-delete, per config)",
        "  link-task <PLAN> <TASK>    Attach an existing task to a plan",
        "  cut-tasks <PLAN>           Parse unchecked checkboxes in the plan body, create a task per item, link them, check the boxes",
        "",
        "Common flags (where applicable):",
        "  --status <s>               One of: draft, active, completed, archived",
        "  --tag <t>                  Repeatable. On 'create' adds; on 'update' replaces (use --add-tag / --remove-tag for deltas)",
        "  --task <ID>                Repeatable. On 'create' links existing tasks; on 'update' replaces (use --add-task / --remove-task)",
        "  --body \"…\" / --body-from-file <path> / --body-from-stdin",
        "  --json                     Emit structured JSON instead of human-readable text",
        "",
        "Examples:",
        "  relay plan list --status active --json",
        "  relay plan create --title \"Q3 roadmap\" --tag roadmap --task TASK-001 --task TASK-002",
        "  relay plan cut-tasks PLAN-005",
      ].join("\n");
    case "task":
      return [
        "Usage: relay task <verb> [args] [flags]",
        "",
        "Verbs:",
        "  list                       List tasks (filter by --status, --priority, --project, --epic, --sprint, --tag)",
        "  get <ID>                   Print full task body and metadata",
        "  create --title \"…\" […]      Create a new task (default status: open)",
        "  update <ID> […]            Update a task. --tag/--blocked-by/--related-to replace; --add-… / --remove-… are deltas; --clear-… removes",
        "  delete <ID>                Archive (or hard-delete, per config)",
        "  link-ref <ID> <ref>        Attach a commit SHA or PR URL to a task",
        "  add-subtask <ID> \"<text>\"   Append a checkbox to the task body",
        "  complete-subtask <ID>      Check off a subtask. Requires --index N or --text \"<match>\"",
        "  reorder <ID>               Move within its status column. Requires --after <ID> and/or --before <ID>",
        "",
        "Common flags (where applicable):",
        "  --status <s>               One of: draft, backlog, open, in-progress, done, cancelled",
        "  --priority <p>             One of: low, medium, high, urgent",
        "  --tag <t>                  Repeatable. On 'create' adds; on 'update' replaces (use --add-tag / --remove-tag for deltas)",
        "  --body \"…\" / --body-from-file <path> / --body-from-stdin",
        "  --json                     Emit structured JSON instead of human-readable text",
        "",
        "Examples:",
        "  relay task list --status open --json",
        "  relay task create --title \"Fix login\" --priority high --tag bug --tag auth",
        "  relay task update TKT-001 --status in-progress --assignee claude-code",
        "  cat notes.md | relay task create --title \"Refactor parser\" --body-from-stdin",
      ].join("\n");
    default:
      return [
        "Usage: relay [command] [options] [path]",
        "",
        "Commands:",
        "  init           Scaffold .relay/ directory, .mcp.json, and skill files",
        "  onboard        Write/update agent instructions in CLAUDE.md / AGENTS.md",
        "  upgrade        Upgrade relay to the latest release",
        "  where          Print the resolved .relay/ directory (worktree-aware)",
        "  task           Manage tasks (list/get/create/update/delete/link-ref/subtasks/reorder)",
        "  plan           Manage plans (list/get/create/update/delete/link-task/cut-tasks)",
        "  doc            Manage reference docs (list/get/create/update/delete)",
        "  doctor         Validate artifact integrity (--fix to auto-repair)",
        "  sync           Stage and commit pending artifact changes",
        "  help [topic]   Show help for a topic",
        "  (default)      Start the server and open the UI",
        "",
        "Options (default serve mode):",
        "  --dir <path>   Path to .relay/ directory (or directory containing it)",
        "  --port <num>   Server port (default: 4242, auto-increment on collision)",
        "  --no-ui        Server only, no static UI serving",
        "  --mcp          Start MCP server mode (stdio transport, no HTTP)",
        "  -h, --help     Show this help message",
      ].join("\n");
  }
}
