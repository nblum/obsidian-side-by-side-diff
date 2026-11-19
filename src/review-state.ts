import { getDiffRowKey, indexDiffRows, type DiffDirection, type IndexedDiffRow } from "./diff-core.ts";
import { createComparisonModelFromLines, type ComparisonOptions, type ComparisonRowModel } from "./diff-model.ts";

export type ReviewStatus = "open" | "accepted" | "ignored";
export interface ReviewCounts {
	readonly open: number;
	readonly accepted: number;
	readonly ignored: number;
}

/** Keeps original aligned row identities while accepted target lines are inserted or removed. */
export class ReviewState {
	private cachedRows: ComparisonRowModel[] | null = null;
	private ignoredKeys: Set<string> | null = null;
	private statuses: (ReviewStatus | null)[];
	private originalRows: ComparisonRowModel[];
	private readonly direction: DiffDirection;
	private readonly alignByHeadings: boolean;

	/** Captures one review's alignment; array positions identify original rows, including duplicates. */
	constructor(left: string[], right: string[], options: ComparisonOptions, direction: DiffDirection) {
		this.originalRows = createComparisonModelFromLines(left, right, options).rows;
		this.statuses = this.originalRows.map(row => row.equal ? null : "open");
		this.direction = direction;
		this.alignByHeadings = options.alignMarkdownByHeadings === true;
	}

	/** Projects accepted content without re-aligning or losing target-only deletion entries. */
	getRows(): ComparisonRowModel[] {
		if (this.cachedRows !== null) return this.cachedRows;
		this.cachedRows = indexDiffRows(this.originalRows.map((row, index) => {
			if (this.statuses[index] !== "accepted") return row;
			const value = this.direction === "left-to-right" ? row.left : row.right;
			return { ...row, left: value, right: value, equal: true, type: "equal" as const, leftInlineTokens: [], rightInlineTokens: [] };
		})) as ComparisonRowModel[];
		return this.cachedRows;
	}

	/** Rebases on explicitly saved content without re-aligning still-open or ignored entries. */
	commit(): void {
		const rows = this.getRows();
		const statuses = this.statuses;
		this.originalRows = [];
		this.statuses = [];
		rows.forEach((row, index) => {
			// A saved target-only deletion no longer needs a marker or a placeholder row.
			if (row.left === null && row.right === null) return;
			this.originalRows.push(row);
			this.statuses.push(statuses[index] === "accepted" ? null : statuses[index] ?? null);
		});
		this.invalidate();
	}

	/** Detects new file contents so decisions cannot accidentally attach to unrelated rows. */
	matches(left: string[], right: string[], options: ComparisonOptions, direction: DiffDirection): boolean {
		if (direction !== this.direction || (options.alignMarkdownByHeadings === true) !== this.alignByHeadings) return false;
		const rows = this.getRows();
		return this.matchesSide(rows, left, "left") && this.matchesSide(rows, right, "right");
	}

	/** Compares literal lines, retaining blank lines and ignoring only alignment gaps. */
	private matchesSide(rows: IndexedDiffRow[], lines: string[], side: "left" | "right"): boolean {
		const actual = rows.flatMap(row => row[side] === null ? [] : [row[side]]);
		return actual.length === lines.length && actual.every((line, index) => line === lines[index]);
	}

	/** Returns a defensive snapshot for the session's existing undo stack. */
	snapshot(): (ReviewStatus | null)[] { return [...this.statuses]; }

	/** Restores exactly the statuses belonging to one undone row or block action. */
	restore(statuses: readonly (ReviewStatus | null)[]): void { this.statuses = [...statuses]; this.invalidate(); }

	/** Returns a status only for an original changed row. */
	getStatus(index: number): ReviewStatus | null { return this.statuses[index] ?? null; }

	/** Accepts only open entries; ignored rows remain untouched by block acceptance. */
	accept(indexes: readonly number[]): void {
		for (const index of indexes) if (this.statuses[index] === "open") this.statuses[index] = "accepted";
		this.invalidate();
	}

	/** Resolves currently displayed keys while retaining their original identities. */
	ignore(keys: readonly string[]): void {
		if (keys.length === 0) return;
		const selected = new Set(keys);
		this.getRows().forEach((row, index) => {
			if (this.statuses[index] === "open" && selected.has(getDiffRowKey(row))) this.statuses[index] = "ignored";
		});
		this.invalidate();
	}

	/** Reopens remapped ignored entries when undo survives exchanging the panes. */
	reopen(keys: readonly string[]): void {
		if (keys.length === 0) return;
		const selected = new Set(keys);
		this.getRows().forEach((row, index) => {
			if (this.statuses[index] === "ignored" && selected.has(getDiffRowKey(row))) this.statuses[index] = "open";
		});
		this.invalidate();
	}

	/** Invalidates only data derived from review decisions. */
	private invalidate(): void { this.cachedRows = null; this.ignoredKeys = null; }

	/** Tests ignored membership without traversing the alignment for every row. */
	hasIgnoredKey(key: string): boolean {
		this.ignoredKeys ??= new Set(this.getIgnoredKeys());
		return this.ignoredKeys.has(key);
	}

	/** Returns ignored keys at their current target positions for saving and swapping. */
	getIgnoredKeys(): string[] {
		return this.getRows().flatMap((row, index) => this.statuses[index] === "ignored" ? [getDiffRowKey(row)] : []);
	}

	/** Counts original changed rows, independently of rendered elements and disk writes. */
	getCounts(): ReviewCounts {
		const counts = { open: 0, accepted: 0, ignored: 0 };
		for (const status of this.statuses) if (status !== null) counts[status] += 1;
		return counts;
	}
}
