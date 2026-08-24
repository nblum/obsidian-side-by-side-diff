import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldOfferProposalCleanup } from "../src/proposal-cleanup.ts";

test("offers proposal cleanup after all accepted changes were saved", () => {
	assert.equal(shouldOfferProposalCleanup("accept", true, 0, false), true);
});

test("does not offer cleanup for regular or proposal views", () => {
	assert.equal(shouldOfferProposalCleanup("compare", true, 0, false), false);
	assert.equal(shouldOfferProposalCleanup("proposal", true, 0, false), false);
});

test("keeps the copy when changes were dismissed or remain pending", () => {
	assert.equal(shouldOfferProposalCleanup("accept", true, 1, false), false);
	assert.equal(shouldOfferProposalCleanup("accept", true, 0, true), false);
	assert.equal(shouldOfferProposalCleanup("accept", false, 0, false), false);
});
