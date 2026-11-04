/** Extracts a vault link from plain paths, wikilinks, Markdown links, or Obsidian open URLs. */
export function parseDroppedVaultLink(text: string, currentVault: string): string | null {
  let link = text.trim();
  if (!link || /[\r\n]/.test(link)) return null;
  const wiki = link.match(/^!?\[\[([^\]\n]+)\]\]$/);
  const markdown = link.match(/^!?\[[^\]\n]*\]\((?:<([^>\n]+)>|([^\s\n]+))\)$/);
  if (wiki) {
    link = wiki[1]?.split("|")[0] ?? "";
  } else if (markdown) {
    link = markdown[1] ?? markdown[2] ?? "";
  }
  try {
    if (/^obsidian:/i.test(link)) {
      const url = new URL(link);
      if (url.hostname !== "open") return null;
      const vault = url.searchParams.get("vault");
      if (vault !== null && vault !== currentVault) return null;
      const file = url.searchParams.get("file");
      return file !== null && file.length > 0 ? file : null;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(link)) return null;
    return markdown ? decodeURIComponent(link) : link || null;
  } catch {
    return null;
  }
}
