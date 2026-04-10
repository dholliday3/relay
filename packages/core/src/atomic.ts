import { writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";

/**
 * Write a file atomically: write to a temp file in the same directory,
 * then rename into place. Prevents partial/corrupt files on crash.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tmp = filePath + `.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, filePath);
}
