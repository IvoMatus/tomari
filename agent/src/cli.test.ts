import { expect, test } from "bun:test";
import { parseCommand } from "./cli.ts";

test("subcommands and their flags", () => {
  expect(parseCommand(["agent"])).toEqual({ name: "agent", lan: false });
  expect(parseCommand(["agent", "--lan"])).toEqual({ name: "agent", lan: true });
  expect(parseCommand(["hooks"])).toEqual({ name: "hooks", install: false, remove: false });
  expect(parseCommand(["hooks", "--install"])).toEqual({ name: "hooks", install: true, remove: false });
  expect(parseCommand(["hooks", "--remove"])).toEqual({ name: "hooks", install: false, remove: true });
  expect(parseCommand(["setup"])).toEqual({ name: "setup", pi: false, host: null });
  expect(parseCommand(["setup", "--pi"])).toEqual({ name: "setup", pi: true, host: null });
  expect(parseCommand(["status"])).toEqual({ name: "status" });
  expect(parseCommand(["uninstall"])).toEqual({ name: "uninstall", purge: false });
  expect(parseCommand(["uninstall", "--purge"])).toEqual({ name: "uninstall", purge: true });
  expect(parseCommand(["--version"])).toEqual({ name: "version" });
  expect(parseCommand(["version"])).toEqual({ name: "version" });
});

test("no command, --help and mistakes show the usage", () => {
  expect(parseCommand([])).toEqual({ name: "help" });
  expect(parseCommand(["--help"])).toEqual({ name: "help" });
  expect(parseCommand(["install"])).toEqual({ name: "help", error: "unknown command: install" });
  expect(parseCommand(["hooks", "--lan"])).toEqual({ name: "help", error: "unknown option for hooks: --lan" });
  expect(parseCommand(["hooks", "--install", "--remove"])).toEqual({ name: "help", error: "hooks takes --install or --remove, not both" });
});

test("host shows the host in use, or switches to the app or to Ghostty", () => {
  expect(parseCommand(["host"])).toEqual({ name: "host", host: null });
  expect(parseCommand(["host", "app"])).toEqual({ name: "host", host: "desktop" });
  expect(parseCommand(["host", "ghostty"])).toEqual({ name: "host", host: "ghostty" });
  expect(parseCommand(["host", "iterm"])).toEqual({ name: "help", error: "unknown host: iterm (app or ghostty)" });
  expect(parseCommand(["host", "app", "ghostty"])).toEqual({ name: "help", error: "host takes one of: app, ghostty" });
});

test("setup can choose the host it installs for", () => {
  expect(parseCommand(["setup", "--host", "ghostty"])).toEqual({ name: "setup", pi: false, host: "ghostty" });
  expect(parseCommand(["setup", "--pi", "--host", "app"])).toEqual({ name: "setup", pi: true, host: "desktop" });
  expect(parseCommand(["setup", "--host"])).toEqual({ name: "help", error: "--host takes app or ghostty" });
  expect(parseCommand(["setup", "--host", "iterm"])).toEqual({ name: "help", error: "unknown host: iterm (app or ghostty)" });
  expect(parseCommand(["agent", "--host", "app"])).toEqual({ name: "help", error: "unknown option for agent: --host" });
});
