import { Notice } from "obsidian";

type StatusTone = "success" | "progress" | "error" | "warning";

/** Gives a status message a consistent visual cue while keeping its text accessible. */
export function setStatusMessage(element: HTMLElement, text: string, tone: StatusTone): void {
  element.dataset.fileDiffStatus = tone;
  element.setText(text);
}

/** Uses a fragment so status styling works with both generations of Obsidian notices. */
export function showStatusNotice(message: string, tone: StatusTone): void {
  new Notice(createFragment(fragment => {
    fragment.createDiv({ text: message, attr: { "data-file-diff-status": tone } });
  }));
}
