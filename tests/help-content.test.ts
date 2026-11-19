import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/help-content.ts"], write: false, logLevel: "silent" });
assert.ok(bundle.outputFiles?.[0]);
const module = { exports: {} as {
  HELP_MARKDOWN: string;
  prepareHelpMarkdown: (markdown: string) => string;
  helpHeadingId: (text: string) => string;
} };
runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports });
const { HELP_MARKDOWN, prepareHelpMarkdown, helpHeadingId } = module.exports;

test("bundles the README with every documentation image available offline and no remote badge requests", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.equal(HELP_MARKDOWN, prepareHelpMarkdown(readme));
  const imageCount = [...readme.matchAll(/!\[[^\]]*\]\(assets\//g)].length;
  assert.ok(imageCount > 0);
  assert.equal([...HELP_MARKDOWN.matchAll(/!\[[^\]]*\]\(data:image\/(?:png|webp);base64,/g)].length, imageCount);
  assert.doesNotMatch(HELP_MARKDOWN, /!\[[^\]]*\]\((?:https?:|assets\/)/);
  assert.match(HELP_MARKDOWN, /\[CI\]\(https:\/\/github.com\//);
  assert.match(HELP_MARKDOWN, /\| Shortcut \| Action \|/);
});

test("resolves project documents on GitHub while preserving section, external, and Obsidian links", () => {
  assert.equal(prepareHelpMarkdown("[Guide](docs/visual-guide.md#edit) [Top](#get-started) [Site](https://example.com) [Install](obsidian://show-plugin?id=side-by-side-diff)"),
    "[Guide](https://github.com/nblum/obsidian-side-by-side-diff/blob/main/docs/visual-guide.md#edit) [Top](#get-started) [Site](https://example.com) [Install](obsidian://show-plugin?id=side-by-side-diff)");
  assert.equal(helpHeadingId("Compare, suggest, and accept changes"), "compare-suggest-and-accept-changes");
  assert.equal(helpHeadingId("Keyboard shortcuts"), "keyboard-shortcuts");
});
