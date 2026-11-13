/**
 * Running Claude Code sessions from `claude agents --json` (documented), limited to the
 * workspace. The poller feeds them to the hub and the + menu lists them, so sessions started
 * elsewhere (background helpers, other projects) never reach the strip.
 */
import { $ } from "bun";
import { WORKSPACE } from "./config.ts";
import type { AgentEntry } from "./state.ts";

export type AgentLister = () => Promise<AgentEntry[]>;

export const claudeAgents: AgentLister = () => $`claude agents --json`.quiet().json();

/** True when `cwd` is `root` itself or a folder inside it. */
export function isInside(cwd: string, root: string) {
  const base = root.replace(/\/+$/, "");
  return cwd === base || cwd.startsWith(`${base}/`);
}

export async function workspaceAgents(root = WORKSPACE, list: AgentLister = claudeAgents): Promise<AgentEntry[]> {
  return (await list()).filter((agent) => typeof agent.cwd === "string" && isInside(agent.cwd, root));
}
