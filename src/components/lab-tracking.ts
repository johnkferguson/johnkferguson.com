/**
 * GoatCounter events for every <Lab> on a page: "seen" and "used", each
 * at most once per page view.
 *
 * Lives beside the components rather than in src/lib/, which is DOM-free
 * by convention. The decisions (coverage, dwell, once-only, event names)
 * are pure and unit tested in lib/analytics.ts; this file only feeds them
 * DOM events.
 */
import {
	coversEnough,
	type LabEventKind,
	labEventPath,
	labTracker,
} from "../lib/analytics";

type GoatCounter = {
	no_onload?: boolean;
	count?: (vars: { path: string; title: string; event: boolean }) => void;
};

/* read on every call, never cached: count.js attaches count() to this
 * object only once it has loaded */
const goatcounter = () => (window as { goatcounter?: GoatCounter }).goatcounter;

function send(path: string) {
	const fire = () => {
		/* count.js reads localStorage unguarded, which throws when site
		 * data is blocked; a lost event must not break the page */
		try {
			goatcounter()?.count?.({ path, title: document.title, event: true });
		} catch {}
	};
	if (goatcounter()?.count) return fire();
	/* count.js loads async, so a lab can be used before it arrives; if a
	 * blocker drops the script, this never fires */
	document
		.querySelector("script[data-goatcounter]")
		?.addEventListener("load", fire, { once: true });
}

/* Real use only. click covers buttons, keyboard activation and drags on
 * the chart controls, and a browser sends no click after a touch scroll;
 * input and change cover sliders, arrow keys included. Tab and pointerdown
 * are deliberately absent: both fire for readers just passing through. */
const USE_EVENTS = ["click", "input", "change"] as const;

/* 0, 0.05 ... 1: coverage is judged in pixels, so the observer has to
 * report ratios well below the 0.5 a tall lab never reaches */
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

export function trackLabs(): void {
	/* BaseLayout's host guard sets no_onload; it is the only copy of the
	 * production-host rule, and no guard means no counting */
	if (goatcounter()?.no_onload !== false) return;

	const labs = document.querySelectorAll<HTMLElement>(".labwrap[id]");
	const trackers = new Map<Element, ReturnType<typeof labTracker>>();
	const timers = {
		set: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
		clear: (id: unknown) => window.clearTimeout(id as number),
	};

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				trackers
					.get(entry.target)
					?.visibility(
						coversEnough(
							entry.intersectionRect.height,
							entry.boundingClientRect.height,
							entry.rootBounds?.height ?? window.innerHeight,
						),
					);
			}
		},
		{ threshold: THRESHOLDS },
	);

	for (const el of labs) {
		const onUse = (e: Event) => {
			/* the title strip and its copy-link button are not the lab */
			if ((e.target as Element | null)?.closest?.(".lab-head")) return;
			for (const type of USE_EVENTS) el.removeEventListener(type, onUse);
			trackers.get(el)?.use();
		};
		const fire = (kind: LabEventKind) => {
			if (kind === "seen") observer.unobserve(el);
			send(labEventPath(location.pathname, el.id, kind));
		};
		trackers.set(el, labTracker(fire, timers));
		observer.observe(el);
		for (const type of USE_EVENTS) el.addEventListener(type, onUse);
	}
}
