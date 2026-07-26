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
/* Bumped on every announcement. Each caller keeps the token it was given
 * and only clears if it is still the latest, so a button whose 1200ms
 * timer expires cannot blank a message another button posted since. With
 * one region shared between the heading anchors and the share strand,
 * that overlap is a couple of clicks apart. */
let announcementToken = 0;

function liveRegion(): HTMLElement {
	if (live?.isConnected) return live;
	live = document.createElement("div");
	live.setAttribute("aria-live", "polite");
	live.style.cssText =
		"position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)";
	document.body.append(live);
	return live;
}

export function announce(message: string): number {
	const region = liveRegion();
	region.textContent = message;
	announcementToken += 1;
	return announcementToken;
}

export function clearAnnouncement(token: number): void {
	if (token !== announcementToken) return;
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
	/** Live-region message, or null for a control whose accessible NAME
	 * already changes to say it (announcing as well makes some screen
	 * readers report the confirmation twice). The icon-only heading
	 * anchors keep a static aria-label, so they need this; the strand's
	 * button renames itself to "Copied", so it does not. */
	announcement?: string | null;
	/** how long the confirmed state holds */
	ms?: number;
}

/** The copy-confirm-revert cycle, unbound. Split from the click wiring so
 * a control that is not primarily a copy button (the share button, which
 * only copies when the sheet fails) can own the same feedback without
 * also copying on every press. */
export function copyAction({
	url,
	idle,
	copied,
	announcement = "Link copied",
	ms = 1200,
}: CopyButtonOptions): () => Promise<void> {
	let timer: number | undefined;

	const run = async () => {
		if (!(await copyText(url()))) return;
		const token = announcement === null ? null : announce(announcement);
		copied();
		clearTimeout(timer);
		timer = window.setTimeout(() => {
			idle();
			if (token !== null) clearAnnouncement(token);
		}, ms);
	};

	return run;
}

/** copyAction, wired to the button's own click. */
export function attachCopyButton(
	btn: HTMLElement,
	opts: CopyButtonOptions,
): () => Promise<void> {
	const run = copyAction(opts);
	btn.addEventListener("click", run);
	return run;
}
