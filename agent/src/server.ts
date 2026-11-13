/**
 * Two servers: hooks on loopback only, and the panel WebSocket behind the pairing token,
 * on loopback unless a Pi needs it on the network. Keeping them apart means the
 * network-facing port can never inject hook events.
 */
import { timingSafeEqual } from "node:crypto";
import type { LibraryEntry, ServerMessage } from "../../shared/protocol.ts";
import type { SessionHub } from "./hub.ts";
import { openSession, type OpenResult } from "./open-session.ts";
import { parseClientMessage } from "./protocol-guard.ts";
import type { AgentEntry, HookEvent } from "./state.ts";
import { workspaceAgents } from "./workspace-sessions.ts";

export interface ServerOptions {
  hub: SessionHub;
  token: string;
  hookPort: number;
  panelPort: number;
  panelHost?: string;
  /** Replaceable so tests don't touch Ghostty or run `claude agents`. */
  open?: (pid: number | null) => Promise<OpenResult>;
  liveSessions?: () => Promise<AgentEntry[]>;
}

const TOPIC = "panel";
const LIBRARY_SIZE = 100;

export function startServers({
  hub,
  token,
  hookPort,
  panelPort,
  panelHost = "127.0.0.1",
  open = (pid) => openSession(pid),
  liveSessions = () => workspaceAgents(),
}: ServerOptions) {
  /** The workspace's running sessions, fresh from `claude agents`; the hub takes them in first, so each one can be pinned. */
  async function library(): Promise<LibraryEntry[]> {
    const agents = await liveSessions();
    hub.handleAgents(agents);
    return agents
      .flatMap((agent) => {
        const s = hub.get(agent.sessionId);
        return s ? [{ id: s.id, name: s.name, cwd: s.cwd, lastActivityAt: s.stateSince, pinned: s.pinned }] : [];
      })
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .slice(0, LIBRARY_SIZE);
  }

  const hookServer = Bun.serve({
    hostname: "127.0.0.1",
    port: hookPort,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (req.method !== "POST" || pathname !== "/hook") return new Response("not found", { status: 404 });
      try {
        const event = (await req.json()) as HookEvent;
        if (typeof event?.session_id === "string" && typeof event.hook_event_name === "string") hub.handleHook(event);
      } catch {
        return new Response("bad json", { status: 400 });
      }
      return new Response(null, { status: 204 }); // an empty 2xx tells Claude Code "no decision"
    },
  });

  const panelServer = Bun.serve({
    hostname: panelHost,
    port: panelPort,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/health") return Response.json({ ok: true, sessions: hub.snapshot().length });
      if (url.pathname !== "/ws") return new Response("not found", { status: 404 });
      if (!sameSecret(url.searchParams.get("token"), token)) return new Response("unauthorized", { status: 401 });
      if (server.upgrade(req)) return;
      return new Response("expected a WebSocket", { status: 400 });
    },
    websocket: {
      maxPayloadLength: 4 * 1024,
      open(ws) {
        ws.subscribe(TOPIC);
        send(ws, { type: "snapshot", sessions: hub.snapshot(), focusedId: hub.focusedId });
      },
      async message(ws, raw) {
        const msg = parseClientMessage(String(raw));
        if (!msg) return send(ws, { type: "error", message: "invalid message" });
        if (msg.type === "library") {
          const sessions = await library().catch((err) => {
            send(ws, { type: "error", message: `claude agents failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200) });
            return null;
          });
          return sessions && send(ws, { type: "library", sessions });
        }
        if (!hub.has(msg.id)) return send(ws, { type: "error", message: "unknown session" });

        switch (msg.type) {
          case "open": {
            const result = await open(hub.pidOf(msg.id));
            // The Ghostty watcher confirms focus within a second; show it right away.
            if (!result.ok) send(ws, { type: "error", message: result.error });
            else if (result.focused) hub.setFocused(msg.id);
            else send(ws, { type: "error", message: hub.get(msg.id)?.live ? "no Ghostty panel found; showed Ghostty" : "not running; showed Ghostty" });
            break;
          }
          case "pin":
            hub.setPinned(msg.id, msg.pinned);
            break;
          case "icon":
            hub.setIcon(msg.id, msg.icon);
            break;
        }
      },
      close(ws) {
        ws.unsubscribe(TOPIC);
      },
    },
  });

  const unsubscribe = hub.subscribe((change) => panelServer.publish(TOPIC, JSON.stringify(change satisfies ServerMessage)));

  return {
    hookServer,
    panelServer,
    stop() {
      unsubscribe();
      hookServer.stop(true);
      panelServer.stop(true);
    },
  };
}

function send(ws: { send(data: string): unknown }, message: ServerMessage) {
  ws.send(JSON.stringify(message));
}

/** Constant-time, so response timing doesn't leak the token. */
function sameSecret(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
