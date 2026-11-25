import compareTwoFilesMenu from "../assets/compare-two-files-menu.png";
import fileMenu from "../assets/file-menu.webp";
import fileSelection from "../assets/file-selection.png";
import groupedChanges from "../assets/grouped-changes.png";
import keyboardShortcuts from "../assets/keyboard-shortcuts.webp";
import teaser from "../assets/teaser/teaser.png";

/** Data URLs for the introduction images embedded in the plugin bundle. */
export const INTRODUCTION_ASSETS = {
  "compare-two-files-menu.png": compareTwoFilesMenu,
  "file-menu.webp": fileMenu,
  "file-selection.png": fileSelection,
  "grouped-changes.png": groupedChanges,
  "keyboard-shortcuts.webp": keyboardShortcuts,
  "teaser.png": teaser
} as const;

export type IntroductionAssetName = keyof typeof INTRODUCTION_ASSETS;

/** Returns a locally bundled image URL for the introduction. */
export function getIntroductionAssetUrl(assetName: IntroductionAssetName): string {
  return INTRODUCTION_ASSETS[assetName];
}
