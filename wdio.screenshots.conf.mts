import { config as e2eConfig, obsidianChromeArgs } from "./wdio.conf.mts";

/** Opt-in documentation captures, separate from the behavioral E2E suite and CI. */
export const config: WebdriverIO.Config = {
  ...e2eConfig,
  specs: ["./tests/e2e/documentation.capture.ts"],
  capabilities: [{
    browserName: "obsidian",
    "wdio:obsidianOptions": {
      appVersion: process.env.OBSIDIAN_VERSION ?? "1.15.1",
      installerVersion: "earliest",
      plugins: [{ path: ".", enabled: false }],
      vault: "tests/e2e/documentation-vault",
      copy: true,
    },
    "goog:chromeOptions": { args: obsidianChromeArgs },
  }],
  mochaOpts: { ui: "bdd", timeout: 120_000 },
};
