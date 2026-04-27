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
  });

  test("unknown topic falls back to top-level help", () => {
    // The CLI never feeds in unknown topics today, but defending against
    // it keeps the surface predictable for a future `help <noun>` typo.
    expect(helpText("not-a-real-command")).toEqual(helpText());
  });
});
