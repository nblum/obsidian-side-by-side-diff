import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Runs Obsidian on an isolated display by default on Linux, with an explicit visible debug mode. */
export async function runObsidianTests(args = process.argv.slice(2)) {
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
  // Even a capture with an older installer can bind Obsidian's app-wide CLI socket.
  const runtimeDir = process.platform === "linux" ? mkdtempSync(join(tmpdir(), "sbs-obsidian-runtime-")) : null;
  if (runtimeDir !== null) {
    if (env.E2E_HEADED === "1" && env.XDG_RUNTIME_DIR && env.WAYLAND_DISPLAY && !isAbsolute(env.WAYLAND_DISPLAY)) {
      env.WAYLAND_DISPLAY = join(env.XDG_RUNTIME_DIR, env.WAYLAND_DISPLAY);
    }
    env.XDG_RUNTIME_DIR = runtimeDir;
  }
  try {
    const separateProcessGroup = process.platform !== "win32";
    const child = spawn(executable, childArgs, { env, stdio: "inherit", detached: separateProcessGroup });
    let interrupted;
    const interrupt = (signal, exitCode) => {
      interrupted ??= exitCode;
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
      try {
        // The display wrapper and Electron processes also need the signal.
        if (separateProcessGroup) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error.code !== "ESRCH") console.error(error.message);
      }
    };
    const onInterrupt = () => { interrupt("SIGINT", 130); };
    const onTerminate = () => { interrupt("SIGTERM", 143); };
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onTerminate);
    try {
      const status = await new Promise(resolve => {
        child.on("error", error => { console.error(error.message); });
        child.once("close", resolve);
      });
      return interrupted ?? status ?? 1;
    } finally {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    }
  } finally {
    if (runtimeDir !== null) rmSync(runtimeDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await runObsidianTests();
