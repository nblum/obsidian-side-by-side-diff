import type { LanguagePreference } from "./i18n.ts";
import type { DiffDirection } from "./diff-core.ts";
import { normalizeRecentFilePaths } from "./recent-files.ts";

/** Describes persisted options that influence plugin behavior and presentation. */
export interface PluginSettings {
	showRibbonIcon: boolean;
	autoAdvanceAfterChange: boolean;
	defaultApplyDirection: DiffDirection;
	alignMarkdownByHeadings: boolean;
	changeCopySuffix: string;
	language: LanguagePreference;
	recentRightFilePaths: string[];
	introductionSeen: boolean;
}

/** Provides stable defaults for new or incomplete plugin installations. */
export const DEFAULT_SETTINGS: PluginSettings = {
	showRibbonIcon: true,
	autoAdvanceAfterChange: true,
	defaultApplyDirection: "left-to-right",
	alignMarkdownByHeadings: false,
	changeCopySuffix: "_changes_",
	language: "auto",
	recentRightFilePaths: [],
	introductionSeen: false
};

/** Checks whether a persisted or UI value is a supported language preference. */
export function isLanguagePreference(value: unknown): value is LanguagePreference {
	return value === "auto" || value === "de" || value === "en" || value === "fr" || value === "it"
		|| value === "es" || value === "pt-BR" || value === "pt-PT" || value === "nl" || value === "zh-CN";
}

/** Accepts only the two supported merge directions from persisted settings or controls. */
export function isDiffDirection(value: unknown): value is DiffDirection {
	return value === "left-to-right" || value === "right-to-left";
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
		defaultApplyDirection: isDiffDirection(storedSettings.defaultApplyDirection) ? storedSettings.defaultApplyDirection : DEFAULT_SETTINGS.defaultApplyDirection,
		alignMarkdownByHeadings: typeof storedSettings.alignMarkdownByHeadings === "boolean" ? storedSettings.alignMarkdownByHeadings : DEFAULT_SETTINGS.alignMarkdownByHeadings,
		changeCopySuffix: typeof storedSettings.changeCopySuffix === "string" ? sanitizeCopySuffix(storedSettings.changeCopySuffix) : DEFAULT_SETTINGS.changeCopySuffix,
		language: isLanguagePreference(storedSettings.language) ? storedSettings.language : DEFAULT_SETTINGS.language,
		recentRightFilePaths: normalizeRecentFilePaths(storedSettings.recentRightFilePaths),
		introductionSeen: typeof storedSettings.introductionSeen === "boolean" ? storedSettings.introductionSeen : DEFAULT_SETTINGS.introductionSeen
	};
}
