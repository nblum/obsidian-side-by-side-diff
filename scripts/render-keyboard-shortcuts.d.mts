/** Builds the callout overlay as SVG markup sized to the source capture. */
export function buildKeyboardShortcutOverlay(width?: number, height?: number): Promise<string>;
/** Derives the keyboard-shortcut illustration from the active-change capture by overlaying shortcut callouts. */
export function renderKeyboardShortcuts(source?: string, destination?: string): Promise<void>;
