import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Runs Obsidian on an isolated display by default on Linux, with an explicit visible debug mode. */
export function runObsidianTests(args = process.argv.slice(2)) {
  const wdio = resolve("node_modules/@wdio/cli/bin/wdio.js");
  const command = [wdio, "run", ...args];
  const env = { ...process.env };
  let executable = process.execPath;
  let childArgs = command;
  if (process.platform === "linux" && env.E2E_HEADED !== "1") {
    // Optional local tools allow testing without a system-wide package installation.
    const tools = resolve(".obsidian-cache/headless/usr");
    if (existsSync(tools)) {
      env.PATH = `${tools}/bin${delimiter}${env.PATH ?? ""}`;
      const architecture = process.arch === "arm64" ? "aarch64-linux-gnu" : "x86_64-linux-gnu";
      env.LD_LIBRARY_PATH = `${tools}/lib/${architecture}${delimiter}${env.LD_LIBRARY_PATH ?? ""}`;
    }
    for (const tool of ["xvfb-run", "Xvfb", "openbox", "xauth"]) {
      if (spawnSync("which", [tool], { env, stdio: "ignore" }).status !== 0) {
        console.error(`Headless Obsidian tests require ${tool}. Install xvfb, openbox, and xauth, or use E2E_HEADED=1 for a visible debug run.`);
        return 1;
      }
    }
    const windowManager = spawnSync("openbox", ["--version"], { env, encoding: "utf8" });
    if (windowManager.status !== 0) {
      console.error(`Openbox could not start. Check its installed libraries.\n${windowManager.stderr ?? ""}`);
      return 1;
    }
    executable = "xvfb-run";
    console.log("Running Obsidian tests headless on a private Xvfb display.");
    childArgs = [
      "--auto-servernum", "--server-args=-screen 0 1440x1000x24 -nolisten tcp",
      "sh", "-c", 'openbox --sm-disable & wm=$!; trap \'kill "$wm" 2>/dev/null || true\' EXIT; "$@"',
      "obsidian-tests", process.execPath, ...command,
    ];
  }
  const result = spawnSync(executable, childArgs, { env, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = runObsidianTests();
