import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Validates the manifest fields required by Obsidian's community directory. */
function validateManifest() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.join(scriptDirectory, "..", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const requiredFields = ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"];

  for (const field of requiredFields) {
    if (!(field in manifest)) {
      throw new Error(`manifest.json is missing required field: ${field}`);
    }
  }
  if (typeof manifest.id !== "string" || !/^[a-z0-9-]+$/.test(manifest.id) || manifest.id.includes("obsidian")) {
    throw new Error("manifest.json has an invalid id");
  }
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("manifest.json version must use x.y.z format");
  }
  if (typeof manifest.minAppVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
    throw new Error("manifest.json minAppVersion must use x.y.z format");
  }
  if (typeof manifest.isDesktopOnly !== "boolean") {
    throw new Error("manifest.json isDesktopOnly must be boolean");
  }
}

validateManifest();
console.log("manifest.json is valid");
