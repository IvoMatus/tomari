import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { agentColor, CLAUDE_COLORS, ClaudeColors, frontmatterColor, lastSessionColor, projectSlug, startColorWatcher } from "./claude-colors.ts";

const ID = "313e8dd0-5234-4f5a-8e5f-95e87c5ab909";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const agentFile = (name: string, color: string) => `---\nname: ${name}\ndescription: x\ncolor: ${color}\n---\n\nBody with color: blue in the text.\n`;
const colorLine = (color: string) => JSON.stringify({ type: "agent-color", agentColor: color, sessionId: ID }) + "\n";

/** A fake home: one workspace with agents, Claude's session files and transcripts. */
function home() {
  const root = mkdtempSync(`${tmpdir()}/perch-colors-`);
  dirs.push(root);
  const workspace = `${root}/cenco`;
  mkdirSync(`${workspace}/.claude/agents`, { recursive: true });
  mkdirSync(`${root}/.claude/sessions`, { recursive: true });
  mkdirSync(`${root}/.claude/projects/${projectSlug(workspace)}`, { recursive: true });
  writeFileSync(`${workspace}/.claude/agents/composer.md`, agentFile("composer", "red"));
  const transcript = `${root}/.claude/projects/${projectSlug(workspace)}/${ID}.jsonl`;
  writeFileSync(transcript, JSON.stringify({ type: "user", message: { content: "¿qué tal? ñandú 🚀" } }) + "\n");
  const session = (agent?: string) =>
    writeFileSync(`${root}/.claude/sessions/4242.json`, JSON.stringify({ pid: 4242, sessionId: ID, cwd: workspace, ...(agent ? { agent } : {}) }));
  const colors = new ClaudeColors({ home: root, sessions: `${root}/.claude/sessions`, projects: `${root}/.claude/projects` });
  return { root, workspace, transcript, session, colors };
}

describe("reading Claude's colors", () => {
  test("an agent definition's color, only from its frontmatter", () => {
    expect(frontmatterColor(agentFile("composer", "red"))).toBe(CLAUDE_COLORS.red!);
    expect(frontmatterColor(agentFile("x", '"Cyan"'))).toBe(CLAUDE_COLORS.cyan!);
    expect(frontmatterColor(agentFile("x", "chartreuse"))).toBeNull();
    expect(frontmatterColor("---\nname: x\n---\ncolor: blue\n")).toBeNull();
    expect(frontmatterColor("no frontmatter")).toBeNull();
  });

  test("the last /color in a transcript wins; `default` clears it", () => {
    expect(lastSessionColor(colorLine("cyan") + colorLine("pink"))).toBe(CLAUDE_COLORS.pink!);
    expect(lastSessionColor(colorLine("cyan") + colorLine("default"))).toBeNull();
    expect(lastSessionColor('{"type":"user"}\n{"type":"agent-color", broken\n')).toBeUndefined();
  });

  test("agents are looked up in the session's folder, its parents, then the home folder", async () => {
    const { root, workspace } = home();
    mkdirSync(`${root}/.claude/agents`, { recursive: true });
    writeFileSync(`${root}/.claude/agents/global.md`, agentFile("global", "purple"));
    mkdirSync(`${workspace}/front`);
    expect(await agentColor("composer", `${workspace}/front`, root)).toBe(CLAUDE_COLORS.red!);
    expect(await agentColor("global", workspace, root)).toBe(CLAUDE_COLORS.purple!);
    expect(await agentColor("missing", workspace, root)).toBeNull();
    expect(await agentColor("../../etc/passwd", workspace, root)).toBeNull();
  });
});

describe("ClaudeColors.of", () => {
  test("the agent's color, until the session sets its own with /color", async () => {
    const { transcript, session, colors } = home();
    session("composer");
    expect(await colors.of(ID, 4242)).toBe(CLAUDE_COLORS.red!);

    appendFileSync(transcript, colorLine("blue"));
    expect(await colors.of(ID, 4242)).toBe(CLAUDE_COLORS.blue!);

    appendFileSync(transcript, colorLine("default"));
    expect(await colors.of(ID, 4242)).toBe(CLAUDE_COLORS.red!);
  });

  test("a /color still being written is read once its line is complete", async () => {
    const { transcript, session, colors } = home();
    session();
    const line = colorLine("green");
    appendFileSync(transcript, line.slice(0, 20));
    expect(await colors.of(ID, 4242)).toBeNull();
    appendFileSync(transcript, line.slice(20));
    expect(await colors.of(ID, 4242)).toBe(CLAUDE_COLORS.green!);
  });

  test("no session file, a different process, or no color at all give null", async () => {
    const { root, session, colors } = home();
    expect(await colors.of(ID, 4242)).toBeNull();
    session();
    expect(await colors.of(ID, 4242)).toBeNull();
    writeFileSync(`${root}/.claude/sessions/5555.json`, JSON.stringify({ pid: 4242, cwd: "/x", agent: "composer" }));
    expect(await colors.of(ID, 5555)).toBeNull();
  });
});

test("the watcher gives each running session its color and forgets the rest", async () => {
  const given: [string, string | null][] = [];
  let kept: string[] = [];
  const stop = startColorWatcher(
    { processes: () => [{ id: ID, pid: 4242 }], setClaudeColor: (id, color) => void given.push([id, color]) },
    { intervalMs: 10, colors: { of: async () => CLAUDE_COLORS.cyan!, keep: (ids) => void (kept = ids) } },
  );
  await Bun.sleep(5);
  stop();
  expect(given[0]).toEqual([ID, CLAUDE_COLORS.cyan!]);
  expect(kept).toEqual([ID]);
});
