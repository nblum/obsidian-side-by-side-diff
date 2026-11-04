import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDroppedVaultLink } from "../src/dropped-vault-link.ts";

test("vault drops preserve literal paths and decode URL paths exactly once", () => {
  for (const [input, expected] of [
    ["Notes/100% done.md", "Notes/100% done.md"],
    ["[[Notes/Right note|Alias]]", "Notes/Right note"],
    ["[Right](<Notes/Right note.md>)", "Notes/Right note.md"],
    ["[Right](Notes/Right%20note.md)", "Notes/Right note.md"],
    ["obsidian://open?vault=My%20Vault&file=Notes%2F100%2520.md", "Notes/100%20.md"],
    ["obsidian://open?file=Notes%2FRight%20note", "Notes/Right note"]
  ]) assert.equal(parseDroppedVaultLink(input!, "My Vault"), expected);
});

test("invalid, multiple, and foreign-vault drops do not resolve to a local note", () => {
  for (const input of [
    "", "first.md\nsecond.md", "[Broken](bad%ZZ.md)",
    "obsidian://open?vault=Other&file=Notes%2FRight.md", "obsidian://open?vault=My%20Vault",
    "obsidian://search?vault=My%20Vault&query=note", "https://example.com/Right.md"
  ]) assert.equal(parseDroppedVaultLink(input, "My Vault"), null);
});
