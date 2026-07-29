import { type RefObject, useEffect, useState } from "react";

/**
 * How tall a drag handle should be drawn, in the chart's own units.
 *
 * The charts are drawn in a fixed coordinate space and painted at whatever
 * width the panel gives them, so a handle written as 16 units is a
 * comfortable 10px beside a desktop chart and 5px on a phone, where the
 * same space is squashed to a third. A finger needs more than that, and
 * there is no widening it sideways: a handle is one price level wide and
 * its neighbours are next to it.
 *
 * So on a coarse pointer this measures how many units a CSS pixel is
 * currently worth and returns whichever is larger, the drawn height or
 * `minPx` of them. A mouse can hit the drawn height, and gets it unchanged.
 */
export function useGrabUnits(
	ref: RefObject<SVGSVGElement | null>,
	viewBoxWidth: number,
	drawn = 16,
	minPx = 24,
): number {
	const [units, setUnits] = useState(drawn);

	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		// a mouse keeps the drawn height, so nothing is measured for it
		if (!window.matchMedia("(pointer: coarse)").matches) return;

		const ro = new ResizeObserver(([entry]) => {
			const w = entry.contentRect.width;
			if (w > 0) setUnits(Math.max(drawn, (minPx * viewBoxWidth) / w));
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [ref, viewBoxWidth, drawn, minPx]);

	return units;
}
