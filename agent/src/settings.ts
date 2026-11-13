import { copyFile, mkdir } from "node:fs/promises";
import { BACKUP_DIR } from "./config.ts";
import { hasPanelHooks, mergeHooks, type Settings } from "./hooks-config.ts";

async function readSettings(path: string): Promise<Settings> {
  const file = Bun.file(path);
  return (await file.exists()) ? await file.json() : {};
}

/** The settings file as it would be with our hooks added (`install`) or removed. */
export async function previewHooks({ install }: { install: boolean }, path: string): Promise<string> {
  return JSON.stringify(mergeHooks(await readSettings(path), { install }), null, 2) + "\n";
}

/**
 * Adds or removes our hooks in the Claude Code settings file at `path`, copying the file into
 * BACKUP_DIR first. Writes nothing when the hooks are already as asked.
 */
export async function writeHooks(
  { install }: { install: boolean },
  path: string,
  backupDir = BACKUP_DIR,
): Promise<{ changed: boolean; backup: string | null }> {
  const exists = await Bun.file(path).exists();
  const before = await readSettings(path);
  const after = mergeHooks(before, { install });
  if (JSON.stringify(after) === JSON.stringify(before)) return { changed: false, backup: null };
  let backup: string | null = null;
  if (exists) {
    await mkdir(backupDir, { recursive: true });
    backup = `${backupDir}/settings.json.${Date.now()}`;
    await copyFile(path, backup);
  }
  await Bun.write(path, JSON.stringify(after, null, 2) + "\n");
  return { changed: true, backup };
}

export async function hooksInstalled(path: string) {
  return hasPanelHooks(await readSettings(path));
}
