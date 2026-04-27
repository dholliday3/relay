import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRelayAllowlist } from "./init-allowlist.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-init-allow-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("addRelayAllowlist", () => {
  test("creates .claude/settings.json when missing", async () => {
    const result = await addRelayAllowlist(dir);
    expect(result.action).toBe("created");
    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.permissions.allow).toEqual(["Bash(relay *)"]);
  });

  test("adds the entry to an existing settings.json without clobbering other keys", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({
        theme: "dark",
        permissions: { allow: ["Bash(git *)"] },
      }),
    );

    const result = await addRelayAllowlist(dir);
    expect(result.action).toBe("added");

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.theme).toBe("dark"); // preserved
    expect(settings.permissions.allow).toEqual([
      "Bash(git *)",
      "Bash(relay *)",
    ]);
  });

  test("is idempotent when the entry is already present", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(relay *)"] } }),
    );

    const result = await addRelayAllowlist(dir);
    expect(result.action).toBe("already-present");

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    // No duplicates.
    expect(settings.permissions.allow.filter((s: string) => s === "Bash(relay *)"))
      .toHaveLength(1);
  });

  test("creates permissions.allow when settings.json exists but has no permissions", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({ theme: "light" }),
    );

    const result = await addRelayAllowlist(dir);
    expect(result.action).toBe("added");

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.theme).toBe("light");
    expect(settings.permissions.allow).toEqual(["Bash(relay *)"]);
  });

  test("rejects a malformed (non-object) settings.json", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify(["this is an array, not an object"]),
    );

    await expect(addRelayAllowlist(dir)).rejects.toThrow(
      /not a JSON object/,
    );
  });
});
