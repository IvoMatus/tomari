/**
 * Live view of all sessions and pins, persisted through Store. Listeners hear only
 * about changes the panel can see, so a burst of identical hook events yields one message.
 *
 * Pins, characters and colors belong to the session's name (`claude -n composer`), not to its
 * id: reopening a named session gives it a new id, and the new session inherits them. Its old,
 * closed record is then forgotten, so one name never shows twice.
 *
 * A creature wears Claude's color for its session unless the user picked another one in the strip.
 */
import { basename } from "node:path";
import { DEFAULT_ICON, type PanelSession, type SessionIcon } from "../../shared/protocol.ts";
import { applyHookEvent, reconcile, type AgentEntry, type HookEvent, type SessionRecord } from "./state.ts";
import type { Pin, Store } from "./store.ts";

export type HubChange =
  | { type: "session"; session: PanelSession }
  | { type: "removed"; id: string }
  | { type: "focus"; id: string | null };
export type HubListener = (change: HubChange) => void;

const DAY_MS = 24 * 60 * 60 * 1000;
const VISIBLE: (keyof SessionRecord)[] = ["name", "cwd", "state", "activity", "live", "stateSince", "color"];

/** What a session's pin is stored under: its name, or its id until `claude agents` names it. */
export function pinKey(rec: Pick<SessionRecord, "id" | "name">) {
  return rec.name ?? rec.id;
}

export class SessionHub {
  private records = new Map<string, SessionRecord>();
  private pins: Map<string, Pin>;
  private listeners = new Set<HubListener>();
  /** Session in front in Ghostty; not persisted. */
  focusedId: string | null = null;

  constructor(
    private store: Store,
    private now: () => number = Date.now,
  ) {
    for (const rec of store.loadSessions()) this.records.set(rec.id, rec);
    this.pins = store.loadPins();
    for (const name of new Set([...this.records.values()].map((r) => r.name))) this.dedupe(name);
  }

  subscribe(listener: HubListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  has(id: string) {
    return this.records.has(id);
  }

  get(id: string): PanelSession | undefined {
    const rec = this.records.get(id);
    return rec && this.toPanel(rec);
  }

  /** The Claude process of a running session; null when it isn't running or the poll hasn't seen it. */
  pidOf(id: string): number | null {
    const rec = this.records.get(id);
    return rec?.live ? rec.pid : null;
  }

  /** Running sessions with a known Claude process. */
  processes(): { id: string; pid: number }[] {
    return [...this.records.values()].flatMap((r) => (r.live && r.pid !== null ? [{ id: r.id, pid: r.pid }] : []));
  }

  /** All known sessions; the panel decides which to show. */
  snapshot(): PanelSession[] {
    return [...this.records.values()].map((rec) => this.toPanel(rec));
  }

  handleHook(event: HookEvent) {
    this.commit(applyHookEvent(this.records.get(event.session_id), event, this.now()));
  }

  handleAgents(agents: AgentEntry[]) {
    const changed = reconcile(this.records, agents, this.now());
    // Dedupe after the whole poll: the old record of a reopened name may be marked ended later in the batch.
    for (const rec of changed) this.commit(rec, false);
    for (const name of new Set(changed.map((r) => r.name))) this.dedupe(name);
  }

  /** False if the session is unknown. */
  setPinned(id: string, pinned: boolean): boolean {
    const rec = this.records.get(id);
    if (!rec) return false;
    if (pinned) this.store.pin(pinKey(rec));
    else this.store.unpin(pinKey(rec));
    this.pins = this.store.loadPins();
    this.emitSharing(pinKey(rec));
    return true;
  }

  /**
   * Pins the session if needed. A color equal to Claude's keeps following Claude's, so picking
   * only a character doesn't freeze the color. False if the session is unknown.
   */
  setIcon(id: string, icon: SessionIcon): boolean {
    const rec = this.records.get(id);
    if (!rec) return false;
    const picked = icon.color === (rec.color ?? DEFAULT_ICON.color) ? null : icon.color;
    this.store.setIcon(pinKey(rec), icon.character, picked);
    this.pins = this.store.loadPins();
    this.emitSharing(pinKey(rec));
    return true;
  }

  /** Records the color Claude Code shows for the session; null when it has none. */
  setClaudeColor(id: string, color: string | null) {
    const rec = this.records.get(id);
    if (rec && rec.color !== color) this.commit({ ...rec, color });
  }

  setFocused(id: string | null) {
    if (id === this.focusedId) return;
    this.focusedId = id;
    this.emit({ type: "focus", id });
  }

  /** Forgets ended, unpinned sessions whose state is older than `maxAgeMs`. */
  prune(maxAgeMs = DAY_MS) {
    const cutoff = this.now() - maxAgeMs;
    for (const rec of this.records.values()) {
      if (rec.state === "ended" && !this.pins.has(pinKey(rec)) && rec.stateSince < cutoff) this.forget(rec.id);
    }
  }

  private commit(next: SessionRecord, dedupe = true) {
    const prev = this.records.get(next.id);
    this.records.set(next.id, next);
    this.store.saveSession(next);
    // Pinned before the poll named it: the pin moves from the id to the name.
    if (prev?.name === null && next.name !== null && this.pins.has(prev.id)) {
      this.store.movePin(prev.id, next.name);
      this.pins = this.store.loadPins();
    }
    if (!prev || VISIBLE.some((k) => prev[k] !== next[k])) {
      this.emit({ type: "session", session: this.toPanel(next) });
    }
    if (dedupe) this.dedupe(next.name);
  }

  /** Of the records sharing a name, keeps the running ones, or else the latest; forgets the rest. */
  private dedupe(name: string | null) {
    if (name === null) return;
    const same = [...this.records.values()].filter((r) => r.name === name);
    if (same.length < 2) return;
    const live = same.filter((r) => r.live);
    const keep = live.length > 0 ? live : [same.reduce((a, b) => (b.stateSince > a.stateSince ? b : a))];
    for (const rec of same) if (!keep.includes(rec)) this.forget(rec.id);
  }

  private forget(id: string) {
    this.records.delete(id);
    this.store.deleteSession(id);
    this.emit({ type: "removed", id });
  }

  /** Announces every session under `key`, since they share its pin. */
  private emitSharing(key: string) {
    for (const rec of this.records.values()) {
      if (pinKey(rec) === key) this.emit({ type: "session", session: this.toPanel(rec) });
    }
  }

  private emit(change: HubChange) {
    for (const listener of this.listeners) listener(change);
  }

  private toPanel(rec: SessionRecord): PanelSession {
    const pin = this.pins.get(pinKey(rec));
    return {
      id: rec.id,
      name: rec.name ?? basename(rec.cwd),
      cwd: rec.cwd,
      state: rec.state,
      activity: rec.activity,
      live: rec.live,
      stateSince: rec.stateSince,
      pinned: pin !== undefined,
      position: pin?.position ?? null,
      icon: { character: pin?.character ?? DEFAULT_ICON.character, color: pin?.color ?? rec.color ?? DEFAULT_ICON.color },
    };
  }
}
