import deTranslations from "../locales/de.json" with { type: "json" };
import enTranslations from "../locales/en.json" with { type: "json" };

export type Language = "de" | "en";
export type LanguagePreference = "auto" | Language;
type TranslationVariables = Record<string, string | number>;
type TranslationTable = Record<string, string>;
export type Translator = (key: string, variables?: TranslationVariables) => string;

const TRANSLATIONS: Record<Language, TranslationTable> = {
	de: deTranslations,
	en: enTranslations,
};

/** Detects a locale for automatic translation selection. */
function detectSystemLanguage(locale = ""): Language {
	const fallbackLocale = Intl.DateTimeFormat().resolvedOptions().locale || "de";
	const detectedLocale = (locale.length > 0 ? locale : fallbackLocale).toLowerCase();
	return detectedLocale.startsWith("de") ? "de" : "en";
}

/** Resolves a configured language to one of the available translation tables. */
export function resolveLanguage(preference: LanguagePreference, locale = ""): Language {
	return preference === "de" || preference === "en" ? preference : detectSystemLanguage(locale);
}

/** Creates a translator with a safe English fallback for missing translation keys. */
export function createTranslator(language: Language): Translator {
	const dictionary = TRANSLATIONS[language];
	return (key, variables = {}) => {
		const template = dictionary[key] ?? TRANSLATIONS.en[key] ?? key;
		return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (placeholder, variableName: string) => {
			const variableValue = variables[variableName];
			return variableValue === undefined ? placeholder : String(variableValue);
		});
	};
}
