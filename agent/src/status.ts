import { PANEL_PORT } from "../../shared/protocol.ts";
import { BIN_DIR, claudeSettings, DATA_DIR, LOG_DIR, savedHost, WORKSPACE } from "./config.ts";
import { describe, tomariJobs } from "./launchd.ts";
import { hooksInstalled } from "./settings.ts";

export async function status(version: string) {
  const [agent, overlay] = tomariJobs({ binDir: BIN_DIR, logDir: LOG_DIR }, { lan: false });
  const health = await fetch(`http://127.0.0.1:${PANEL_PORT}/health`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.json() as Promise<{ sessions: number; host?: string }>)
    .catch(() => null);
  const saved = await savedHost();
  const settings = claudeSettings(saved);
  // A running agent may not have reread config.json; what it reports is what is in use.
  const inUse = health?.host && health.host !== saved ? ` (the running agent uses ${health.host})` : "";
  console.log(`tomari ${version}
  host      : ${saved === "desktop" ? "desktop (the Claude app)" : "ghostty"}${inUse}
  agent     : LaunchAgent ${await describe(agent!.label)}
  overlay   : LaunchAgent ${await describe(overlay!.label)}
  health    : ${health ? `answering on :${PANEL_PORT}, ${health.sessions} sessions` : `no answer on :${PANEL_PORT}`}
  hooks     : ${(await hooksInstalled(settings)) ? "installed in" : "not installed in"} ${settings}${saved === "ghostty" ? `\n  workspace : ${WORKSPACE}` : ""}
  data      : ${DATA_DIR}
  logs      : ${LOG_DIR}`);
}
