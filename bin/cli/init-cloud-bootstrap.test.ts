import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addRelayCloudBootstrap,
  RELAY_BOOTSTRAP_COMMAND,
} from "./init-cloud-bootstrap.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "relay-init-bootstrap-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("addRelayCloudBootstrap", () => {
  test("creates .claude/settings.json with the SessionStart hook when missing", async () => {
    const result = await addRelayCloudBootstrap(dir);
    expect(result.action).toBe("created");
    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks.SessionStart).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: RELAY_BOOTSTRAP_COMMAND,
          },
        ],
      },
    ]);
  });

  test("appends to an existing settings.json without clobbering other keys", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({
        theme: "dark",
        permissions: { allow: ["Bash(relay *)"] },
      }),
    );

    const result = await addRelayCloudBootstrap(dir);
    expect(result.action).toBe("added");

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.theme).toBe("dark");
    expect(settings.permissions.allow).toEqual(["Bash(relay *)"]);
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  test("preserves existing SessionStart entries and other hook events", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: "command", command: "echo hi" }],
            },
          ],
          Stop: [{ hooks: [{ type: "command", command: "echo bye" }] }],
        },
      }),
    );

    const result = await addRelayCloudBootstrap(dir);
    expect(result.action).toBe("added");

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("echo hi");
    expect(settings.hooks.SessionStart[1].hooks[0].command).toBe(
      RELAY_BOOTSTRAP_COMMAND,
    );
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("echo bye");
  });

  test("is idempotent when the bootstrap entry is already present", async () => {
    await addRelayCloudBootstrap(dir);
    const result = await addRelayCloudBootstrap(dir);
    expect(result.action).toBe("already-present");

    const settings = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    // No duplicate.
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  test("idempotent even when our entry is nested alongside other entries", async () => {
    // First add some unrelated hook, then ours, then ours again — we should
    // detect the dupe across the multi-entry array.
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "echo hi" }] },
            {
              hooks: [
                { type: "command", command: RELAY_BOOTSTRAP_COMMAND },
              ],
            },
          ],
        },
      }),
    );

    const result = await addRelayCloudBootstrap(dir);
    expect(result.action).toBe("already-present");
  });

  test("rejects a malformed (non-object) settings.json", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      JSON.stringify(["array, not object"]),
    );

    await expect(addRelayCloudBootstrap(dir)).rejects.toThrow(
      /not a JSON object/,
    );
  });
});
