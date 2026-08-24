import type { LanguagePreference } from "./i18n.ts";
import { normalizeRecentFilePaths } from "./recent-files.ts";

/** Describes persisted options that influence plugin behavior and presentation. */
export interface PluginSettings {
	showRibbonIcon: boolean;
	autoAdvanceAfterChange: boolean;
	changeCopySuffix: string;
	language: LanguagePreference;
	recentRightFilePaths: string[];
}

/** Provides stable defaults for new or incomplete plugin installations. */
export const DEFAULT_SETTINGS: PluginSettings = {
	showRibbonIcon: true,
	autoAdvanceAfterChange: true,
	changeCopySuffix: "_changes_",
	language: "auto",
	recentRightFilePaths: []
};

/** Checks whether a persisted or UI value is a supported language preference. */
export function isLanguagePreference(value: unknown): value is LanguagePreference {
	return value === "auto" || value === "de" || value === "en";
}

/** Replaces path-invalid suffix characters with safe underscores. */
export function sanitizeCopySuffix(value: string): string {
	return (value.length > 0 ? value : DEFAULT_SETTINGS.changeCopySuffix).replace(/[\\/:*?"<>|]/g, "_");
}

/** Converts unknown persisted data into a complete, safe settings object. */
export function normalizePluginSettings(value: unknown): PluginSettings {
	const storedSettings = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
	return {
		showRibbonIcon: typeof storedSettings.showRibbonIcon === "boolean" ? storedSettings.showRibbonIcon : DEFAULT_SETTINGS.showRibbonIcon,
		autoAdvanceAfterChange: typeof storedSettings.autoAdvanceAfterChange === "boolean" ? storedSettings.autoAdvanceAfterChange : DEFAULT_SETTINGS.autoAdvanceAfterChange,
		changeCopySuffix: typeof storedSettings.changeCopySuffix === "string" ? sanitizeCopySuffix(storedSettings.changeCopySuffix) : DEFAULT_SETTINGS.changeCopySuffix,
		language: isLanguagePreference(storedSettings.language) ? storedSettings.language : DEFAULT_SETTINGS.language,
		recentRightFilePaths: normalizeRecentFilePaths(storedSettings.recentRightFilePaths)
	};
}
