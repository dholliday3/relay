import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { TicketbookConfigSchema } from "./schema.js";
import type { TicketbookConfig } from "./types.js";
import { atomicWriteFile } from "./atomic.js";

const CONFIG_FILENAME = "config.yaml";

function configPath(dir: string): string {
  return join(dir, CONFIG_FILENAME);
}

export async function getConfig(dir: string): Promise<TicketbookConfig> {
  try {
    const raw = await readFile(configPath(dir), "utf-8");
    const parsed = parse(raw);
    return TicketbookConfigSchema.parse(parsed ?? {});
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return TicketbookConfigSchema.parse({});
    }
    throw err;
  }
}

export async function updateConfig(
  dir: string,
  patch: Partial<TicketbookConfig>,
): Promise<TicketbookConfig> {
  const current = await getConfig(dir);
  const merged = { ...current, ...patch };
  const config = TicketbookConfigSchema.parse(merged);

  await mkdir(dir, { recursive: true });
  await atomicWriteFile(configPath(dir), stringify(config));

  return config;
}
