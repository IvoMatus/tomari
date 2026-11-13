import { runAgent } from "./agent.ts";
import { parseCommand, USAGE } from "./cli.ts";
import { PANEL_PORT } from "../../shared/protocol.ts";
import { claudeSettings, loadConfig, saveHost, savedHost } from "./config.ts";
import { askAgentToUse } from "./host.ts";
import { setup, uninstall } from "./install.ts";
import { hooksInstalled, previewHooks, writeHooks } from "./settings.ts";
import { status } from "./status.ts";

declare const TOMARI_VERSION: string | undefined;
const VERSION = typeof TOMARI_VERSION === "string" ? TOMARI_VERSION : "dev";

const command = parseCommand(process.argv.slice(2));
try {
  switch (command.name) {
    case "agent":
      await runAgent({ lan: command.lan });
      break;
    case "setup":
      await setup({ pi: command.pi, host: command.host });
      break;
    case "host": {
      if (!command.host) {
        console.log(await savedHost());
        break;
      }
      const { token } = await loadConfig();
      const live = await askAgentToUse(command.host, `ws://127.0.0.1:${PANEL_PORT}/ws?token=${token}`);
      if (!live) await saveHost(command.host);
      const settings = claudeSettings(command.host);
      console.log(`host: ${command.host}${live ? " (the running agent switched)" : " (saved; the agent uses it when it starts)"}`);
      if (!(await hooksInstalled(settings))) console.log(`the hooks are not in ${settings}: add them with \`tomari hooks --install\``);
      break;
    }
    case "hooks": {
      const settings = claudeSettings(await savedHost());
      if (!command.install && !command.remove) {
        process.stdout.write(await previewHooks({ install: true }, settings));
        break;
      }
      const { changed, backup } = await writeHooks({ install: command.install }, settings);
      const done = command.install ? "added to" : "removed from";
      console.log(changed ? `hooks ${done} ${settings}${backup ? `\nbackup: ${backup}` : ""}` : `nothing to change in ${settings}`);
      break;
    }
    case "uninstall":
      await uninstall({ purge: command.purge });
      break;
    case "status":
      await status(VERSION);
      break;
    case "version":
      console.log(VERSION);
      break;
    case "help":
      if (command.error) console.error(`tomari: ${command.error}\n`);
      console.log(USAGE);
      process.exit(command.error ? 1 : 0);
  }
} catch (error) {
  console.error(`tomari: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
