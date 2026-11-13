/**
 * Brings a session's panel to the front in Ghostty: the terminal whose tty matches the session's
 * Claude process or one of its ancestors. When no panel matches, or the session isn't running,
 * it only activates Ghostty. It never starts, resumes or types into a session.
 */
import { focusPanel, processTable, ttyChain, type ProcessTable } from "./ghostty.ts";

export type OpenResult = { ok: true; focused: boolean } | { ok: false; error: string };

export interface OpenDeps {
  table?: () => Promise<ProcessTable>;
  focus?: (ttys: string[]) => Promise<boolean>;
}

/** `pid` is the session's Claude process, null when it isn't running. */
export async function openSession(pid: number | null, { table = processTable, focus = focusPanel }: OpenDeps = {}): Promise<OpenResult> {
  try {
    const ttys = pid === null ? [] : ttyChain(pid, await table());
    return { ok: true, focused: await focus(ttys) };
  } catch (error) {
    return { ok: false, error: `Ghostty: ${error instanceof Error ? error.message : String(error)}` };
  }
}
