const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const de = require("../locales/de.json");
const en = require("../locales/en.json");
const { createTranslator, resolveLanguage } = require("../i18n");

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
