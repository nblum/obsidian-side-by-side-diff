import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.join(scriptDirectory, "..");
const RELEASE_FILES = ["CHANGELOG.md", "manifest.json", "package-lock.json", "package.json", "versions.json"];

/** Returns whether parsed JSON is a mutable key-value object. */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads one UTF-8 repository file. */
function readFile(filename) {
  return fs.readFileSync(path.join(repositoryRoot, filename), "utf8");
}

/** Reads and parses one repository JSON document. */
function readJson(filename) {
  return JSON.parse(readFile(filename));
}

/** Writes one deterministic JSON document with a trailing newline. */
function writeJson(filename, value) {
  fs.writeFileSync(path.join(repositoryRoot, filename), `${JSON.stringify(value, null, 2)}\n`);
}

/** Runs one command and throws when it exits unsuccessfully. */
function runCommand(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = capture ? result.stderr.trim() : "";
    throw new Error(detail.length > 0
      ? `${command} ${args.join(" ")} failed: ${detail}`
      : `${command} ${args.join(" ")} failed with exit code ${String(result.status)}.`);
  }
  return capture ? result.stdout.trim() : "";
}

/** Parses a strict three-component release version. */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (match === null) {
    throw new Error("Version must use x.y.z format, for example 0.1.3.");
  }
  return match.slice(1).map(Number);
}

/** Returns whether the target version is newer than the current version. */
function isNewerVersion(targetVersion, currentVersion) {
  const target = parseVersion(targetVersion);
  const current = parseVersion(currentVersion);
  for (let index = 0; index < target.length; index += 1) {
    const targetPart = target[index] ?? 0;
    const currentPart = current[index] ?? 0;
    if (targetPart !== currentPart) {
      return targetPart > currentPart;
    }
  }
  return false;
}

/** Converts the current Unreleased notes into a dated release section. */
export function updateChangelog(contents, version, date) {
  const unreleasedHeading = "## [Unreleased]";
  const headingIndex = contents.indexOf(unreleasedHeading);
  if (headingIndex === -1) {
    throw new Error("CHANGELOG.md must contain an Unreleased section.");
  }
  const notesStart = headingIndex + unreleasedHeading.length;
  const nextReleaseIndex = contents.indexOf("\n## [", notesStart);
  if (nextReleaseIndex === -1) {
    throw new Error("CHANGELOG.md must contain an existing release after Unreleased.");
  }
  const notes = contents.slice(notesStart, nextReleaseIndex).trim();
  if (notes.length === 0) {
    throw new Error("CHANGELOG.md Unreleased section must contain release notes.");
  }
  const beforeHeading = contents.slice(0, headingIndex);
  const previousReleases = contents.slice(nextReleaseIndex + 1);
  return `${beforeHeading}${unreleasedHeading}\n\n## [${version}] - ${date}\n\n${notes}\n\n${previousReleases}`;
}

/** Validates the result of looking up an exact tag on the remote. */
export function validateRemoteTagLookup(status, stderr, version) {
  if (status === 2) {
    return;
  }
  if (status === 0) {
    throw new Error(`Tag ${version} already exists on origin.`);
  }
  const detail = stderr.trim();
  throw new Error(detail.length > 0
    ? `Could not check tag ${version} on origin: ${detail}`
    : `Could not check tag ${version} on origin; git exited with code ${String(status)}.`);
}

/** Rejects a target version that already has a local tag. */
function assertLocalTagAvailable(version) {
  const result = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/tags/${version}`],
    { cwd: repositoryRoot, stdio: "ignore" }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status === 0) {
    throw new Error(`Tag ${version} already exists locally.`);
  }
  if (result.status !== 1) {
    throw new Error(`Could not check local tag ${version}; git exited with code ${String(result.status)}.`);
  }
}

/** Rejects a target version that already has a remote tag. */
function assertRemoteTagAvailable(version) {
  const result = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${version}`],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  validateRemoteTagLookup(result.status, result.stderr, version);
}

/** Updates every release metadata file to one synchronized version. */
function updateReleaseFiles(version) {
  const manifest = readJson("manifest.json");
  const packageMetadata = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const versions = readJson("versions.json");
  const rootLockPackage = packageLock.packages?.[""];
  if (!isRecord(manifest)
    || !isRecord(packageMetadata)
    || !isRecord(packageLock)
    || !isRecord(rootLockPackage)
    || !isRecord(versions)) {
    throw new Error("Release metadata has an unexpected structure.");
  }
  if (typeof manifest.version !== "string" || !isNewerVersion(version, manifest.version)) {
    throw new Error(`Target version ${version} must be newer than manifest version ${String(manifest.version)}.`);
  }
  if (typeof manifest.minAppVersion !== "string") {
    throw new Error("manifest.json minAppVersion must be a string.");
  }
  manifest.version = version;
  packageMetadata.version = version;
  packageLock.version = version;
  rootLockPackage.version = version;
  versions[version] = manifest.minAppVersion;

  const releaseDate = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(repositoryRoot, "CHANGELOG.md"),
    updateChangelog(readFile("CHANGELOG.md"), version, releaseDate)
  );
  writeJson("manifest.json", manifest);
  writeJson("package.json", packageMetadata);
  writeJson("package-lock.json", packageLock);
  writeJson("versions.json", versions);
}

/** Verifies a clean synchronized branch before creating release mutations. */
function prepareRepository(version) {
  if (runCommand("git", ["status", "--porcelain"], { capture: true }).length > 0) {
    throw new Error("Working tree must be clean before creating a release.");
  }
  // Historical tag conflicts must not block synchronization of the release branch.
  runCommand("git", ["fetch", "--no-tags", "origin"]);
  const branch = runCommand("git", ["branch", "--show-current"], { capture: true });
  if (branch.length === 0) {
    throw new Error("Release must run from a branch, not a detached HEAD.");
  }
  const upstream = runCommand(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { capture: true }
  );
  if (upstream !== `origin/${branch}`) {
    throw new Error(`Branch upstream must be origin/${branch}, but is ${upstream}.`);
  }
  const divergence = runCommand(
    "git",
    ["rev-list", "--left-right", "--count", `HEAD...${upstream}`],
    { capture: true }
  );
  if (divergence !== "0\t0" && divergence !== "0 0") {
    throw new Error(`Branch must match ${upstream} before releasing; divergence is ${divergence}.`);
  }
  assertLocalTagAvailable(version);
  assertRemoteTagAvailable(version);
  return branch;
}

/** Runs release checks, commits metadata, tags the commit, and pushes atomically. */
function createRelease(version) {
  parseVersion(version);
  const branch = prepareRepository(version);
  updateReleaseFiles(version);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  runCommand(npmCommand, ["run", "validate:manifest"], {
    env: { ...process.env, RELEASE_TAG: version }
  });
  runCommand(npmCommand, ["run", "lint"]);
  runCommand(npmCommand, ["test"]);
  runCommand(npmCommand, ["run", "build"]);
  runCommand("git", ["diff", "--check"]);
  runCommand("git", ["add", "--", ...RELEASE_FILES]);
  runCommand("git", ["commit", "-m", `chore: release ${version}`]);
  runCommand("git", ["tag", "-a", version, "-m", `Release ${version}`]);
  runCommand("git", ["push", "--atomic", "origin", `HEAD:${branch}`, `refs/tags/${version}`]);
}

/** Parses the CLI request and starts one release. */
function main() {
  const version = process.argv[2];
  if (version === "--help" || version === "-h") {
    console.log("Usage: npm run release -- <x.y.z>");
    return;
  }
  if (version === undefined || process.argv.length > 3) {
    throw new Error("Usage: npm run release -- <x.y.z>");
  }
  createRelease(version);
}

const invokedScript = process.argv[1];
if (invokedScript !== undefined && path.resolve(invokedScript) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
