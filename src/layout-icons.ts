import type { DiffLayout } from "./diff-layout";

/** Matching vector icons in Obsidian's 100-unit custom-icon coordinate system. */
export const DIFF_LAYOUT_ICONS: Readonly<Record<DiffLayout, string>> = {
	auto: "side-by-side-diff-layout-auto",
	"side-by-side": "side-by-side-diff-layout-columns",
	"single-column": "side-by-side-diff-layout-rows"
};

/** Registers a shared frame with an Auto mark, column divider, or row divider. */
export function registerDiffLayoutIcons(register: (id: string, content: string) => void): void {
	const frame = '<rect x="14" y="18" width="72" height="64" rx="9"/>';
	const paths: Readonly<Record<DiffLayout, string>> = {
		auto: '<path d="M35 65 50 35 65 65M40 55h20"/>',
		"side-by-side": '<path d="M50 18v64"/>',
		"single-column": '<path d="M14 50h72"/>'
	};
	for (const layout of ["auto", "side-by-side", "single-column"] as const) {
		register(DIFF_LAYOUT_ICONS[layout], `<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${frame}${paths[layout]}</g>`);
	}
}
