const DE_TRANSLATIONS = require("./locales/de.json");
const EN_TRANSLATIONS = require("./locales/en.json");

const TRANSLATIONS = { de: DE_TRANSLATIONS, en: EN_TRANSLATIONS };

/** Detects a locale for automatic translation selection. */
function detectSystemLanguage(locale = "") {
	const fallbackLocale = typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function"
		? Intl.DateTimeFormat().resolvedOptions().locale
		: "de";
	const detectedLocale = String(locale || fallbackLocale || "de").toLowerCase();
	return detectedLocale.startsWith("de") ? "de" : "en";
}

/** Resolves a configured language to one of the available translation tables. */
function resolveLanguage(preference, locale = "") {
	return preference === "de" || preference === "en" ? preference : detectSystemLanguage(locale);
}

/** Creates a translator with a safe English fallback for missing translation keys. */
function createTranslator(language) {
	const dictionary = TRANSLATIONS[language] || TRANSLATIONS.en;
	return (key, variables = {}) => {
		const template = dictionary[key] || TRANSLATIONS.en[key] || key;
		return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (placeholder, variableName) =>
			Object.prototype.hasOwnProperty.call(variables, variableName)
				? String(variables[variableName])
				: placeholder,
		);
	};
}

module.exports = { createTranslator, resolveLanguage };
