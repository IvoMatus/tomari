import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Store } from "./store.ts";

const ID = "11111111-1111-1111-1111-111111111111";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("pins are stored by key, in order; a new pin follows Claude's color", () => {
  const store = new Store();
  store.pin("composer");
  store.setIcon("api-dev", "cat", "#4f7cff");
  store.pin("composer"); // already pinned: no-op
  expect([...store.loadPins().values()]).toEqual([
    { key: "composer", position: 0, character: "default", color: null },
    { key: "api-dev", position: 1, character: "cat", color: "#4f7cff" },
  ]);
});

test("a pin moves from a session id to its name, keeping position, character and color", () => {
  const store = new Store();
  store.pin("api-dev");
  store.setIcon(ID, "cat", "#4f7cff");
  store.movePin(ID, "composer");
  expect([...store.loadPins().values()]).toEqual([
    { key: "api-dev", position: 0, character: "default", color: null },
    { key: "composer", position: 1, character: "cat", color: "#4f7cff" },
  ]);
});

test("moving onto a name that already has a pin keeps the name's and drops the id's", () => {
  const store = new Store();
  store.setIcon("composer", "crab", "#ff6a1a");
  store.pin(ID);
  store.movePin(ID, "composer");
  expect([...store.loadPins().keys()]).toEqual(["composer"]);
  expect(store.loadPins().get("composer")!.character).toBe("crab");
});

test("a database from before Claude's colors keeps its pins and characters, and their colors reset to Claude's", () => {
  const dir = mkdtempSync(`${tmpdir()}/perch-store-`);
  dirs.push(dir);
  const path = `${dir}/perch.db`;
  const old = new Database(path, { create: true });
  old.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, cwd TEXT NOT NULL, state TEXT NOT NULL, activity TEXT,
      live INTEGER NOT NULL, pid INTEGER, state_since INTEGER NOT NULL, last_event_at INTEGER NOT NULL);
    CREATE TABLE pins (pin_key TEXT PRIMARY KEY, position INTEGER NOT NULL, character TEXT NOT NULL,
      color TEXT NOT NULL, created_at INTEGER NOT NULL);
    INSERT INTO sessions VALUES ('${ID}', 'composer', '/cenco', 'idle', NULL, 1, 4242, 5, 5);
    INSERT INTO pins VALUES ('composer', 0, 'robot', '#3ccfe6', 1), ('LAZYVIM', 1, 'frog', '#ffd23f', 2);
  `);
  old.close();

  const store = new Store(path);
  expect([...store.loadPins().values()]).toEqual([
    { key: "composer", position: 0, character: "robot", color: null },
    { key: "LAZYVIM", position: 1, character: "frog", color: null },
  ]);
  expect(store.loadSessions()).toMatchObject([{ id: ID, name: "composer", color: null }]);
  store.setIcon("composer", "robot", "#4f7cff"); // colors can be picked again
  store.close();

  const reopened = new Store(path); // migrating twice changes nothing
  expect(reopened.loadPins().get("composer")).toEqual({ key: "composer", position: 0, character: "robot", color: "#4f7cff" });
  reopened.close();
});

/** A database as Tomari and claude-panel wrote it before pins went by name: pins keyed by session id, with a color. */
function byIdDb() {
  const dir = mkdtempSync(`${tmpdir()}/tomari-store-`);
  dirs.push(dir);
  const path = `${dir}/panel.db`;
  const old = new Database(path, { create: true });
  old.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, cwd TEXT NOT NULL, state TEXT NOT NULL, activity TEXT,
      live INTEGER NOT NULL, pid INTEGER, state_since INTEGER NOT NULL, last_event_at INTEGER NOT NULL);
    CREATE TABLE pins (session_id TEXT PRIMARY KEY, position INTEGER NOT NULL, character TEXT NOT NULL,
      color TEXT NOT NULL, created_at INTEGER NOT NULL);
    INSERT INTO sessions VALUES ('${ID}', 'Idle work', '/Users/dev/idle', 'ended', NULL, 0, NULL, 5, 5);
    INSERT INTO sessions VALUES ('${OTHER}', NULL, '/Users/dev/other', 'ended', NULL, 0, NULL, 6, 6);
    INSERT INTO sessions VALUES ('${UNPINNED}', 'Scratch', '/tmp', 'ended', NULL, 0, NULL, 7, 7);
    INSERT INTO pins VALUES ('${ID}', 0, 'cat', '#4f7cff', 1), ('${OTHER}', 1, 'ghost', '#ffd23f', 2);
  `);
  old.close();
  return path;
}
const OTHER = "22222222-2222-2222-2222-222222222222";
const UNPINNED = "33333333-3333-3333-3333-333333333333";

test("a database with pins by session id opens with them under the session's name, colors kept", () => {
  const store = new Store(byIdDb());
  expect([...store.loadPins().values()]).toEqual([
    { key: "Idle work", position: 0, character: "cat", color: "#4f7cff" },
    { key: OTHER, position: 1, character: "ghost", color: "#ffd23f" },
  ]);
  expect(store.loadSessions()).toHaveLength(3);
});

test("imports claude-panel's pins with their sessions, so pinned closed sessions still show", () => {
  const store = new Store();
  expect(store.importPinsFrom(byIdDb())).toBe(2);
  expect([...store.loadPins().values()]).toEqual([
    { key: "Idle work", position: 0, character: "cat", color: "#4f7cff" },
    { key: OTHER, position: 1, character: "ghost", color: "#ffd23f" },
  ]);
  expect(store.loadSessions().map((s) => s.id).sort()).toEqual([ID, OTHER]);
});

test("imports nothing once the store has pins of its own, or from a missing database", () => {
  const store = new Store();
  store.pin("composer");
  expect(store.importPinsFrom(byIdDb())).toBe(0);
  expect([...store.loadPins().keys()]).toEqual(["composer"]);
  expect(new Store().importPinsFrom("/nonexistent/panel.db")).toBe(0);
});
