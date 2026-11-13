import { expect, test } from "bun:test";
import { parseCommand } from "./cli.ts";

test("subcommands and their flags", () => {
  expect(parseCommand(["agent"])).toEqual({ name: "agent", lan: false });
  expect(parseCommand(["agent", "--lan"])).toEqual({ name: "agent", lan: true });
  expect(parseCommand(["hooks"])).toEqual({ name: "hooks", install: false, remove: false });
  expect(parseCommand(["hooks", "--install"])).toEqual({ name: "hooks", install: true, remove: false });
  expect(parseCommand(["hooks", "--remove"])).toEqual({ name: "hooks", install: false, remove: true });
  expect(parseCommand(["status"])).toEqual({ name: "status" });
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

test("the LaunchAgent commands are gone: nothing can be set to start at login", () => {
  expect(parseCommand(["setup"])).toEqual({ name: "help", error: "unknown command: setup" });
  expect(parseCommand(["uninstall"])).toEqual({ name: "help", error: "unknown command: uninstall" });
});
