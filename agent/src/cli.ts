export type Command =
  | { name: "agent"; lan: boolean }
  | { name: "hooks"; install: boolean; remove: boolean }
  | { name: "status" }
  | { name: "version" }
  | { name: "help"; error?: string };

export const USAGE = `Usage: tomari <command>

  agent [--lan]                run the agent in the foreground (bin/perch-up runs it in the background)
                               --lan also lets a claude-panel Raspberry Pi connect over the LAN
  hooks                        print the workspace's settings.json with the hooks added, without writing it
  hooks --install | --remove   add or remove the hooks in that file, after backing it up
  status                       show whether the agent answers and the hooks are installed
  version                      print the version

Nothing here starts at login: bin/perch-up and bin/perch-down start and stop everything.`;

const FLAGS: Record<string, Record<string, string>> = {
  agent: { "--lan": "lan" },
  hooks: { "--install": "install", "--remove": "remove" },
  status: {},
};

export function parseCommand(args: string[]): Command {
  const [name, ...rest] = args;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") return { name: "help" };
  if (name === "version" || name === "--version" || name === "-v") return { name: "version" };
  const allowed = FLAGS[name];
  if (!allowed) return { name: "help", error: `unknown command: ${name}` };

  const command: Record<string, unknown> = { name };
  for (const key of Object.values(allowed)) command[key] = false;
  for (const arg of rest) {
    const key = allowed[arg];
    if (!key) return { name: "help", error: `unknown option for ${name}: ${arg}` };
    command[key] = true;
  }
  if (command.install && command.remove) return { name: "help", error: "hooks takes --install or --remove, not both" };
  return command as Command;
}
