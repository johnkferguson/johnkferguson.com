/**
 * Copy-to-clipboard behaviour shared by the heading anchors and the
 * end-of-post share controls: write, confirm, revert, stay silent on
 * failure.
 *
 * Lives beside the components rather than in src/lib/, which is
 * DOM-free pure modules by convention. The one genuinely pure part of
 * this feature, deciding which controls to show, is in lib/share.ts and
 * is unit tested; everything here needs a document.
 */

/** One polite live region per page, not one per button. */
let live: HTMLElement | null = null;

function liveRegion(): HTMLElement {
	if (live?.isConnected) return live;
	live = document.createElement("div");
	live.setAttribute("aria-live", "polite");
	live.style.cssText =
		"position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)";
	document.body.append(live);
	return live;
}

export function announce(message: string): void {
	const region = liveRegion();
	region.textContent = message;
}

export function clearAnnouncement(): void {
	if (live?.isConnected) live.textContent = "";
}

/** Writes to the clipboard. False means it did not happen, and the
 * caller must not claim otherwise: clipboard access throws in
 * locked-down contexts, and a check mark there is a lie. */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export interface CopyButtonOptions {
	/** resolved at click time, so it follows the current URL */
	url: () => string;
	/** paint the resting state */
	idle: () => void;
	/** paint the confirmed state */
	copied: () => void;
	announcement?: string;
	/** how long the confirmed state holds */
	ms?: number;
}

/** Wires a button to copy, confirm, and revert. Returns a function that
 * runs the same copy-and-confirm, so another control (the share button
 * falling back) can reuse the identical feedback. */
export function attachCopyButton(
	btn: HTMLElement,
	{
		url,
		idle,
		copied,
		announcement = "Link copied",
		ms = 1200,
	}: CopyButtonOptions,
): () => Promise<void> {
	let timer: number | undefined;

	const run = async () => {
		if (!(await copyText(url()))) return;
		announce(announcement);
		copied();
		clearTimeout(timer);
		timer = window.setTimeout(() => {
			idle();
			clearAnnouncement();
		}, ms);
	};

	btn.addEventListener("click", run);
	return run;
}
