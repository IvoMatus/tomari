import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildPanelHooks } from "./hooks-config.ts";
import { hooksInstalled, previewHooks, writeHooks } from "./settings.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A workspace settings file like cenco's: permissions and a codegraph UserPromptSubmit hook. */
function workspace() {
  const dir = mkdtempSync(`${tmpdir()}/perch-settings-`);
  dirs.push(dir);
  const codegraph = { hooks: [{ type: "command", command: "codegraph prompt-hook" }] };
  const settings = { permissions: { allow: ["mcp__codegraph__*"] }, hooks: { UserPromptSubmit: [codegraph] } };
  writeFileSync(`${dir}/settings.json`, JSON.stringify(settings, null, 2) + "\n");
  return { path: `${dir}/settings.json`, backups: `${dir}/backups`, original: readFileSync(`${dir}/settings.json`, "utf8"), codegraph };
}

test("preview shows the merged file without writing it", async () => {
  const w = workspace();
  const preview = JSON.parse(await previewHooks({ install: true }, w.path));
  expect(preview.hooks.UserPromptSubmit).toEqual([w.codegraph, ...buildPanelHooks().UserPromptSubmit!]);
  expect(readFileSync(w.path, "utf8")).toBe(w.original);
});

test("install backs the file up, keeps the existing hooks and settings, and is idempotent", async () => {
  const w = workspace();
  const first = await writeHooks({ install: true }, w.path, w.backups);
  expect(first.changed).toBe(true);
  expect(readFileSync(first.backup!, "utf8")).toBe(w.original);

  const written = JSON.parse(readFileSync(w.path, "utf8"));
  expect(written.permissions).toEqual({ allow: ["mcp__codegraph__*"] });
  expect(written.hooks.UserPromptSubmit[0]).toEqual(w.codegraph);
  expect(await hooksInstalled(w.path)).toBe(true);

  expect(await writeHooks({ install: true }, w.path, w.backups)).toEqual({ changed: false, backup: null });
  expect(readdirSync(w.backups)).toHaveLength(1);
});

test("remove gives back the original file", async () => {
  const w = workspace();
  await writeHooks({ install: true }, w.path, w.backups);
  await writeHooks({ install: false }, w.path, w.backups);
  expect(readFileSync(w.path, "utf8")).toBe(w.original);
  expect(await hooksInstalled(w.path)).toBe(false);
});
