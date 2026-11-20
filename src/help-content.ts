import readme from "../README.md";
import compareMode from "../assets/compare-mode.webp";
import walkthrough from "../assets/comparsion-record1.webp";
import pendingChanges from "../assets/pending-changes.webp";
import inlineEdit from "../assets/inline-edit.png";
import singleColumn from "../assets/single-column.webp";
import { INTRODUCTION_ASSETS } from "./introduction-assets";
import { GITHUB_REPOSITORY_URL } from "./external-links";

const images: Record<string, string> = {
  ...INTRODUCTION_ASSETS,
  "compare-mode.webp": compareMode,
  "comparsion-record1.webp": walkthrough,
  "pending-changes.webp": pendingChanges,
  "inline-edit.png": inlineEdit,
  "single-column.webp": singleColumn
};

/** Prepares the bundled README for offline rendering and repository-relative navigation. */
export function prepareHelpMarkdown(markdown: string): string {
  // Keep badge link labels without requesting remote badge images.
  return markdown.replace(/!\[([^\]]*)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (_match, prefix: string, destination: string, suffix: string) => {
      if (prefix.startsWith("!")) {
        const image = images[destination.replace(/^assets\//, "")];
        if (image !== undefined) return `${prefix}${image}${suffix}`;
      }
      if (destination.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(destination)) {
        return `${prefix}${destination}${suffix}`;
      }
      return `${prefix}${GITHUB_REPOSITORY_URL}/blob/main/${destination}${suffix}`;
    });
}

/** Creates the section identifiers used by the README's GitHub-style table of contents. */
export function helpHeadingId(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/\s/g, "-");
}

export const HELP_MARKDOWN = prepareHelpMarkdown(readme);
