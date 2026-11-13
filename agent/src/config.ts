/**
 * Where perch-terminal lives on disk, apart from an install of the original Tomari. The data dir
 * holds config.json with the pairing token (created on first run, mode 600) and the session host,
 * perch.db the SQLite store, bin/ the binaries the LaunchAgents run, and the pid files of
 * bin/tomari-up. The overlay reads the token from here too (Sources/TomariCore/AgentConfig.swift).
 */
import { $ } from "bun";
import { randomBytes } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { homedir, networkInterfaces } from "node:os";
import { PANEL_PORT, type SessionHostId } from "../../shared/protocol.ts";
import { parseHost } from "./host.ts";

export const HOOK_PORT = 7777;

const HOME = homedir();
export const DATA_DIR = `${HOME}/Library/Application Support/perch-terminal`;
export const BIN_DIR = `${DATA_DIR}/bin`;
export const LOG_DIR = `${HOME}/Library/Logs/perch-terminal`;
export const BACKUP_DIR = `${DATA_DIR}/backups`;
/** With the Ghostty host, only sessions whose cwd is here or below are tracked, and the hooks live in its project settings. */
export const WORKSPACE = `${HOME}/cenco`;
/** The agent Tomari replaces: setup imports its pins and reuses its pairing token, so a paired Pi keeps working. */
const CLAUDE_PANEL_DIR = `${HOME}/Library/Application Support/claude-panel`;
export const CLAUDE_PANEL_DB = `${CLAUDE_PANEL_DIR}/panel.db`;
export const CLAUDE_PANEL_CONFIG = `${CLAUDE_PANEL_DIR}/config.json`;
export const CONFIG_FILE = `${DATA_DIR}/config.json`;
export const DB_FILE = `${DATA_DIR}/perch.db`;
/** The overlay's defaults domain, where it keeps the strip's edge (Sources/TomariOverlay/StripController.swift). */
export const OVERLAY_DEFAULTS = "local.perch-terminal";
/** Where Tomari lived while it was called Perch (0.1 and 0.2); setup moves it into the paths above. */
export const PERCH = {
  dataDir: `${HOME}/Library/Application Support/perch`,
  logDir: `${HOME}/Library/Logs/perch`,
  db: "perch.db",
  defaults: "com.elrincondeldev.perch",
};

/** The host used until one is chosen with `tomari host`, `setup --host` or the strip's menu. */
export const DEFAULT_HOST: SessionHostId = "desktop";

/** The Claude Code settings file that carries the hooks: the user's for the app, the workspace's for Ghostty. */
export function claudeSettings(host: SessionHostId) {
  return host === "desktop" ? `${HOME}/.claude/settings.json` : `${WORKSPACE}/.claude/settings.json`;
}

/**
 * WebSocket URLs other devices on the LAN can use to reach this Mac: its IPv4 addresses
 * (Wi-Fi/Ethernet first), then its Bonjour name. IPs come first because some routers drop
 * mDNS between WiFi clients; the name still works if the Mac's IP changes later.
 */
export async function panelUrls(): Promise<string[]> {
  const ips = Object.entries(networkInterfaces())
    .sort(([a], [b]) => Number(b.startsWith("en")) - Number(a.startsWith("en")))
    .flatMap(([, addresses]) => addresses ?? [])
    .filter((a) => a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
  const host = (await $`scutil --get LocalHostName`.quiet().nothrow().text()).trim();
  return [...ips, ...(host ? [`${host}.local`] : [])].map((address) => `ws://${address}:${PANEL_PORT}/ws`);
}

export interface Config {
  dataDir: string;
  dbPath: string;
  token: string;
  host: SessionHostId;
}

type SavedConfig = { token?: string; host?: unknown };

async function readSaved(path: string): Promise<SavedConfig> {
  const file = Bun.file(path);
  return (await file.exists()) ? await file.json() : {};
}

async function writeSaved(path: string, saved: SavedConfig) {
  await Bun.write(path, JSON.stringify(saved, null, 2) + "\n");
  await chmod(path, 0o600);
}

/** The host in config.json; DEFAULT_HOST when there is none or it names one this build doesn't know. */
export async function savedHost(path = CONFIG_FILE): Promise<SessionHostId> {
  return parseHost((await readSaved(path)).host) ?? DEFAULT_HOST;
}

export async function saveHost(host: SessionHostId, path = CONFIG_FILE) {
  await writeSaved(path, { ...(await readSaved(path)), host });
}

export async function loadConfig(): Promise<Config> {
  const dataDir = DATA_DIR;
  await mkdir(dataDir, { recursive: true });

  const saved = await readSaved(CONFIG_FILE);
  if (!saved.token) {
    saved.token = randomBytes(24).toString("base64url");
    await writeSaved(CONFIG_FILE, saved);
  }

  return { dataDir, dbPath: DB_FILE, token: saved.token, host: parseHost(saved.host) ?? DEFAULT_HOST };
}
