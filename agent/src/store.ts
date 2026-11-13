/**
 * SQLite persistence. Observed session state and the user's pins live in separate
 * tables: the first can be rebuilt from Claude at any time, the second cannot.
 * Pins are keyed by session name (see pinKey in hub.ts), so they outlive session ids.
 */
import { Database } from "bun:sqlite";
import { DEFAULT_ICON, type SessionState } from "../../shared/protocol.ts";
import type { SessionRecord } from "./state.ts";

export interface Pin {
  /** The session's name, or its id while it has none. */
  key: string;
  position: number;
  character: string;
  /** "#rrggbb" picked in the strip; null follows Claude's color for the session. */
  color: string | null;
}

interface SessionRow {
  id: string;
  name: string | null;
  cwd: string;
  state: string;
  activity: string | null;
  live: number;
  pid: number | null;
  state_since: number;
  last_event_at: number;
  color: string | null;
}

interface PinRow {
  pin_key: string;
  position: number;
  character: string;
  color: string | null;
}

export class Store {
  private db: Database;

  /** `path` may be ":memory:". */
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        cwd           TEXT NOT NULL,
        state         TEXT NOT NULL,
        activity      TEXT,
        live          INTEGER NOT NULL,
        pid           INTEGER,
        state_since   INTEGER NOT NULL,
        last_event_at INTEGER NOT NULL,
        color         TEXT
      );
      CREATE TABLE IF NOT EXISTS pins (
        pin_key    TEXT PRIMARY KEY,
        position   INTEGER NOT NULL,
        character  TEXT NOT NULL,
        color      TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    this.migrate();
  }

  /**
   * Databases from before Claude's colors: sessions gain a color, and pin colors become optional.
   * The colors picked until then reset to Claude's; characters stay.
   */
  private migrate() {
    const columns = (table: string) => this.db.query<{ name: string; notnull: number }, []>(`PRAGMA table_info(${table})`).all();
    this.db.transaction(() => {
      if (!columns("sessions").some((c) => c.name === "color")) this.db.exec("ALTER TABLE sessions ADD COLUMN color TEXT");
      if (columns("pins").find((c) => c.name === "color")?.notnull) {
        this.db.exec(`
          CREATE TABLE pins_new (
            pin_key    TEXT PRIMARY KEY,
            position   INTEGER NOT NULL,
            character  TEXT NOT NULL,
            color      TEXT,
            created_at INTEGER NOT NULL
          );
          INSERT INTO pins_new (pin_key, position, character, color, created_at)
            SELECT pin_key, position, character, NULL, created_at FROM pins;
          DROP TABLE pins;
          ALTER TABLE pins_new RENAME TO pins;
        `);
      }
    })();
  }

  loadSessions(): SessionRecord[] {
    return this.db
      .query<SessionRow, []>("SELECT * FROM sessions")
      .all()
      .map((r) => ({
        id: r.id,
        name: r.name,
        cwd: r.cwd,
        state: r.state as SessionState,
        activity: r.activity,
        live: r.live === 1,
        pid: r.pid,
        stateSince: r.state_since,
        lastEventAt: r.last_event_at,
        color: r.color,
      }));
  }

  saveSession(s: SessionRecord) {
    this.db
      .query(
        `INSERT INTO sessions (id, name, cwd, state, activity, live, pid, state_since, last_event_at, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, cwd = excluded.cwd, state = excluded.state, activity = excluded.activity,
           live = excluded.live, pid = excluded.pid, state_since = excluded.state_since,
           last_event_at = excluded.last_event_at, color = excluded.color`,
      )
      .run(s.id, s.name, s.cwd, s.state, s.activity, s.live ? 1 : 0, s.pid, s.stateSince, s.lastEventAt, s.color);
  }

  deleteSession(id: string) {
    this.db.query("DELETE FROM sessions WHERE id = ?").run(id);
  }

  loadPins(): Map<string, Pin> {
    const rows = this.db.query<PinRow, []>("SELECT * FROM pins ORDER BY position").all();
    return new Map(rows.map((r) => [r.pin_key, { key: r.pin_key, position: r.position, character: r.character, color: r.color }]));
  }

  /** Appends to the pin order with the default character, following Claude's color; no-op if already pinned. */
  pin(key: string) {
    this.db
      .query(
        `INSERT OR IGNORE INTO pins (pin_key, position, character, color, created_at)
         VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM pins), ?, NULL, ?)`,
      )
      .run(key, DEFAULT_ICON.character, Date.now());
  }

  unpin(key: string) {
    this.db.query("DELETE FROM pins WHERE pin_key = ?").run(key);
  }

  /** Pins the key if it isn't yet, then sets its character and color (null: Claude's). */
  setIcon(key: string, character: string, color: string | null) {
    this.db
      .query(
        `INSERT INTO pins (pin_key, position, character, color, created_at)
         VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM pins), ?, ?, ?)
         ON CONFLICT(pin_key) DO UPDATE SET character = excluded.character, color = excluded.color`,
      )
      .run(key, character, color, Date.now());
  }

  /** Hands the pin of `from` to `to`, unless `to` has one already; `from` loses it either way. */
  movePin(from: string, to: string) {
    this.db.transaction(() => {
      this.db.query("UPDATE OR IGNORE pins SET pin_key = ? WHERE pin_key = ?").run(to, from);
      this.db.query("DELETE FROM pins WHERE pin_key = ?").run(from);
    })();
  }

  close() {
    this.db.close();
  }
}
