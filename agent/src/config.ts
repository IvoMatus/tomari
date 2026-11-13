/**
 * Where perch-terminal lives on disk, apart from an install of the original Perch. The data dir
 * holds config.json with the pairing token (created on first run, mode 600), perch.db the SQLite
 * store, and the pid files of bin/perch-up. The overlay reads the token from here too
 * (Sources/TomariCore/AgentConfig.swift).
 */
import { $ } from "bun";
import { randomBytes } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { homedir, networkInterfaces } from "node:os";
import { PANEL_PORT } from "../../shared/protocol.ts";

export const HOOK_PORT = 7777;

const HOME = homedir();
export const DATA_DIR = `${HOME}/Library/Application Support/perch-terminal`;
export const LOG_DIR = `${HOME}/Library/Logs/perch-terminal`;
export const BACKUP_DIR = `${DATA_DIR}/backups`;
/** Only sessions whose cwd is here or below are tracked; the hooks live in its project settings. */
export const WORKSPACE = `${HOME}/cenco`;
export const CLAUDE_SETTINGS = `${WORKSPACE}/.claude/settings.json`;
export const CONFIG_FILE = `${DATA_DIR}/config.json`;
export const DB_FILE = `${DATA_DIR}/perch.db`;

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
}

export async function loadConfig(): Promise<Config> {
  const dataDir = DATA_DIR;
  await mkdir(dataDir, { recursive: true });

  const path = CONFIG_FILE;
  const file = Bun.file(path);
  const saved: { token?: string } = (await file.exists()) ? await file.json() : {};

  if (!saved.token) {
    saved.token = randomBytes(24).toString("base64url");
    await Bun.write(path, JSON.stringify(saved, null, 2) + "\n");
    await chmod(path, 0o600);
  }

  return { dataDir, dbPath: DB_FILE, token: saved.token };
}
