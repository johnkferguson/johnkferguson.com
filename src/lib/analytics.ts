import { canonicalPath } from "./canonical";

/* GoatCounter counts only on the production host. BaseLayout's inline
 * guard applies this, and is the only place the rule runs: lab events
 * read the flag it sets (components/lab-tracking.ts), so pageviews and
 * events cannot disagree about a host. */
export const COUNTED_HOST = "johnkferguson.com";

export type LabEventKind = "seen" | "used";

/* lab/<post>/<lab>/<kind>, from the page path and the .labwrap anchor id.
 * Lab ids default to lab-<slugged title>, so a retitled lab starts a new
 * series in the dashboard. */
export function labEventPath(
	pathname: string,
	labId: string,
	kind: LabEventKind,
): string {
	const page = canonicalPath(pathname).replace(/^\//, "") || "home";
	const lab = labId.replace(/^lab-/, "");
	return `lab/${page}/${lab}/${kind}`;
}

/* Half the lab, or half the viewport when the lab is taller than that. A
 * plain ratio threshold cannot work: a 1400px lab on a 667px phone never
 * shows more than 47% of itself. */
export function coversEnough(
	visibleHeight: number,
	labHeight: number,
	viewportHeight: number,
): boolean {
	return (
		visibleHeight > 0 &&
		visibleHeight >= 0.5 * Math.min(labHeight, viewportHeight)
	);
}

/* How long a lab must stay covered before it counts as seen, so smooth
 * scrolls and TOC jumps that pass through it record nothing. */
export const SEEN_DWELL_MS = 1000;

export interface Timers {
	set(fn: () => void, ms: number): unknown;
	clear(id: unknown): void;
}

export interface LabTracker {
	/** Report whether the lab currently covers enough of the viewport. */
	visibility(covered: boolean): void;
	/** Report a real interaction with the lab's controls. */
	use(): void;
}

/* Once-per-page-view state for one lab: "seen" after SEEN_DWELL_MS of
 * continuous coverage, "used" on the first interaction. */
export function labTracker(
	fire: (kind: LabEventKind) => void,
	timers: Timers,
): LabTracker {
	let seen = false;
	let used = false;
	let pending: unknown = null;
	return {
		visibility(covered) {
			if (seen) return;
			if (covered && pending === null) {
				pending = timers.set(() => {
					pending = null;
					seen = true;
					fire("seen");
				}, SEEN_DWELL_MS);
			} else if (!covered && pending !== null) {
				timers.clear(pending);
				pending = null;
			}
		},
		use() {
			if (used) return;
			used = true;
			fire("used");
		},
	};
}
