/**
 * The color Claude Code shows for a session, so its creature can wear it: the session's own
 * `/color`, else the `color:` of the agent it runs (`claude --agent composer`). Both come from
 * Claude Code's internal files: ~/.claude/sessions/<pid>.json names the agent, and the session's
 * transcript records each `/color`. If their format changes, creatures keep the default color.
 */
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import type { SessionHub } from "./hub.ts";

const HOME = homedir();

/** Claude Code's color names, mapped to Perch's palette; red isn't in the strip's menu. */
export const CLAUDE_COLORS: Record<string, string> = {
  red: "#ff4d4d",
  orange: "#ff6b1a",
  yellow: "#ffd23f",
  green: "#4cd964",
  cyan: "#3ccfe6",
  blue: "#4f7cff",
  purple: "#a66cff",
  pink: "#ff5fa2",
};

const toHex = (name: unknown) => (typeof name === "string" ? (CLAUDE_COLORS[name.trim().toLowerCase()] ?? null) : null);

/** `color:` in an agent definition's YAML frontmatter, as a hex color. */
export function frontmatterColor(markdown: string): string | null {
  const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  return toHex(front.match(/^color:\s*["']?([A-Za-z]+)["']?\s*$/m)?.[1]);
}

/** The last `/color` in some transcript lines: its hex, null for none (e.g. `/color default`), undefined when there is no `/color` at all. */
export function lastSessionColor(lines: string): string | null | undefined {
  let last: string | null | undefined;
  for (const line of lines.split("\n")) {
    if (!line.includes('"agent-color"')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.type === "agent-color") last = toHex(entry.agentColor);
    } catch {
      // Not a whole JSON line: skip it.
    }
  }
  return last;
}

const AGENT_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** The color of the agent definition for `agent`: in .claude/agents of `cwd` or a parent, then of `home`. */
export async function agentColor(agent: string, cwd: string, home = HOME): Promise<string | null> {
  if (!AGENT_NAME.test(agent)) return null;
  const dirs = new Set<string>();
  for (let dir = cwd; !dirs.has(dir); dir = dirname(dir)) dirs.add(dir);
  dirs.add(home);
  for (const dir of dirs) {
    const file = Bun.file(`${dir}/.claude/agents/${agent}.md`);
    if (await file.exists()) return frontmatterColor(await file.text());
  }
  return null;
}

/** Claude Code's folder name for a project under ~/.claude/projects. */
export const projectSlug = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, "-");

export class ClaudeColors {
  /** Per session: how far its transcript has been read, and the last `/color` found. */
  private transcripts = new Map<string, { offset: number; color: string | null | undefined }>();

  constructor(private dirs = { home: HOME, sessions: `${HOME}/.claude/sessions`, projects: `${HOME}/.claude/projects` }) {}

  /** Claude's color for the session whose Claude process is `pid`; null when it has none. */
  async of(sessionId: string, pid: number): Promise<string | null> {
    const info = await Bun.file(`${this.dirs.sessions}/${pid}.json`)
      .json()
      .catch(() => null);
    if (info?.pid !== pid || typeof info.cwd !== "string") return null;
    const own = await this.transcriptColor(sessionId, `${this.dirs.projects}/${projectSlug(info.cwd)}/${sessionId}.jsonl`);
    if (own) return own;
    return typeof info.agent === "string" ? agentColor(info.agent, info.cwd, this.dirs.home) : null;
  }

  /** Forgets the transcripts of sessions that are no longer running. */
  keep(sessionIds: string[]) {
    const running = new Set(sessionIds);
    for (const id of this.transcripts.keys()) if (!running.has(id)) this.transcripts.delete(id);
  }

  /** Reads only what was appended since the last call, in whole lines. */
  private async transcriptColor(sessionId: string, path: string): Promise<string | null> {
    const seen = this.transcripts.get(sessionId) ?? { offset: 0, color: undefined };
    const size = await stat(path).then((s) => s.size, () => 0);
    if (size < seen.offset) Object.assign(seen, { offset: 0, color: undefined }); // rewritten
    if (size > seen.offset) {
      const bytes = new Uint8Array(await Bun.file(path).slice(seen.offset, size).arrayBuffer());
      const end = bytes.lastIndexOf(10) + 1; // a line still being written is read next time
      const found = lastSessionColor(new TextDecoder().decode(bytes.subarray(0, end)));
      if (found !== undefined) seen.color = found;
      seen.offset += end;
    }
    this.transcripts.set(sessionId, seen);
    return seen.color ?? null;
  }
}

/** Every `intervalMs`, gives each running session Claude's color. Returns a stop function. */
export function startColorWatcher(
  hub: Pick<SessionHub, "processes" | "setClaudeColor">,
  { intervalMs = 3000, colors = new ClaudeColors() }: { intervalMs?: number; colors?: Pick<ClaudeColors, "of" | "keep"> } = {},
) {
  let stopped = false;
  let lastError = "";

  (async () => {
    while (!stopped) {
      const sessions = hub.processes();
      for (const { id, pid } of sessions) {
        try {
          hub.setClaudeColor(id, await colors.of(id, pid));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message !== lastError) console.error(`color lookup failed: ${message}`);
          lastError = message;
        }
      }
      colors.keep(sessions.map((s) => s.id));
      await Bun.sleep(intervalMs);
    }
  })();

  return () => {
    stopped = true;
  };
}
