import { runAgent } from "./agent.ts";
import { parseCommand, USAGE } from "./cli.ts";
import { CLAUDE_SETTINGS } from "./config.ts";
import { previewHooks, writeHooks } from "./settings.ts";
import { status } from "./status.ts";

declare const TOMARI_VERSION: string | undefined;
const VERSION = typeof TOMARI_VERSION === "string" ? TOMARI_VERSION : "dev";

const command = parseCommand(process.argv.slice(2));
try {
  switch (command.name) {
    case "agent":
      await runAgent({ lan: command.lan });
      break;
    case "hooks": {
      if (!command.install && !command.remove) {
        process.stdout.write(await previewHooks({ install: true }));
        break;
      }
      const { changed, backup } = await writeHooks({ install: command.install });
      const done = command.install ? "added to" : "removed from";
      console.log(changed ? `hooks ${done} ${CLAUDE_SETTINGS}${backup ? `\nbackup: ${backup}` : ""}` : `nothing to change in ${CLAUDE_SETTINGS}`);
      break;
    }
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
