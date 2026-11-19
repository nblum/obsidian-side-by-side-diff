import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Coordinates refer to the 1x `active-change.webp` capture (936 × 643). Adjust them when the captured layout moves.
const EXPECTED_SIZE = { width: 936, height: 643 };
const FONT = "DejaVu Sans, Verdana, sans-serif";
const KEY_FONT_SIZE = 11.5;
const LABEL_FONT_SIZE = 11;
const KEY_HEIGHT = 15;
const PILL_HEIGHT = KEY_HEIGHT + 6;
const PILL_PADDING = 4;
const PART_GAP = 3;
const COLORS = {
  accent: "#7c5ce8",
  pill: "#201e30",
  key: "#46425c",
  keyOutline: "#78729a",
  keyText: "#ffffff",
  label: "#dcd7f0",
  plus: "#c8c3dc",
};

/** @type {Array<{ target: [number, number, number, number], pill: { x: number, y: number, anchor: "left" | "right", label?: string, keys: string[] }, line: (pill: { left: number, top: number, right: number }) => [number, number, number, number] }>} */
const CALLOUTS = [
  {
    target: [770, 23, 877, 51],
    pill: { x: 752, y: 37, anchor: "right", label: "Save", keys: ["Ctrl/Cmd", "S"] },
    line: (pill) => [pill.right, 37, 767, 37],
  },
  {
    target: [28, 152, 49, 174],
    pill: { x: 64, y: 163, anchor: "left", label: "Undo", keys: ["Ctrl/Cmd", "Z"] },
    line: (pill) => [52, 163, pill.left, 163],
  },
  {
    target: [852, 152, 874, 174],
    pill: { x: 856, y: 212, anchor: "right", keys: ["Alt", "↑"] },
    line: (pill) => [831, pill.top, 861, 177],
  },
  {
    target: [886, 152, 908, 174],
    pill: { x: 862, y: 212, anchor: "left", keys: ["Alt", "↓"] },
    line: (pill) => [890, pill.top, 897, 177],
  },
  {
    target: [451, 340, 467, 356],
    pill: { x: 442, y: 326, anchor: "right", label: "Accept", keys: ["Alt", "→"] },
    line: (pill) => [pill.right, 326, 456, 337],
  },
  {
    target: [470, 340, 487, 356],
    pill: { x: 498, y: 326, anchor: "left", label: "Ignore", keys: ["Alt", "←"] },
    line: (pill) => [pill.left, 326, 481, 337],
  },
];

const escapeXml = (text) => text.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);

/** Measures the rendered ink width of a text snippet by rasterizing it at 10x and trimming transparent space. */
async function measureText(text, size, weight) {
  const scale = 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${text.length * size * scale * 1.5 + 40}" height="${size * scale * 2}">`
    + `<text x="20" y="${size * scale * 1.4}" font-family="${FONT}" font-size="${size * scale}" font-weight="${weight}">${escapeXml(text)}</text></svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width / scale;
}

async function renderPill({ x, y, anchor, label, keys }) {
  const parts = [];
  if (label) parts.push({ kind: "label", text: label, width: await measureText(label, LABEL_FONT_SIZE, 400) + 4 });
  for (const [index, key] of keys.entries()) {
    if (index > 0) parts.push({ kind: "plus", text: "+", width: await measureText("+", LABEL_FONT_SIZE, 400) + 2 });
    parts.push({ kind: "key", text: key, width: Math.max(await measureText(key, KEY_FONT_SIZE, 700) + 10, KEY_HEIGHT) });
  }
  const width = parts.reduce((sum, part) => sum + part.width, 0) + PART_GAP * (parts.length - 1) + PILL_PADDING * 2;
  const left = anchor === "left" ? x : x - width;
  const top = y - PILL_HEIGHT / 2;
  let svg = `<rect x="${left}" y="${top}" width="${width}" height="${PILL_HEIGHT}" rx="${PILL_HEIGHT / 2}" fill="${COLORS.pill}"/>`;
  let cursor = left + PILL_PADDING;
  for (const part of parts) {
    const center = cursor + part.width / 2;
    if (part.kind === "key") {
      svg += `<rect x="${cursor}" y="${y - KEY_HEIGHT / 2}" width="${part.width}" height="${KEY_HEIGHT}" rx="4" fill="${COLORS.key}" stroke="${COLORS.keyOutline}" stroke-width="1"/>`;
    }
    const fontSize = part.kind === "key" ? KEY_FONT_SIZE : LABEL_FONT_SIZE;
    const fill = part.kind === "key" ? COLORS.keyText : part.kind === "label" ? COLORS.label : COLORS.plus;
    svg += `<text x="${center}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" `
      + `font-size="${fontSize}" font-weight="${part.kind === "key" ? 700 : 400}" fill="${fill}">${escapeXml(part.text)}</text>`;
    cursor += part.width + PART_GAP;
  }
  return { svg, bounds: { left, top, right: left + width } };
}

/** Builds the callout overlay as SVG markup sized to the source capture. */
export async function buildKeyboardShortcutOverlay(width = EXPECTED_SIZE.width, height = EXPECTED_SIZE.height) {
  let rings = "";
  let lines = "";
  let pills = "";
  for (const callout of CALLOUTS) {
    const [x0, y0, x1, y1] = callout.target;
    rings += `<rect x="${x0 - 3}" y="${y0 - 3}" width="${x1 - x0 + 6}" height="${y1 - y0 + 6}" rx="6" fill="none" stroke="${COLORS.accent}" stroke-width="2.2"/>`;
    const pill = await renderPill(callout.pill);
    const [lx0, ly0, lx1, ly1] = callout.line(pill.bounds);
    lines += `<line x1="${lx0}" y1="${ly0}" x2="${lx1}" y2="${ly1}" stroke="${COLORS.accent}" stroke-width="2"/>`
      + `<circle cx="${lx1}" cy="${ly1}" r="2.6" fill="${COLORS.accent}"/>`;
    pills += pill.svg;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rings}${lines}${pills}</svg>`;
}

/** Derives the keyboard-shortcut illustration from the active-change capture by overlaying shortcut callouts. */
export async function renderKeyboardShortcuts(
  source = resolve("assets/active-change.webp"),
  destination = resolve("assets/keyboard-shortcuts.webp"),
) {
  const { width, height } = await sharp(source).metadata();
  if (width !== EXPECTED_SIZE.width || height !== EXPECTED_SIZE.height) {
    throw new Error(`Expected a ${EXPECTED_SIZE.width}×${EXPECTED_SIZE.height} capture, got ${width}×${height}; update the callout coordinates.`);
  }
  const overlay = Buffer.from(await buildKeyboardShortcutOverlay(width, height));
  await sharp(source).composite([{ input: overlay }]).webp({ quality: 90, effort: 6 }).toFile(destination);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await renderKeyboardShortcuts();
  console.log("Rendered assets/keyboard-shortcuts.webp from assets/active-change.webp.");
}
