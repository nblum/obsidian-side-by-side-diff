import { describe, test } from "node:test";
import assert from "node:assert/strict";
import de from "../locales/de.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };
import fr from "../locales/fr.json" with { type: "json" };
import it from "../locales/it.json" with { type: "json" };
import es from "../locales/es.json" with { type: "json" };
import ptBR from "../locales/pt-BR.json" with { type: "json" };
import ptPT from "../locales/pt-PT.json" with { type: "json" };
import nl from "../locales/nl.json" with { type: "json" };
import zhCN from "../locales/zh-CN.json" with { type: "json" };
import { createTranslator, resolveLanguage } from "../src/i18n.ts";

describe("UI translations", () => {
	test("all locale dictionaries contain the same keys", () => {
		const keys = Object.keys(en).sort();
		assert.deepEqual(Object.keys(de).sort(), keys);
		assert.deepEqual(Object.keys(fr).sort(), keys);
		assert.deepEqual(Object.keys(it).sort(), keys);
		assert.deepEqual(Object.keys(es).sort(), keys);
		assert.deepEqual(Object.keys(ptBR).sort(), keys);
		assert.deepEqual(Object.keys(ptPT).sort(), keys);
		assert.deepEqual(Object.keys(nl).sort(), keys);
		assert.deepEqual(Object.keys(zhCN).sort(), keys);
	});

	test("all translations preserve placeholders and contain nonempty strings", () => {
		for (const dictionary of [de, en, fr, it, es, ptBR, ptPT, nl, zhCN]) {
			for (const key of Object.keys(en) as (keyof typeof en)[]) {
				const translation = dictionary[key];
				assert.ok(translation.trim().length > 0, key);
				assert.deepEqual(
					translation.match(/\{[a-zA-Z0-9_.-]+\}/g)?.sort() ?? [],
					en[key].match(/\{[a-zA-Z0-9_.-]+\}/g)?.sort() ?? [],
					key,
				);
			}
		}
	});

	test("translates labels and replaces variables", () => {
		assert.equal(createTranslator("de")("settings.language.name"), "Sprache");
		assert.equal(createTranslator("en")("settings.language.name"), "Language");
		assert.equal(createTranslator("fr")("settings.language.name"), "Langue");
		assert.equal(createTranslator("it")("settings.language.name"), "Lingua");
		assert.equal(createTranslator("es")("settings.language.name"), "Idioma");
		assert.equal(createTranslator("pt-BR")("settings.language.name"), "Idioma");
		assert.equal(createTranslator("pt-PT")("settings.language.name"), "Idioma");
		assert.equal(createTranslator("nl")("settings.language.name"), "Taal");
		assert.equal(
			createTranslator("en")("notice.fileTrashed", { name: "Notes.md" }),
			"“Notes.md” was moved to the trash.",
		);
	});

	test("provides localized introduction-step labels", () => {
		assert.equal(createTranslator("de")("modal.introduction.progress", { current: 1, total: 5 }), "Schritt 1 von 5");
		assert.equal(createTranslator("de")("modal.introduction.start.title"), "So startest du");
		assert.equal(createTranslator("de")("modal.introduction.welcome.documentation.title"), "Dokumentation");
		assert.equal(createTranslator("de")("modal.introduction.thanks.title"), "Vielen Dank");
		assert.equal(createTranslator("en")("modal.introduction.finish"), "Get started");
		assert.equal(createTranslator("en")("modal.introduction.startAction"), "How to start");
		assert.equal(createTranslator("en")("modal.introduction.thanks.description"), "This is open source and free because I like it.");
		assert.equal(createTranslator("en")("modal.introduction.thanks.feedbackLink"), "give feedback on GitHub");
		assert.equal(createTranslator("en")("modal.introduction.tips.keyboard.imageAlt"), "Keyboard shortcuts for navigating, accepting, ignoring, undoing, and saving changes");
		assert.equal(createTranslator("en")("modal.introduction.tips.title"), "Tips and tricks");
		assert.equal(createTranslator("en")("settings.introduction.button"), "Show introduction");
		assert.equal(createTranslator("de")("commands.showIntroduction"), "Einführung anzeigen");
	});

	test("distinguishes Obsidian's European and Brazilian Portuguese locale codes", () => {
		assert.equal(resolveLanguage("auto", "pt"), "pt-PT");
		assert.equal(resolveLanguage("auto", "pt-br"), "pt-BR");
	});

	test("accepts only supported explicit languages", () => {
		assert.equal(resolveLanguage("de"), "de");
		assert.equal(resolveLanguage("en"), "en");
		assert.equal(resolveLanguage("fr"), "fr");
		assert.equal(resolveLanguage("it"), "it");
		assert.equal(resolveLanguage("es"), "es");
		assert.equal(resolveLanguage("pt-BR"), "pt-BR");
		assert.equal(resolveLanguage("pt-PT"), "pt-PT");
		assert.equal(resolveLanguage("nl"), "nl");
		assert.equal(resolveLanguage("zh-CN", "de-DE"), "zh-CN");
		assert.equal(resolveLanguage("auto", "fr-CA"), "fr");
		assert.equal(resolveLanguage("auto", "it-IT"), "it");
		assert.equal(resolveLanguage("auto", "es-ES"), "es");
		assert.equal(resolveLanguage("auto", "pt-BR"), "pt-BR");
		assert.equal(resolveLanguage("auto", "pt-PT"), "pt-PT");
		assert.equal(resolveLanguage("auto", "pt-PT-1990"), "pt-PT");
		assert.equal(resolveLanguage("auto", "nl-NL"), "nl");
		assert.equal(resolveLanguage("auto", "zh-CN"), "zh-CN");
	});

	test("detects Simplified Chinese without selecting it for Traditional Chinese", () => {
		for (const locale of ["zh", "zh-cn", "ZH-CN", "zh-SG", "zh-Hans", "zh-Hans-CN", "zh-Hans-SG"]) {
			assert.equal(resolveLanguage("auto", locale), "zh-CN", locale);
		}
		for (const locale of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-TW", "zh-Hant-CN", "ja-JP"]) {
			assert.equal(resolveLanguage("auto", locale), "en", locale);
		}
		assert.equal(resolveLanguage("auto", "de-DE"), "de");
		assert.equal(resolveLanguage("en", "zh-CN"), "en");
	});

	test("translates Chinese labels and interpolates filenames and progress", () => {
		const translate = createTranslator("zh-CN");
		assert.equal(translate("settings.language.name"), "语言");
		assert.equal(translate("settings.language.zh-CN"), "简体中文");
		assert.equal(translate("notice.fileTrashed", { name: "笔记.md" }), "已将“笔记.md”移至回收站。");
		assert.equal(translate("modal.introduction.progress", { current: 2, total: 5 }), "第 2 步，共 5 步");
	});

	test("localizes URI validation notices in every additional European language", () => {
		const english = createTranslator("en");
		for (const language of ["fr", "it", "es", "pt-BR", "pt-PT", "nl"] as const) {
			const translate = createTranslator(language);
			for (const error of ["missingPaths", "sameFile", "wrongVault", "fileMissing", "textFilesOnly"]) {
				const key = `notice.protocol.${error}`;
				const message = translate(key, { path: "Drafts/Plan.md" });
				assert.notEqual(message, key, `${language}: ${key}`);
				assert.notEqual(message, english(key, { path: "Drafts/Plan.md" }), `${language}: ${key}`);
			}
			assert.ok(translate("notice.protocol.fileMissing", { path: "Drafts/Plan.md" }).includes("Drafts/Plan.md"));
		}
	});

	test("localizes URI validation notices in Simplified Chinese", () => {
		const translate = createTranslator("zh-CN");
		for (const error of ["missingPaths", "sameFile", "wrongVault", "fileMissing", "textFilesOnly"]) {
			assert.match(translate(`notice.protocol.${error}`, { path: "Drafts/Plan.md" }), /[\u3400-\u9fff]/u);
		}
		assert.equal(
			translate("notice.protocol.fileMissing", { path: "Drafts/Plan.md" }),
			"在此仓库中找不到“Drafts/Plan.md”。请检查相对于仓库的路径。",
		);
	});
});
