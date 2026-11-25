import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../scripts/run-obsidian-tests.mjs", import.meta.url));

for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
	test(`the Obsidian test runner forwards ${signal} and removes its runtime directory`, {
		skip: process.platform !== "linux", timeout: 5_000
	}, async t => {
		const fixture = await mkdtemp(join(tmpdir(), "sbs-runner-test-"));
		const wdioBin = join(fixture, "node_modules/@wdio/cli/bin");
		await mkdir(wdioBin, { recursive: true });
		const marker = join(fixture, "signal.txt");
		const ready = join(fixture, "runtime.txt");
		await writeFile(join(wdioBin, "wdio.js"), `
			const { writeFileSync } = require("node:fs");
			process.on("${signal}", () => {
				writeFileSync(${JSON.stringify(marker)}, "${signal}");
				process.exit(0);
			});
			setTimeout(() => process.exit(1), 3000);
			writeFileSync(${JSON.stringify(ready)}, process.env.XDG_RUNTIME_DIR);
		`);
		const child = spawn(process.execPath, [runner, "ignored.conf.mts"], {
			cwd: fixture, env: { ...process.env, E2E_HEADED: "1", TMPDIR: fixture }, stdio: "inherit"
		});
		t.after(async () => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
			await rm(fixture, { recursive: true, force: true });
		});
		const closed = once(child, "close");
		for (let attempt = 0; attempt < 100 && !existsSync(ready); attempt++) {
			await setTimeout(20);
		}
		const runtime = await readFile(ready, "utf8");
		assert.ok(runtime.startsWith(join(fixture, "sbs-obsidian-runtime-")));
		await readdir(runtime);
		assert.equal(child.kill(signal), true);
		assert.deepEqual(await closed, [exitCode, null]);
		assert.equal(await readFile(marker, "utf8"), signal);
		await assert.rejects(readdir(runtime), { code: "ENOENT" });
	});
}
