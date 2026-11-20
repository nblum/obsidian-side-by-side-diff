import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Coordinates refer to the 1x `active-change.webp` capture (936 × 722). Adjust them when the captured layout moves.
const EXPECTED_SIZE = { width: 936, height: 722 };
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
    target: [770, 22, 877, 52],
    pill: { x: 752, y: 11, anchor: "right", label: "Save", keys: ["Ctrl/Cmd", "S"] },
    line: (pill) => [pill.right, 11, 767, 19],
  },
  {
    target: [25, 165, 53, 189],
    pill: { x: 68, y: 177, anchor: "left", label: "Undo", keys: ["Ctrl/Cmd", "Z"] },
    line: (pill) => [56, 177, pill.left, 177],
  },
  {
    target: [849, 165, 877, 189],
    pill: { x: 856, y: 225, anchor: "right", keys: ["Alt", "↑"] },
    line: (pill) => [831, pill.top, 863, 192],
  },
  {
    target: [883, 165, 911, 189],
    pill: { x: 862, y: 225, anchor: "left", keys: ["Alt", "↓"] },
    line: (pill) => [890, pill.top, 897, 192],
  },
  {
    target: [425, 375, 469, 407],
    pill: { x: 416, y: 360, anchor: "right", label: "Accept", keys: ["Alt", "→"] },
    line: (pill) => [pill.right, 360, 447, 372],
  },
  {
    target: [469, 375, 513, 407],
    pill: { x: 526, y: 360, anchor: "left", label: "Ignore", keys: ["Alt", "←"] },
    line: (pill) => [pill.left, 360, 491, 372],
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
