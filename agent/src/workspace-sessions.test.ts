import { expect, test } from "bun:test";
import type { AgentEntry } from "./state.ts";
import { isInside, workspaceAgents } from "./workspace-sessions.ts";

const agent = (sessionId: string, cwd: string, name: string): AgentEntry => ({ sessionId, cwd, name, status: "idle", startedAt: 0 });

test("a folder is inside the workspace when it is the workspace or below it", () => {
  expect(isInside("/Users/dev/cenco", "/Users/dev/cenco")).toBe(true);
  expect(isInside("/Users/dev/cenco/acuerdos-comerciales-api", "/Users/dev/cenco/")).toBe(true);
  expect(isInside("/Users/dev/cenco-old", "/Users/dev/cenco")).toBe(false);
  expect(isInside("/Users/dev", "/Users/dev/cenco")).toBe(false);
});

test("only the workspace's sessions are listed", async () => {
  const all = [
    agent("11111111-1111-4111-8111-111111111111", "/Users/dev/cenco", "composer"),
    agent("22222222-2222-4222-8222-222222222222", "/Users/dev/cenco/front", "front-dev"),
    agent("33333333-3333-4333-8333-333333333333", "/Users/dev/.claude-mem/observer-sessions/99", "99-da"),
  ];
  const listed = await workspaceAgents("/Users/dev/cenco", async () => all);
  expect(listed.map((a) => a.name)).toEqual(["composer", "front-dev"]);
});
