/** Selects a fixed comparison layout or follows the available view width. */
export type DiffLayout = "auto" | "side-by-side" | "single-column";
export type ResolvedDiffLayout = Exclude<DiffLayout, "auto">;

export const SINGLE_COLUMN_BREAKPOINT = 720;

/** Validates persisted settings and workspace layout preferences. */
export function isDiffLayout(value: unknown): value is DiffLayout {
	return value === "auto" || value === "side-by-side" || value === "single-column";
}

/** Cycles through explicit preferences without resolving Auto to a screen layout. */
export function getNextDiffLayout(layout: DiffLayout): DiffLayout {
	return layout === "auto" ? "side-by-side" : layout === "side-by-side" ? "single-column" : "auto";
}

/** Uses the comparison's width, retaining the wide layout before a view is measurable. */
export function resolveDiffLayout(preference: DiffLayout, width: number): ResolvedDiffLayout {
	return preference === "auto"
		? width > 0 && width < SINGLE_COLUMN_BREAKPOINT ? "single-column" : "side-by-side"
		: preference;
}
