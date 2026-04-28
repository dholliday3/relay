import { describe, test, expect } from "bun:test";
import { parseArgv, helpText } from "./parse.ts";

/**
 * The parser takes the full process.argv and slices off node + script
 * itself. Tests use a "fake argv" where the first two slots stand in
 * for that header, so the per-test inputs read like real CLI calls.
 */
function argv(...args: string[]): string[] {
  return ["bun", "bin/relay.ts", ...args];
}

describe("parseArgv — defaults & top-level help", () => {
  test("no args → serve with defaults", () => {
    const cmd = parseArgv(argv());
    expect(cmd).toEqual({ kind: "serve", noUi: false, mcp: false });
  });

  test("--help (no noun) → top-level help", () => {
    expect(parseArgv(argv("--help"))).toEqual({ kind: "help" });
    expect(parseArgv(argv("-h"))).toEqual({ kind: "help" });
  });

  test("--help with a noun → topic help", () => {
    // Either order works: `relay where --help` and `relay --help where`
    // both route to the topic.
    expect(parseArgv(argv("where", "--help"))).toEqual({
      kind: "help",
      topic: "where",
    });
    expect(parseArgv(argv("--help", "where"))).toEqual({
      kind: "help",
      topic: "where",
    });
  });

  test("`relay help <topic>` → topic help", () => {
    expect(parseArgv(argv("help", "init"))).toEqual({
      kind: "help",
      topic: "init",
    });
    expect(parseArgv(argv("help"))).toEqual({ kind: "help", topic: undefined });
  });
});

describe("parseArgv — serve (legacy default path)", () => {
  test("--port", () => {
    expect(parseArgv(argv("--port", "5050"))).toEqual({
      kind: "serve",
      port: 5050,
      noUi: false,
      mcp: false,
    });
  });

  test("--port with non-numeric value errors", () => {
    const cmd = parseArgv(argv("--port", "banana"));
    expect(cmd.kind).toBe("error");
  });

  test("--mcp flag", () => {
    expect(parseArgv(argv("--mcp"))).toEqual({
      kind: "serve",
      noUi: false,
      mcp: true,
    });
  });

  test("--no-ui flag", () => {
    expect(parseArgv(argv("--no-ui"))).toEqual({
      kind: "serve",
      noUi: true,
      mcp: false,
    });
  });

  test("positional path → dir", () => {
    expect(parseArgv(argv("/tmp/myproject"))).toEqual({
      kind: "serve",
      dir: "/tmp/myproject",
      noUi: false,
      mcp: false,
    });
  });

  test("--dir overrides positional with last-wins semantics", () => {
    // Either form works. The serve parser takes the last one written.
    const cmd = parseArgv(argv("--dir", "/tmp/a", "/tmp/b"));
    expect(cmd).toMatchObject({ kind: "serve", dir: "/tmp/b" });
  });

  test("unknown flag for serve errors", () => {
    const cmd = parseArgv(argv("--definitely-not-a-flag"));
    expect(cmd.kind).toBe("error");
  });
});

describe("parseArgv — init", () => {
  test("no args → init at cwd", () => {
    expect(parseArgv(argv("init"))).toEqual({ kind: "init" });
  });

  test("positional path", () => {
    expect(parseArgv(argv("init", "/tmp/x"))).toEqual({
      kind: "init",
      dir: "/tmp/x",
    });
  });

  test("--dir flag", () => {
    expect(parseArgv(argv("init", "--dir", "/tmp/y"))).toEqual({
      kind: "init",
      dir: "/tmp/y",
    });
  });

  test("--allowlist sets the flag explicitly", () => {
    expect(parseArgv(argv("init", "--allowlist"))).toEqual({
      kind: "init",
      allowlist: true,
    });
  });

  test("--no-allowlist sets the flag to false", () => {
    expect(parseArgv(argv("init", "--no-allowlist"))).toEqual({
      kind: "init",
      allowlist: false,
    });
  });

  test("unknown flag errors", () => {
    const cmd = parseArgv(argv("init", "--bogus"));
    expect(cmd.kind).toBe("error");
  });
});

describe("parseArgv — onboard", () => {
  test("default flags off", () => {
    expect(parseArgv(argv("onboard"))).toEqual({
      kind: "onboard",
      check: false,
      stdout: false,
      json: false,
    });
  });

  test("all flags + path", () => {
    expect(
      parseArgv(argv("onboard", "--check", "--stdout", "--json", "/tmp/p")),
    ).toEqual({
      kind: "onboard",
      dir: "/tmp/p",
      check: true,
      stdout: true,
      json: true,
    });
  });
});

describe("parseArgv — upgrade", () => {
  test("default flags off", () => {
    expect(parseArgv(argv("upgrade"))).toEqual({
      kind: "upgrade",
      check: false,
      json: false,
    });
  });

  test("--check + --json", () => {
    expect(parseArgv(argv("upgrade", "--check", "--json"))).toEqual({
      kind: "upgrade",
      check: true,
      json: true,
    });
  });

  test("upgrade rejects positionals (the only command that does)", () => {
    // upgrade has no path arg — it's a global operation. We surface that
    // explicitly rather than silently ignoring the positional.
    const cmd = parseArgv(argv("upgrade", "/tmp/x"));
    expect(cmd.kind).toBe("error");
  });
});

describe("parseArgv — where (the worktree-debugging command)", () => {
  test("default", () => {
    expect(parseArgv(argv("where"))).toEqual({ kind: "where", json: false });
  });

  test("--json", () => {
    expect(parseArgv(argv("where", "--json"))).toEqual({
      kind: "where",
      json: true,
    });
  });

  test("positional path", () => {
    expect(parseArgv(argv("where", "/tmp/some/worktree"))).toEqual({
      kind: "where",
      dir: "/tmp/some/worktree",
      json: false,
    });
  });

  test("--dir flag", () => {
    expect(parseArgv(argv("where", "--dir", "/tmp/x", "--json"))).toEqual({
      kind: "where",
      dir: "/tmp/x",
      json: true,
    });
  });
});

describe("parseArgv — task <verb>", () => {
  test("`task` with no verb errors", () => {
    const cmd = parseArgv(argv("task"));
    expect(cmd.kind).toBe("error");
  });

  test("unknown verb errors with hint", () => {
    const cmd = parseArgv(argv("task", "frobnicate"));
    expect(cmd.kind).toBe("error");
  });

  test("task list — bare", () => {
    expect(parseArgv(argv("task", "list"))).toEqual({
      kind: "task-list",
      tags: [],
      json: false,
    });
  });

  test("task list — every filter + repeatable --tag", () => {
    expect(
      parseArgv(
        argv(
          "task",
          "list",
          "--status",
          "open",
          "--priority",
          "high",
          "--project",
          "p",
          "--epic",
          "e",
          "--sprint",
          "s",
          "--tag",
          "x",
          "--tag",
          "y",
          "--json",
        ),
      ),
    ).toEqual({
      kind: "task-list",
      status: "open",
      priority: "high",
      project: "p",
      epic: "e",
      sprint: "s",
      tags: ["x", "y"],
      json: true,
    });
  });

  test("task list — invalid status enum errors", () => {
    expect(parseArgv(argv("task", "list", "--status", "fizzbuzz")).kind).toBe(
      "error",
    );
  });

  test("task get — requires ID", () => {
    expect(parseArgv(argv("task", "get")).kind).toBe("error");
    expect(parseArgv(argv("task", "get", "TASK-001"))).toEqual({
      kind: "task-get",
      id: "TASK-001",
      json: false,
    });
  });

  test("task create — requires --title", () => {
    expect(parseArgv(argv("task", "create")).kind).toBe("error");
    expect(parseArgv(argv("task", "create", "--title", "")).kind).toBe(
      "error",
    );
  });

  test("task create — happy path with all flags", () => {
    const cmd = parseArgv(
      argv(
        "task",
        "create",
        "--title",
        "Hello",
        "--status",
        "in-progress",
        "--priority",
        "high",
        "--body",
        "body!",
        "--project",
        "p",
        "--epic",
        "e",
        "--sprint",
        "s",
        "--tag",
        "x",
        "--tag",
        "y",
        "--blocked-by",
        "T-1",
        "--related-to",
        "T-2",
        "--assignee",
        "claude",
        "--created-by",
        "human",
        "--json",
      ),
    );
    expect(cmd.kind).toBe("task-create");
    expect(cmd).toMatchObject({
      title: "Hello",
      status: "in-progress",
      priority: "high",
      body: "body!",
      project: "p",
      tags: ["x", "y"],
      blockedBy: ["T-1"],
      relatedTo: ["T-2"],
      assignee: "claude",
      createdBy: "human",
      json: true,
    });
  });

  test("task create — body sources are mutually exclusive", () => {
    expect(
      parseArgv(
        argv(
          "task",
          "create",
          "--title",
          "x",
          "--body",
          "a",
          "--body-from-stdin",
        ),
      ).kind,
    ).toBe("error");
  });

  test("task update — requires ID", () => {
    expect(parseArgv(argv("task", "update")).kind).toBe("error");
  });

  test("task update — replace tags via --tag", () => {
    const cmd = parseArgv(
      argv("task", "update", "TASK-001", "--tag", "a", "--tag", "b"),
    );
    expect(cmd.kind).toBe("task-update");
    expect(cmd).toMatchObject({
      id: "TASK-001",
      replaceTags: ["a", "b"],
      addTags: [],
      removeTags: [],
    });
  });

  test("task update — --add-tag / --remove-tag accumulate as deltas", () => {
    const cmd = parseArgv(
      argv(
        "task",
        "update",
        "TASK-001",
        "--add-tag",
        "x",
        "--add-tag",
        "y",
        "--remove-tag",
        "z",
      ),
    );
    expect(cmd).toMatchObject({
      addTags: ["x", "y"],
      removeTags: ["z"],
    });
  });

  test("task update — --clear-tags + --tag is mutually exclusive", () => {
    expect(
      parseArgv(argv("task", "update", "TASK-001", "--clear-tags", "--tag", "x"))
        .kind,
    ).toBe("error");
  });

  test("task update — --priority + --clear-priority is mutually exclusive", () => {
    expect(
      parseArgv(
        argv(
          "task",
          "update",
          "TASK-001",
          "--priority",
          "high",
          "--clear-priority",
        ),
      ).kind,
    ).toBe("error");
  });

  test("task delete — requires ID", () => {
    expect(parseArgv(argv("task", "delete")).kind).toBe("error");
    expect(parseArgv(argv("task", "delete", "TASK-001"))).toEqual({
      kind: "task-delete",
      id: "TASK-001",
    });
  });

  test("task link-ref — requires ID + ref", () => {
    expect(parseArgv(argv("task", "link-ref", "TASK-001")).kind).toBe(
      "error",
    );
    expect(parseArgv(argv("task", "link-ref", "TASK-001", "abc123"))).toEqual({
      kind: "task-link-ref",
      id: "TASK-001",
      ref: "abc123",
    });
  });

  test("task add-subtask — requires ID + text", () => {
    expect(parseArgv(argv("task", "add-subtask", "TASK-001")).kind).toBe(
      "error",
    );
    expect(
      parseArgv(argv("task", "add-subtask", "TASK-001", "do thing")),
    ).toEqual({
      kind: "task-add-subtask",
      id: "TASK-001",
      text: "do thing",
    });
  });

  test("task complete-subtask — requires --index or --text", () => {
    expect(parseArgv(argv("task", "complete-subtask", "TASK-001")).kind).toBe(
      "error",
    );
    expect(
      parseArgv(argv("task", "complete-subtask", "TASK-001", "--index", "0")),
    ).toEqual({
      kind: "task-complete-subtask",
      id: "TASK-001",
      index: 0,
      text: undefined,
    });
  });

  test("task complete-subtask — --index + --text is mutually exclusive", () => {
    expect(
      parseArgv(
        argv(
          "task",
          "complete-subtask",
          "TASK-001",
          "--index",
          "0",
          "--text",
          "match",
        ),
      ).kind,
    ).toBe("error");
  });

  test("task reorder — requires --after or --before", () => {
    expect(parseArgv(argv("task", "reorder", "TASK-001")).kind).toBe("error");
    expect(
      parseArgv(argv("task", "reorder", "TASK-001", "--after", "TASK-002")),
    ).toEqual({
      kind: "task-reorder",
      id: "TASK-001",
      afterId: "TASK-002",
      beforeId: undefined,
    });
  });
});

describe("parseArgv — plan <verb>", () => {
  test("`plan` with no verb errors", () => {
    expect(parseArgv(argv("plan")).kind).toBe("error");
  });

  test("plan list — bare and filtered", () => {
    expect(parseArgv(argv("plan", "list"))).toEqual({
      kind: "plan-list",
      tags: [],
      json: false,
    });
    expect(
      parseArgv(
        argv(
          "plan",
          "list",
          "--status",
          "active",
          "--project",
          "p",
          "--tag",
          "x",
          "--json",
        ),
      ),
    ).toEqual({
      kind: "plan-list",
      status: "active",
      project: "p",
      tags: ["x"],
      json: true,
    });
  });

  test("plan list — invalid status errors", () => {
    expect(parseArgv(argv("plan", "list", "--status", "open")).kind).toBe(
      "error",
    );
  });

  test("plan get — requires ID", () => {
    expect(parseArgv(argv("plan", "get")).kind).toBe("error");
    expect(parseArgv(argv("plan", "get", "PLAN-001"))).toEqual({
      kind: "plan-get",
      id: "PLAN-001",
      json: false,
    });
  });

  test("plan create — requires --title", () => {
    expect(parseArgv(argv("plan", "create")).kind).toBe("error");
  });

  test("plan create — happy path", () => {
    const cmd = parseArgv(
      argv(
        "plan",
        "create",
        "--title",
        "Q3",
        "--status",
        "draft",
        "--project",
        "p",
        "--tag",
        "x",
        "--task",
        "TASK-001",
        "--task",
        "TASK-002",
        "--assignee",
        "claude",
        "--json",
      ),
    );
    expect(cmd).toMatchObject({
      kind: "plan-create",
      title: "Q3",
      status: "draft",
      project: "p",
      tags: ["x"],
      tasks: ["TASK-001", "TASK-002"],
      assignee: "claude",
      json: true,
    });
  });

  test("plan update — replace tasks via --task", () => {
    const cmd = parseArgv(
      argv("plan", "update", "PLAN-001", "--task", "TASK-1", "--task", "TASK-2"),
    );
    expect(cmd).toMatchObject({
      kind: "plan-update",
      id: "PLAN-001",
      replaceTasks: ["TASK-1", "TASK-2"],
    });
  });

  test("plan update — --add-task / --remove-task as deltas", () => {
    const cmd = parseArgv(
      argv(
        "plan",
        "update",
        "PLAN-001",
        "--add-task",
        "TASK-3",
        "--remove-task",
        "TASK-9",
      ),
    );
    expect(cmd).toMatchObject({
      addTasks: ["TASK-3"],
      removeTasks: ["TASK-9"],
    });
  });

  test("plan update — --clear-tasks + --task is mutually exclusive", () => {
    expect(
      parseArgv(
        argv(
          "plan",
          "update",
          "PLAN-001",
          "--clear-tasks",
          "--task",
          "TASK-1",
        ),
      ).kind,
    ).toBe("error");
  });

  test("plan delete — requires ID", () => {
    expect(parseArgv(argv("plan", "delete")).kind).toBe("error");
  });

  test("plan link-task — needs both IDs", () => {
    expect(parseArgv(argv("plan", "link-task", "PLAN-001")).kind).toBe(
      "error",
    );
    expect(
      parseArgv(argv("plan", "link-task", "PLAN-001", "TASK-001")),
    ).toEqual({
      kind: "plan-link-task",
      planId: "PLAN-001",
      taskId: "TASK-001",
    });
  });

  test("plan cut-tasks — requires plan ID", () => {
    expect(parseArgv(argv("plan", "cut-tasks")).kind).toBe("error");
    expect(parseArgv(argv("plan", "cut-tasks", "PLAN-001"))).toEqual({
      kind: "plan-cut-tasks",
      planId: "PLAN-001",
      json: false,
    });
  });
});

describe("parseArgv — doc <verb>", () => {
  test("`doc` with no verb errors", () => {
    expect(parseArgv(argv("doc")).kind).toBe("error");
  });

  test("doc list with filters", () => {
    expect(
      parseArgv(argv("doc", "list", "--project", "p", "--tag", "x", "--json")),
    ).toEqual({
      kind: "doc-list",
      project: "p",
      tags: ["x"],
      json: true,
    });
  });

  test("doc get — requires ID", () => {
    expect(parseArgv(argv("doc", "get")).kind).toBe("error");
    expect(parseArgv(argv("doc", "get", "DOC-001"))).toEqual({
      kind: "doc-get",
      id: "DOC-001",
      json: false,
    });
  });

  test("doc create — requires --title", () => {
    expect(parseArgv(argv("doc", "create")).kind).toBe("error");
  });

  test("doc create — happy path", () => {
    const cmd = parseArgv(
      argv(
        "doc",
        "create",
        "--title",
        "Arch",
        "--project",
        "p",
        "--tag",
        "architecture",
        "--ref",
        "https://x.y/z",
        "--created-by",
        "claude",
        "--json",
      ),
    );
    expect(cmd).toMatchObject({
      kind: "doc-create",
      title: "Arch",
      project: "p",
      tags: ["architecture"],
      refs: ["https://x.y/z"],
      createdBy: "claude",
      json: true,
    });
  });

  test("doc update — replace refs via --ref", () => {
    expect(
      parseArgv(argv("doc", "update", "DOC-001", "--ref", "a", "--ref", "b")),
    ).toMatchObject({
      kind: "doc-update",
      id: "DOC-001",
      replaceRefs: ["a", "b"],
    });
  });

  test("doc update — --add-ref / --remove-ref deltas", () => {
    expect(
      parseArgv(
        argv(
          "doc",
          "update",
          "DOC-001",
          "--add-ref",
          "new",
          "--remove-ref",
          "old",
        ),
      ),
    ).toMatchObject({
      addRefs: ["new"],
      removeRefs: ["old"],
    });
  });

  test("doc update — --clear-refs is mutually exclusive with --ref", () => {
    expect(
      parseArgv(
        argv("doc", "update", "DOC-001", "--clear-refs", "--ref", "x"),
      ).kind,
    ).toBe("error");
  });

  test("doc delete — requires ID", () => {
    expect(parseArgv(argv("doc", "delete")).kind).toBe("error");
  });
});

describe("parseArgv — doctor + sync", () => {
  test("doctor — defaults", () => {
    expect(parseArgv(argv("doctor"))).toEqual({
      kind: "doctor",
      fix: false,
      json: false,
    });
  });

  test("doctor — --fix --json", () => {
    expect(parseArgv(argv("doctor", "--fix", "--json"))).toEqual({
      kind: "doctor",
      fix: true,
      json: true,
    });
  });

  test("doctor — unknown flag errors", () => {
    expect(parseArgv(argv("doctor", "--bogus")).kind).toBe("error");
  });

  test("sync — defaults", () => {
    expect(parseArgv(argv("sync"))).toEqual({
      kind: "sync",
      dryRun: false,
      push: false,
      json: false,
    });
  });

  test("sync — --dry-run --push --json", () => {
    expect(parseArgv(argv("sync", "--dry-run", "--push", "--json"))).toEqual({
      kind: "sync",
      dryRun: true,
      push: true,
      json: true,
    });
  });
});

describe("helpText", () => {
  test("top-level help mentions every known command", () => {
    const text = helpText();
    expect(text).toContain("init");
    expect(text).toContain("onboard");
    expect(text).toContain("upgrade");
    expect(text).toContain("where");
    expect(text).toContain("help");
  });

  test("subcommand help is topic-specific", () => {
    expect(helpText("where")).toContain("relay where");
    expect(helpText("init")).toContain("relay init");
    expect(helpText("onboard")).toContain("relay onboard");
    expect(helpText("upgrade")).toContain("relay upgrade");
    expect(helpText("task")).toContain("relay task");
    expect(helpText("plan")).toContain("relay plan");
    expect(helpText("doc")).toContain("relay doc");
    expect(helpText("doctor")).toContain("relay doctor");
    expect(helpText("sync")).toContain("relay sync");
  });

  test("unknown topic falls back to top-level help", () => {
    // The CLI never feeds in unknown topics today, but defending against
    // it keeps the surface predictable for a future `help <noun>` typo.
    expect(helpText("not-a-real-command")).toEqual(helpText());
  });
});
