import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { claudeSettings, saveHost, savedHost, WORKSPACE } from "./config.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function configFile(content?: object) {
  const dir = mkdtempSync(`${tmpdir()}/tomari-config-`);
  dirs.push(dir);
  const path = `${dir}/config.json`;
  if (content) writeFileSync(path, JSON.stringify(content));
  return path;
}

test("without a saved host, or with one it doesn't know, the agent uses the Claude app", async () => {
  expect(await savedHost(configFile())).toBe("desktop");
  expect(await savedHost(configFile({ token: "t" }))).toBe("desktop");
  expect(await savedHost(configFile({ token: "t", host: "iterm" }))).toBe("desktop");
  expect(await savedHost(configFile({ token: "t", host: "ghostty" }))).toBe("ghostty");
});

test("saving the host keeps the token and the file private", async () => {
  const path = configFile({ token: "s3cret" });
  await saveHost("ghostty", path);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ token: "s3cret", host: "ghostty" });
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(await savedHost(path)).toBe("ghostty");
});

test("the hooks live in the user's settings for the app, and in the workspace's for Ghostty", () => {
  expect(claudeSettings("desktop")).toBe(`${homedir()}/.claude/settings.json`);
  expect(claudeSettings("ghostty")).toBe(`${WORKSPACE}/.claude/settings.json`);
});
