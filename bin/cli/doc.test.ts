import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runDocList,
  runDocGet,
  runDocCreate,
  runDocUpdate,
  runDocDelete,
  type DocCtx,
} from "./doc.ts";

let dir: string;
let ctx: DocCtx;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-doc-cli-"));
  await mkdir(join(dir, "docs"), { recursive: true });
  await writeFile(join(dir, "config.yaml"), "prefix: TASK\ndocPrefix: DOC\n");
  ctx = { rootDir: dir, docsDir: join(dir, "docs") };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("doc create + read", () => {
  test("happy path with all major fields", async () => {
    const result = await runDocCreate(
      {
        kind: "doc-create",
        title: "Auth architecture",
        body: "# Auth\n\nstuff",
        bodyFromStdin: false,
        project: "demo",
        tags: ["architecture", "auth"],
        refs: ["https://x.y/z"],
        createdBy: "claude",
        json: true,
      },
      ctx,
    );
    expect(result.exitCode).toBe(0);
    const d = JSON.parse(result.stdout!);
    expect(d.id).toBe("DOC-001");
    expect(d.title).toBe("Auth architecture");
    expect(d.tags).toEqual(["architecture", "auth"]);
    expect(d.refs).toEqual(["https://x.y/z"]);
    expect(d.body).toContain("# Auth");
  });

  test("--body-from-stdin reads injected stdin", async () => {
    const result = await runDocCreate(
      {
        kind: "doc-create",
        title: "Stdin",
        bodyFromStdin: true,
        tags: [],
        refs: [],
        json: true,
      },
      { ...ctx, readStdin: async () => "piped doc" },
    );
    expect(JSON.parse(result.stdout!).body).toBe("piped doc");
  });
});

describe("doc list", () => {
  test("filters narrow the result set", async () => {
    await runDocCreate(
      {
        kind: "doc-create",
        title: "Architecture",
        bodyFromStdin: false,
        tags: ["architecture"],
        refs: [],
        json: false,
      },
      ctx,
    );
    await runDocCreate(
      {
        kind: "doc-create",
        title: "Onboarding",
        bodyFromStdin: false,
        tags: ["onboarding"],
        refs: [],
        json: false,
      },
      ctx,
    );

    const arch = await runDocList(
      { kind: "doc-list", tags: ["architecture"], json: true },
      ctx,
    );
    const parsed = JSON.parse(arch.stdout!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Architecture");
  });
});

describe("doc update", () => {
  beforeEach(async () => {
    await runDocCreate(
      {
        kind: "doc-create",
        title: "Original",
        bodyFromStdin: false,
        tags: ["one", "two"],
        refs: ["ref-a"],
        json: false,
      },
      ctx,
    );
  });

  test("--add-ref / --remove-ref operate as deltas", async () => {
    const result = await runDocUpdate(
      {
        kind: "doc-update",
        id: "DOC-001",
        bodyFromStdin: false,
        clearProject: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addRefs: ["ref-b"],
        removeRefs: ["ref-a"],
        clearRefs: false,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    expect(JSON.parse(result.stdout!).refs).toEqual(["ref-b"]);
  });

  test("--clear-refs empties the refs list", async () => {
    const result = await runDocUpdate(
      {
        kind: "doc-update",
        id: "DOC-001",
        bodyFromStdin: false,
        clearProject: false,
        addTags: [],
        removeTags: [],
        clearTags: false,
        addRefs: [],
        removeRefs: [],
        clearRefs: true,
        clearCreatedBy: false,
        json: true,
      },
      ctx,
    );
    const updated = JSON.parse(result.stdout!);
    expect(updated.refs === undefined || updated.refs.length === 0).toBe(true);
  });
});

describe("doc get / delete", () => {
  test("get returns 1 for unknown ID", async () => {
    const result = await runDocGet(
      { kind: "doc-get", id: "DOC-999", json: false },
      ctx,
    );
    expect(result.exitCode).toBe(1);
  });

  test("delete + re-delete is reported", async () => {
    await runDocCreate(
      {
        kind: "doc-create",
        title: "doomed",
        bodyFromStdin: false,
        tags: [],
        refs: [],
        json: false,
      },
      ctx,
    );
    expect(
      (await runDocDelete({ kind: "doc-delete", id: "DOC-001" }, ctx)).exitCode,
    ).toBe(0);
    expect(
      (await runDocDelete({ kind: "doc-delete", id: "DOC-001" }, ctx)).exitCode,
    ).toBe(1);
  });
});
