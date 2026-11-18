import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type {} from "wdio-obsidian-service";

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",
  specs: ["./tests/e2e/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [{
    browserName: "obsidian",
    "wdio:obsidianOptions": {
      // minAppVersion 1.6.6 was Insider-only; 1.6.7 is the first public release after it.
      appVersion: process.env.OBSIDIAN_VERSION ?? "1.6.7",
      installerVersion: "earliest",
      // Enable only after installing deterministic settings in the sandbox.
      plugins: [{ path: ".", enabled: false }],
      vault: "tests/e2e/vault",
      copy: true,
    },
    "goog:chromeOptions": { args: ["--window-size=1440,1000"] },
  }],
  services: ["obsidian"],
  reporters: ["spec"],
  cacheDir: resolve(".obsidian-cache"),
  outputDir: resolve("e2e-results"),
  logLevel: "warn",
  injectGlobals: false,
  waitforTimeout: 10_000,
  waitforInterval: 100,
  connectionRetryCount: 0,
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  /** Keeps a screenshot of the actual application when a test fails. */
  async afterTest(test, _context, { passed }) {
    if (!passed) {
      const { browser } = await import("@wdio/globals");
      await mkdir("e2e-results", { recursive: true });
      await browser.saveScreenshot(resolve("e2e-results", `${test.title.replace(/[^a-z0-9]+/gi, "-")}.png`));
    }
  },
};
