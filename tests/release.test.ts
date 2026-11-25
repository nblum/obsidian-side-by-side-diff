import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

test("a release commit reaches origin before CI and only an exact successful run permits tagging", {
  skip: process.platform === "win32"
}, t => {
  const fixture = mkdtempSync(join(tmpdir(), "sbs-release-test-"));
  t.after(() => { rmSync(fixture, { recursive: true, force: true }); });
  const repo = join(fixture, "repo");
  const origin = join(fixture, "origin.git");
  const bin = join(fixture, "bin");
  const version = "0.12.0";
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(bin);

  copyFileSync(new URL("../scripts/release.mjs", import.meta.url), join(repo, "scripts/release.mjs"));
  const files = {
    "manifest.json": { version: "0.11.0", minAppVersion: "1.6.6" },
    "package.json": { version: "0.11.0" },
    "package-lock.json": { version: "0.11.0", packages: { "": { version: "0.11.0" } } },
    "versions.json": { "0.11.0": "1.6.6" }
  };
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(repo, name), JSON.stringify(contents));
  }
  writeFileSync(join(repo, "CHANGELOG.md"), "## [Unreleased]\n\n- About dialog\n\n## [0.11.0] - 2026-11-18\n\n- Older release\n");
  writeFileSync(join(bin, "npm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(bin, "gh"), '#!/bin/sh\nprintf "%s" "$SBS_TEST_CI"\n', { mode: 0o755 });

  function git(...args: string[]): string {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  }

  function release(mode?: string, runs: object[] = []) {
    const args = ["scripts/release.mjs", version];
    if (mode) args.push(mode);
    return spawnSync(process.execPath, args, {
      cwd: repo, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, SBS_TEST_CI: JSON.stringify({ workflow_runs: runs }) }
    });
  }

  git("init", "--bare", origin);
  git("init", "-b", "main");
  git("config", "user.email", "release-test@example.invalid");
  git("config", "user.name", "Release test");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgSign", "false");
  git("add", ".");
  git("commit", "-m", "Initial fixture");
  git("remote", "add", "origin", origin);
  git("push", "-u", "origin", "main");

  const preparation = release();
  assert.equal(preparation.status, 0, preparation.stderr);
  const commit = git("rev-parse", "HEAD");
  assert.equal(git("rev-parse", "origin/main"), commit);
  assert.equal(git("tag", "-l"), "");
  assert.deepEqual(JSON.parse(readFileSync(join(repo, "versions.json"), "utf8")), {
    "0.11.0": "1.6.6", "0.12.0": "1.6.6"
  });
  assert.equal(release("--notes").stdout.trim(), "- About dialog");

  const green = { head_sha: commit, head_branch: "main", event: "push", status: "completed", conclusion: "success" };
  for (const runs of [[], [{ ...green, head_sha: "a".repeat(40) }], [{ ...green, conclusion: "failure" }]]) {
    const blocked = release("--publish", runs);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /CI must pass/u);
    assert.equal(git("tag", "-l"), "");
  }

  const publication = release("--publish", [green]);
  assert.equal(publication.status, 0, publication.stderr);
  assert.equal(git("cat-file", "-t", `refs/tags/${version}`), "tag");
  assert.equal(git("rev-parse", `${version}^{}`), commit);
  assert.match(git("ls-remote", "--tags", "origin", `refs/tags/${version}^{}`), new RegExp(commit, "u"));
});
