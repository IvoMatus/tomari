import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ServerMessage } from "../../shared/protocol.ts";
import { SessionHub } from "./hub.ts";
import { startServers } from "./server.ts";
import type { AgentEntry } from "./state.ts";
import { Store } from "./store.ts";

const ID = "0603472f-b7c5-4dae-b7a1-142468264b30";
const TOKEN = "test-token";

const COMPOSER = "22222222-2222-4222-8222-222222222222";
const API_DEV = "33333333-3333-4333-8333-333333333333";
let live: AgentEntry[];

let servers: ReturnType<typeof startServers>;
let opened: (number | null)[];
/** Whether the fake Ghostty finds a panel for the session. */
let panelFound: boolean;

beforeEach(() => {
  opened = [];
  panelFound = true;
  live = [
    { sessionId: COMPOSER, name: "composer", cwd: "/Users/dev/cenco", pid: 4242, status: "idle", startedAt: 0 },
    { sessionId: API_DEV, name: "api-dev", cwd: "/Users/dev/cenco", pid: 4343, status: "busy", startedAt: 0 },
  ];
  servers = startServers({
    hub: new SessionHub(new Store()),
    token: TOKEN,
    hookPort: 0, // 0 = any free port
    panelPort: 0,
    panelHost: "127.0.0.1",
    open: async (pid) => {
      opened.push(pid);
      return { ok: true, focused: panelFound };
    },
    liveSessions: async () => live,
  });
});
afterEach(() => servers.stop());

const hookUrl = () => `http://127.0.0.1:${servers.hookServer.port}/hook`;
const panelHttp = () => `http://127.0.0.1:${servers.panelServer.port}`;

function postHook(event: Record<string, unknown>, url = hookUrl()) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
}

/** Opens a panel connection; next() resolves with the following server message. */
async function connect(token = TOKEN) {
  const ws = new WebSocket(`ws://127.0.0.1:${servers.panelServer.port}/ws?token=${token}`);
  const inbox: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as ServerMessage;
    const resolve = waiting.shift();
    if (resolve) resolve(msg);
    else inbox.push(msg);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const next = () =>
    inbox.length > 0 ? Promise.resolve(inbox.shift()!) : new Promise<ServerMessage>((resolve) => waiting.push(resolve));
  return { ws, next };
}

async function waitFor(condition: () => boolean, timeoutMs = 1000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await Bun.sleep(5);
  }
}

test("a wrong token is rejected", async () => {
  expect((await fetch(`${panelHttp()}/ws?token=nope`)).status).toBe(401);
  expect((await fetch(`${panelHttp()}/ws`)).status).toBe(401);
});

test("the network-facing port does not accept hook events", async () => {
  const res = await postHook({ hook_event_name: "Stop", session_id: ID, cwd: "/tmp" }, `${panelHttp()}/hook`);
  expect(res.status).toBe(404);
});

test("the panel gets a snapshot, then live updates from hooks", async () => {
  const { ws, next } = await connect();
  expect(await next()).toEqual({ type: "snapshot", sessions: [], focusedId: null });

  const res = await postHook({ hook_event_name: "UserPromptSubmit", session_id: ID, cwd: "/tmp/demo" });
  expect(res.status).toBe(204);
  expect(await next()).toMatchObject({ type: "session", session: { id: ID, name: "demo", state: "working", live: true } });
  ws.close();
});

test("pin, icon and open commands; anything else is refused", async () => {
  await postHook({ hook_event_name: "Stop", session_id: ID, cwd: "/tmp/demo" });
  const { ws, next } = await connect();
  await next(); // snapshot

  ws.send(JSON.stringify({ type: "pin", id: ID, pinned: true }));
  expect(await next()).toMatchObject({ type: "session", session: { id: ID, pinned: true, position: 0 } });

  ws.send(JSON.stringify({ type: "pin", id: ID, pinned: false }));
  expect(await next()).toMatchObject({ type: "session", session: { pinned: false } });

  ws.send(JSON.stringify({ type: "icon", id: ID, icon: { character: "crab", color: "#ff6a1a" } }));
  expect(await next()).toMatchObject({ type: "session", session: { pinned: true, icon: { character: "crab" } } });

  // Closed: no Claude process, so Ghostty is only activated, and the strip is told why.
  await postHook({ hook_event_name: "SessionEnd", session_id: ID, cwd: "/tmp/demo" });
  expect(await next()).toMatchObject({ type: "session", session: { id: ID, state: "ended", live: false } });
  panelFound = false;
  ws.send(JSON.stringify({ type: "open", id: ID }));
  await waitFor(() => opened.length === 1);
  expect(opened).toEqual([null]);
  expect(await next()).toEqual({ type: "error", message: "not running; showed Ghostty" });

  ws.send(JSON.stringify({ type: "open", id: "11111111-1111-1111-1111-111111111111" }));
  expect(await next()).toEqual({ type: "error", message: "unknown session" });

  ws.send("rm -rf /");
  expect(await next()).toEqual({ type: "error", message: "invalid message" });
  ws.close();
});

test("opening a running session focuses its panel by its Claude process", async () => {
  const { ws, next } = await connect();
  await next(); // snapshot
  ws.send(JSON.stringify({ type: "library" }));
  while ((await next()).type !== "library");

  ws.send(JSON.stringify({ type: "open", id: COMPOSER }));
  expect(await next()).toEqual({ type: "focus", id: COMPOSER });
  expect(opened).toEqual([4242]);

  panelFound = false;
  ws.send(JSON.stringify({ type: "open", id: API_DEV }));
  expect(await next()).toEqual({ type: "error", message: "no Ghostty panel found; showed Ghostty" });
  expect(opened).toEqual([4242, 4343]);
  ws.close();
});

test("the library lists the running sessions it is given, and any of them can be pinned", async () => {
  const { ws, next } = await connect();
  await next(); // snapshot

  ws.send(JSON.stringify({ type: "library" }));
  let reply: ServerMessage;
  while ((reply = await next()).type !== "library"); // the new sessions are announced first
  expect(reply).toMatchObject({ type: "library" });
  const entries = reply.type === "library" ? reply.sessions : [];
  expect(entries.map((e) => [e.name, e.pinned])).toEqual([
    ["composer", false],
    ["api-dev", false],
  ]);

  ws.send(JSON.stringify({ type: "pin", id: API_DEV, pinned: true }));
  expect(await next()).toMatchObject({ type: "session", session: { id: API_DEV, name: "api-dev", live: true, pinned: true } });

  ws.send(JSON.stringify({ type: "library" }));
  expect(await next()).toMatchObject({ type: "library", sessions: [{ name: "composer", pinned: false }, { name: "api-dev", pinned: true }] });
  ws.close();
});

test("a failing `claude agents` is reported to the strip", async () => {
  servers.stop();
  servers = startServers({
    hub: new SessionHub(new Store()),
    token: TOKEN,
    hookPort: 0,
    panelPort: 0,
    liveSessions: async () => {
      throw new Error("claude: command not found");
    },
  });
  const { ws, next } = await connect();
  await next(); // snapshot
  ws.send(JSON.stringify({ type: "library" }));
  expect(await next()).toEqual({ type: "error", message: "claude agents failed: claude: command not found" });
  ws.close();
});
