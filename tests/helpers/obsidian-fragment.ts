/** Models the text written into a small Obsidian fragment for notice assertions. */
export function renderFragmentText(callback: (fragment: { createDiv: (options: { text: string }) => void }) => void): string {
  let text = "";
  callback({ createDiv: options => { text += options.text; } });
  return text;
}
