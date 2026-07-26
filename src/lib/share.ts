/**
 * Which sharing controls a visitor should be offered.
 *
 * Two independent capability questions, never a device classification.
 * Classifying is what ages badly: an iPad with a trackpad reports
 * `hover: hover`, a Windows touchscreen laptop reports both, and browser
 * support for the Web Share API moves. Asking "is there a share sheet"
 * and "is the pointer coarse" separately means the awkward combination
 * is a state to render rather than a judgement call to get wrong.
 *
 * Touch devices get share alone because the OS sheet already contains a
 * Copy entry, so a second copy button would duplicate it. Desktop share
 * menus do not reliably lead with copy, so there both are offered.
 */

export type ShareControl = "copy" | "share";

export interface ShareCapabilities {
	/** navigator.share exists and can be called */
	hasShare: boolean;
	/** the primary pointer is touch-like (pointer: coarse) */
	coarsePointer: boolean;
}

export function shareControls({
	hasShare,
	coarsePointer,
}: ShareCapabilities): ShareControl[] {
	/* the sheet's own Copy entry covers the copy case */
	if (hasShare && coarsePointer) return ["share"];
	/* copy leads: pasting a link is the commoner intent on a pointer
	 * device, and copy is present in every state, so a left-to-right scan
	 * finds the same control in the same place everywhere */
	if (hasShare) return ["copy", "share"];
	return ["copy"];
}
