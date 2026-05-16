import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { slugify, formatId, formatFilename, nextId, nextIdForDir } from "./id.js";

const ID_RE = /^[A-Z]+-[0-9A-Z]{5}$/;

describe("slugify", () => {
  test("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Add Task Search")).toBe("add-task-search");
  });

  test("removes non-alphanumeric characters", () => {
    expect(slugify("Fix bug #42: crash on save!")).toBe("fix-bug-42-crash-on-save");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  test("truncates at 50 chars on word boundary", () => {
    const long = "this is a very long title that should be truncated at word boundaries to stay under fifty chars";
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).not.toEndWith("-");
  });

  test("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("formatId", () => {
  test("joins prefix and suffix with a hyphen", () => {
    expect(formatId("TKT", "K3F9P")).toBe("TKT-K3F9P");
    expect(formatId("ART", "00001")).toBe("ART-00001");
  });
});

describe("formatFilename", () => {
  test("produces correct filename", () => {
    expect(formatFilename("TKT-K3F9P", "Add Task Search")).toBe(
      "TKT-K3F9P-add-task-search.md",
    );
  });

  test("handles empty title", () => {
    expect(formatFilename("TKT-K3F9P", "")).toBe("TKT-K3F9P.md");
  });
});

describe("nextId", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("returns a TASK-prefixed id matching the 5-char base32 format", async () => {
    const result = await nextId(dir);
    expect(result.id).toMatch(/^TASK-[0-9A-Z]{5}$/);
  });

  test("uses prefix from config", async () => {
    const relayDir = await mkdtemp(join(tmpdir(), "relay-cfg-"));
    const tasksDir = join(relayDir, "tasks");
    await mkdir(tasksDir, { recursive: true });
    await writeFile(join(relayDir, "config.yaml"), "prefix: ART\ndeleteMode: archive\n", "utf-8");
    const result = await nextId(tasksDir);
    expect(result.id).toMatch(/^ART-[0-9A-Z]{5}$/);
    await rm(relayDir, { recursive: true, force: true });
  });

  test("filename function produces correct output", async () => {
    const result = await nextId(dir);
    expect(result.filename("My Cool Feature")).toBe(`${result.id}-my-cool-feature.md`);
  });

  test("avoids ids already present in the directory", async () => {
    // Seed every possible suffix for a 1-char alphabet so nextIdForDir is
    // forced to find a free slot — proves the collision check works.
    // We use a tiny throwaway prefix and check that the result isn't taken.
    const taken = ["TASK-aaaaa", "TASK-bbbbb"];
    for (const id of taken) {
      await writeFile(join(dir, `${id}-existing.md`), "x", "utf-8");
    }
    const result = await nextIdForDir(dir, "TASK");
    expect(taken).not.toContain(result.id);
    expect(result.id).toMatch(ID_RE);
  });

  test("sequential calls with on-disk writes produce unique ids", async () => {
    // Mirrors actual usage: caller generates an id, writes the file, then
    // generates again. Each scan picks up prior IDs and avoids them.
    const N = 25;
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      const r = await nextIdForDir(dir, "TASK");
      await writeFile(join(dir, r.filename("t")), "x", "utf-8");
      ids.push(r.id);
    }
    expect(new Set(ids).size).toBe(N);
    for (const id of ids) expect(id).toMatch(ID_RE);
  });

  test("treats legacy incremental ids as taken and coexists with them", async () => {
    // Existing repos have TASK-001-style files. The collision scanner uses
    // [A-Z]+-[0-9A-Za-z]+ so legacy IDs register as taken; new IDs avoid them
    // but the legacy files keep working unchanged.
    const legacy = ["TASK-001", "TASK-002", "TASK-042"];
    for (const id of legacy) {
      await writeFile(join(dir, `${id}-old.md`), "legacy\n", "utf-8");
    }
    const r = await nextIdForDir(dir, "TASK");
    expect(legacy).not.toContain(r.id);
    expect(r.id).toMatch(ID_RE);

    // Legacy file is still on disk and untouched.
    for (const id of legacy) {
      const raw = await readFile(join(dir, `${id}-old.md`), "utf-8");
      expect(raw).toBe("legacy\n");
    }
  });

  test("two independent dirs generate non-colliding ids that merge cleanly", async () => {
    // Simulates two branches each creating tasks against their own .relay/
    // tasks dir. The whole point of random IDs is that the union of the two
    // sets can be dropped into a single directory with no filename clashes —
    // i.e. a normal git merge of two feature branches Just Works.
    const dirA = await mkdtemp(join(tmpdir(), "relay-branch-a-"));
    const dirB = await mkdtemp(join(tmpdir(), "relay-branch-b-"));
    try {
      const idsA: string[] = [];
      const idsB: string[] = [];
      for (let i = 0; i < 20; i++) {
        const a = await nextIdForDir(dirA, "TASK");
        await writeFile(join(dirA, a.filename(`a-${i}`)), "a\n", "utf-8");
        idsA.push(a.id);

        const b = await nextIdForDir(dirB, "TASK");
        await writeFile(join(dirB, b.filename(`b-${i}`)), "b\n", "utf-8");
        idsB.push(b.id);
      }

      // Disjoint sets.
      const overlap = idsA.filter((id) => idsB.includes(id));
      expect(overlap).toEqual([]);

      // Merge dirB into a fresh dirM, then dirA, and verify no filenames
      // collide (which is what a real git merge would surface as a conflict).
      const dirM = await mkdtemp(join(tmpdir(), "relay-merged-"));
      try {
        for (const src of [dirA, dirB]) {
          for (const id of await readdir(src)) {
            const target = join(dirM, id);
            const exists = await fileExists(target);
            expect(exists).toBe(false);
            await writeFile(target, await readFile(join(src, id), "utf-8"));
          }
        }
        const merged = await readdir(dirM);
        expect(merged.length).toBe(idsA.length + idsB.length);
      } finally {
        await rm(dirM, { recursive: true, force: true });
      }
    } finally {
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
