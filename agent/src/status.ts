import { PANEL_PORT } from "../../shared/protocol.ts";
import { CLAUDE_SETTINGS, DATA_DIR, LOG_DIR, WORKSPACE } from "./config.ts";
import { hooksInstalled } from "./settings.ts";

export async function status(version: string) {
  const health = await fetch(`http://127.0.0.1:${PANEL_PORT}/health`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.json() as Promise<{ sessions: number }>)
    .catch(() => null);
  console.log(`perch-terminal ${version}
  agent     : ${health ? `answering on :${PANEL_PORT}, ${health.sessions} sessions` : `no answer on :${PANEL_PORT}`}
  hooks     : ${(await hooksInstalled()) ? "installed in" : "not installed in"} ${CLAUDE_SETTINGS}
  workspace : ${WORKSPACE}
  data      : ${DATA_DIR}
  logs      : ${LOG_DIR}`);
}
