import { describe, test } from "node:test";
import assert from "node:assert/strict";
import de from "../locales/de.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };
import { createTranslator, resolveLanguage } from "../src/i18n.ts";

describe("UI translations", () => {
	test("German and English dictionaries contain the same keys", () => {
		assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
	});

	test("translates labels and replaces variables", () => {
		assert.equal(createTranslator("de")("settings.language.name"), "Sprache");
		assert.equal(createTranslator("en")("settings.language.name"), "Language");
		assert.equal(
			createTranslator("en")("notice.fileTrashed", { name: "Notes.md" }),
			"“Notes.md” was moved to the trash.",
		);
	});

	test("accepts only supported explicit languages", () => {
		assert.equal(resolveLanguage("de"), "de");
		assert.equal(resolveLanguage("en"), "en");
	});
});
