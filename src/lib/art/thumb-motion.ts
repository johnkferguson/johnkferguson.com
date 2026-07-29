/**
 * Hover motion for homepage thumbnails, shared by the real card list and
 * the dev art picker's preview so the two cannot drift apart.
 *
 * Pinned motion carries SMIL that starts from rest, so a thumbnail is
 * pixel-identical to the static render until it is hovered. Known trade:
 * SMIL ignores prefers-reduced-motion natively and this script is the
 * only gate, so with JS disabled the (gentle, from-rest) motion runs for
 * everyone.
 */

/**
 * Attach hover play/pause to one thumbnail; a no-op for static art.
 *
 * Returns a disposer. The homepage renders its cards once and can ignore
 * it; the dev picker re-renders its preview on every dial change, where
 * the trigger element outlives the svg and listeners would otherwise
 * stack up, one per regeneration.
 */
export function attachThumbMotion(
	trigger: HTMLElement,
	svg: SVGSVGElement,
): () => void {
	const noop = () => {};
	if (!svg.querySelector("animate, animateTransform")) return noop;
	svg.pauseAnimations();
	svg.setCurrentTime(0);
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return noop;

	/* the snapshot-fees piece cycles through books separated by brief
	 * clears, and publishes its timings here rather than having this
	 * script hardcode numbers the piece owns. Art without them (drift
	 * motion) has no blank frames and just rewinds. */
	const cycle = svg.querySelector("[data-snapshot-slot]");
	const slotMs = Number(cycle?.getAttribute("data-snapshot-slot") ?? 0);
	const bookMs = Number(cycle?.getAttribute("data-snapshot-book") ?? 0);
	const leadMs = Number(cycle?.getAttribute("data-snapshot-lead") ?? 0);

	const ac = new AbortController();
	const { signal } = ac;
	trigger.addEventListener(
		"mouseenter",
		() => {
			/* The card sits on a still book until it is pointed at, so
			 * playing from where it rests means waiting out a whole hold
			 * before the first seal, which reads as nothing happening.
			 * Skip ahead so the showing book has only the lead-in left,
			 * and do it on every entry, not just the first: coming back to
			 * a card paused early in a book has the same dead wait. */
			if (slotMs) {
				const ms = svg.getCurrentTime() * 1000;
				const left = bookMs - (ms % slotMs);
				if (left > leadMs) svg.setCurrentTime((ms + left - leadMs) / 1000);
			}
			svg.unpauseAnimations();
		},
		{ signal },
	);
	trigger.addEventListener(
		"mouseleave",
		() => {
			const ms = svg.getCurrentTime() * 1000;
			svg.pauseAnimations();
			/* hold whichever book is showing; a clear is a blank frame, so
			 * rewind to the first book rather than resting on nothing */
			if (!slotMs || ms % slotMs >= bookMs) svg.setCurrentTime(0);
		},
		{ signal },
	);
	return () => ac.abort();
}
