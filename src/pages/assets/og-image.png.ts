import { SITE_NAME, SITE_TAGLINE } from "../../consts";
import { artSvg } from "../../lib/art/generate";
import {
	escapeXml,
	missingGlyphs,
	OG,
	OG_FAMILY,
	pinArtColors,
	renderPng,
} from "../../lib/og";

/* the site card: identity art (field, like the homepage) thinned behind
 * the centered name */
export function GET() {
	const missing = missingGlyphs(`${SITE_NAME}${SITE_TAGLINE}`);
	if (missing.length > 0) {
		throw new Error(
			`OG site card: the card fonts cannot draw ${missing.join(", ")}. Extend scripts/build-og-fonts.py.`,
		);
	}

	const art = pinArtColors(
		artSvg({
			seedKey: "og-home",
			family: "field",
			width: OG.width,
			height: OG.height,
			quiet: { x: 0.12, y: 0.3, w: 0.76, h: 0.4 },
			quietStrength: 0.3,
		}),
	);

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG.width} ${OG.height}" width="${OG.width}" height="${OG.height}">
  <rect width="${OG.width}" height="${OG.height}" fill="${OG.bg}"/>
  <g opacity="0.55">${art}</g>
  <text x="600" y="310" text-anchor="middle" font-family="${OG_FAMILY}" font-weight="600" font-size="78" fill="${OG.ink}">${escapeXml(SITE_NAME)}</text>
  <rect x="570" y="352" width="60" height="2" fill="${OG.accent}"/>
  <text x="600" y="412" text-anchor="middle" font-family="${OG_FAMILY}" font-weight="400" font-size="31" fill="${OG.muted}">${escapeXml(SITE_TAGLINE)}</text>
</svg>`;

	return renderPng(svg);
}
