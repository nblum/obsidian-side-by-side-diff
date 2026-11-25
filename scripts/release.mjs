import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.join(scriptDirectory, "..");
const RELEASE_FILES = ["CHANGELOG.md", "manifest.json", "package-lock.json", "package.json", "versions.json"];
const RELEASE_BRANCH = "main";

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
  const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (match === null) {
    throw new Error("Version must use x.y.z format, for example 0.1.3.");
  }
  return match.slice(1).map(Number);
}

/** Returns the exact published notes from a prepared changelog section. */
function getReleaseNotes(changelog, version) {
  parseVersion(version);
  const lines = changelog.split(/\r?\n/u);
  const start = lines.findIndex(line => line.startsWith(`## [${version}] - `));
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## ["));
  const notes = start < 0 ? "" : lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
  if (notes.length === 0) throw new Error(`CHANGELOG.md has no release notes for ${version}.`);
  return notes;
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

/** Checks every prepared version and its compatibility entry before a tag or release can be published. */
function getPreparedNotes(version) {
  const manifest = readJson("manifest.json");
  const metadata = readJson("package.json");
  const lock = readJson("package-lock.json");
  const versions = readJson("versions.json");
  if ([manifest.version, metadata.version, lock.version, lock.packages?.[""]?.version].some(value => value !== version)
    || versions[version] !== manifest.minAppVersion) {
    throw new Error(`Release metadata is not synchronized for ${version}.`);
  }
  return getReleaseNotes(readFile("CHANGELOG.md"), version);
}

/** Verifies a clean synchronized branch before creating release mutations. */
function requireSynchronizedBranch() {
  if (runCommand("git", ["status", "--porcelain"], { capture: true }).length > 0) {
    throw new Error("Working tree must be clean before creating a release.");
  }
  // Historical tag conflicts must not block synchronization of the release branch.
  runCommand("git", ["fetch", "--no-tags", "origin"]);
  const branch = runCommand("git", ["branch", "--show-current"], { capture: true });
  if (branch !== RELEASE_BRANCH) {
    throw new Error(`Run the release from ${RELEASE_BRANCH}.`);
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
}

/** Checks that the latest push CI run for the exact commit succeeded. */
function requireGreenCi(commit) {
  const response = runCommand("gh", [
    "api", "--method", "GET", "repos/{owner}/{repo}/actions/workflows/ci.yml/runs",
    "-f", "event=push", "-f", `branch=${RELEASE_BRANCH}`, "-f", `head_sha=${commit}`
  ], { capture: true });
  const run = JSON.parse(response).workflow_runs?.[0];
  if (run?.head_sha !== commit || run?.head_branch !== RELEASE_BRANCH || run?.event !== "push"
    || run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(`CI must pass on origin/${RELEASE_BRANCH} for ${commit}. Check the CI workflow, then retry. ${run?.html_url ?? ""}`.trim());
  }
}

/** Runs local release checks and pushes the metadata commit so CI can validate it. */
function prepareRelease(version) {
  requireSynchronizedBranch();
  assertLocalTagAvailable(version);
  assertRemoteTagAvailable(version);
  updateReleaseFiles(version);
  getPreparedNotes(version);
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
  runCommand("git", ["push", "origin", `HEAD:refs/heads/${RELEASE_BRANCH}`]);
  console.log(`After CI passes, run npm run release -- ${version} --publish.`);
}

/** Tags the successful release commit, reusing an identical tag after a failed push. */
function publishRelease(version) {
  requireSynchronizedBranch();
  getPreparedNotes(version);
  assertRemoteTagAvailable(version);
  const commit = runCommand("git", ["rev-parse", "HEAD"], { capture: true });
  requireGreenCi(commit);
  const tagRef = `refs/tags/${version}`;
  const tag = runCommand("git", ["for-each-ref", "--format=%(refname) %(objecttype) %(*objectname)", tagRef], { capture: true });
  if (tag === "") {
    runCommand("git", ["tag", "-a", version, commit, "-m", `Release ${version}`]);
  } else if (tag !== `${tagRef} tag ${commit}`) {
    throw new Error(`Local tag ${version} is not an annotated tag for the CI-verified commit.`);
  }
  runCommand("git", ["push", "origin", tagRef]);
}

/** Parses the CLI request and starts one release. */
function main() {
  const [version, mode, ...extra] = process.argv.slice(2);
  const usage = "Usage: npm run release -- <x.y.z> [--publish]";
  if (version === "--help" || version === "-h") {
    console.log(usage);
    return;
  }
  if (version === undefined || extra.length > 0) throw new Error(usage);
  parseVersion(version);
  switch (mode) {
    case undefined:
      prepareRelease(version);
      break;
    case "--publish":
      publishRelease(version);
      break;
    case "--check":
      getPreparedNotes(version);
      requireGreenCi(runCommand("git", ["rev-parse", "HEAD"], { capture: true }));
      break;
    case "--notes":
      console.log(getPreparedNotes(version));
      break;
    default:
      throw new Error(usage);
  }
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
