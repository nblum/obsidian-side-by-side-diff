import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateComparisonProtocolRequest } from "../src/protocol.ts";

describe("comparison URI request validation", () => {
	test("accepts two decoded vault paths and an optional matching vault", () => {
		assert.deepEqual(validateComparisonProtocolRequest({
			left: "Folder/Left note.md",
			right: "Folder/Right note.md",
			vault: "Research",
		}, "Research"), {
			ok: true,
			left: "Folder/Left note.md",
			right: "Folder/Right note.md",
		});
	});

	test("rejects missing paths, identical paths, and a different vault", () => {
		assert.deepEqual(validateComparisonProtocolRequest({ left: "a.md" }, "Research"), { ok: false, error: "missingPaths" });
		assert.deepEqual(validateComparisonProtocolRequest({ left: "a.md", right: "a.md" }, "Research"), { ok: false, error: "sameFile" });
		assert.deepEqual(validateComparisonProtocolRequest({ left: "a.md", right: "b.md", vault: "Archive" }, "Research"), { ok: false, error: "wrongVault" });
	});
});
