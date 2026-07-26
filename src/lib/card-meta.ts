/**
 * Classifies a social card image by its URL path and returns everything
 * the <head> can honestly say about it.
 *
 * One classifier, one answer: alt text and dimensions are derived from
 * the same decision, so they cannot disagree about which image is in
 * hand. Keying alt off the page type instead would assert a title card
 * for any custom image an article supplied, which is the same
 * confident-wrong-answer the dimensions deliberately avoid, in the one
 * field a screen reader actually reads out.
 *
 * An image we did not draw returns null: no alt and no dimensions. A
 * generic fallback ("Card for X") would only repeat the headline the
 * preview already shows, while implying the image holds nothing else,
 * which is worse than silence for the person relying on it.
 */
import {
	OG_SIZE,
	POST_CARD_PREFIX,
	SITE_CARD_PATH,
	SITE_NAME,
	SITE_TAGLINE,
} from "../consts";

export interface CardMeta {
	alt: string;
	width: number;
	height: number;
}

export function cardMeta(
	pathname: string,
	{ title }: { title: string },
): CardMeta | null {
	/* the two routes are matched separately rather than by a shared
	 * "/assets/og" prefix, which would also swallow /assets/ogre.png and
	 * any future /assets/og-diagram.png */
	if (pathname.startsWith(POST_CARD_PREFIX)) {
		return {
			alt: `Title card reading "${title}" over generated artwork`,
			...OG_SIZE,
		};
	}
	if (pathname === SITE_CARD_PATH) {
		return {
			alt: `Card reading "${SITE_NAME}: ${SITE_TAGLINE}" over generated artwork`,
			...OG_SIZE,
		};
	}
	return null;
}
