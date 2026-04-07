import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { SITE_NAME, SITE_TAGLINE } from "../../consts";

const fontDir = resolve("public/assets/fonts");

export function GET() {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#1c1917"/>
  <text x="600" y="280" text-anchor="middle" font-family="Inter" font-weight="bold" font-size="72" fill="white">${SITE_NAME}</text>
  <text x="600" y="370" text-anchor="middle" font-family="Inter" font-size="32" fill="#94a3b8">${SITE_TAGLINE}</text>
</svg>`;

	const resvg = new Resvg(svg, {
		font: {
			fontFiles: [`${fontDir}/Inter-Bold.ttf`, `${fontDir}/Inter-Regular.ttf`],
			loadSystemFonts: false,
		},
	});

	const png = resvg.render().asPng();

	return new Response(png, {
		headers: { "Content-Type": "image/png" },
	});
}
