/**
 * Sessions in the Claude desktop app. The app keeps a session's id for as long as it lists it,
 * and stops its process while it sits idle, so the + menu also offers sessions that aren't
 * running: pinning one adopts it from the app's metadata.
 */
import { basename } from "node:path";
import type { LibraryEntry } from "../../shared/protocol.ts";
import { watchDesktopFocus } from "./desktop-focus.ts";
import { openSession, type OpenResult as DesktopOpenResult } from "./desktop-open.ts";
import { listDesktopSessions, type DesktopSession } from "./desktop-sessions.ts";
import { LIBRARY_SIZE, type SessionHost } from "./host.ts";
import type { SessionHub } from "./hub.ts";
import type { AgentEntry } from "./state.ts";
import { claudeAgents } from "./workspace-sessions.ts";

/** Replaceable so tests don't open real sessions or read the real desktop app. */
export interface DesktopDeps {
  list?: () => Promise<AgentEntry[]>;
  desktopSessions?: () => Promise<DesktopSession[]>;
  open?: (sessionId: string, cwd?: string) => Promise<DesktopOpenResult>;
  watch?: (onFocus: (sessionId: string | null) => void) => () => void;
}

export function desktopHost(
  hub: SessionHub,
  { list = claudeAgents, desktopSessions = () => listDesktopSessions(), open = openSession, watch = watchDesktopFocus }: DesktopDeps = {},
): SessionHost {
  return {
    id: "desktop",
    reopensUnderNewId: false,
    sessions: list,

    async open(sessionId) {
      const result = await open(sessionId, hub.get(sessionId)?.cwd);
      // The desktop log confirms focus a moment later; the caller shows it right away.
      return result.ok ? { focused: true } : { focused: false, message: result.error };
    },

    followFocus: () => watch((id) => hub.setFocused(id)),

    async library(): Promise<LibraryEntry[]> {
      return (await desktopSessions())
        .filter((s) => !s.archived)
        .slice(0, LIBRARY_SIZE)
        .map((s) => ({
          id: s.sessionId,
          name: s.title ?? hub.get(s.sessionId)?.name ?? basename(s.cwd),
          cwd: s.cwd,
          lastActivityAt: s.lastActivityAt,
          pinned: hub.get(s.sessionId)?.pinned ?? false,
        }));
    },

    async adopt(sessionId) {
      const session = (await desktopSessions()).find((s) => s.sessionId === sessionId);
      if (session) hub.adopt(session.sessionId, session.title, session.cwd, session.lastActivityAt);
    },
  };
}
