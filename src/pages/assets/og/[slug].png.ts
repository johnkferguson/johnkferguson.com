import type { APIContext } from "astro";
import { artSvg } from "../../../lib/art/generate";
import {
	escapeXml,
	OG,
	pinArtColors,
	renderPng,
	wrapTitle,
} from "../../../lib/og";
import { getVisiblePosts } from "../../../lib/posts";
import { readingTimeMinutes } from "../../../lib/reading-time";

/* per-post cards: the same slug-seeded art the post page lands on,
 * thinned behind the title block, so the share preview matches the page */

export async function getStaticPaths() {
	const posts = await getVisiblePosts();
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { post },
	}));
}

export function GET({ props }: APIContext) {
	const { post } = props;
	const title: string = post.data.title;
	const date: string = post.data.date.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	const minutes = readingTimeMinutes(post.body ?? "", post.data.pace);

	/* long titles drop a size before they wrap to a third line */
	let size = 72;
	let lines = wrapTitle(title, 26);
	if (lines.length > 2) {
		size = 58;
		lines = wrapTitle(title, 33);
	}
	const lineHeight = size * 1.16;
	const blockTop = 300 - ((lines.length - 1) * lineHeight) / 2;

	const art = pinArtColors(
		artSvg({
			seedKey: post.data.art?.seed ?? post.id,
			family: post.data.art?.family,
			width: OG.width,
			height: OG.height,
			quiet: { x: 0.04, y: 0.22, w: 0.92, h: 0.56 },
			quietStrength: 0.28,
		}),
	);

	const titleText = lines
		.map(
			(line, i) =>
				`<text x="90" y="${(blockTop + i * lineHeight).toFixed(0)}" font-family="Newsreader 16pt" font-weight="600" font-size="${size}" fill="${OG.ink}">${escapeXml(line)}</text>`,
		)
		.join("\n  ");

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG.width} ${OG.height}" width="${OG.width}" height="${OG.height}">
  <rect width="${OG.width}" height="${OG.height}" fill="${OG.bg}"/>
  <g opacity="0.5">${art}</g>
  ${titleText}
  <text x="90" y="${(blockTop + (lines.length - 1) * lineHeight + 58).toFixed(0)}" font-family="Newsreader 16pt" font-weight="400" font-size="28" fill="${OG.muted}">${escapeXml(date)} &#183; ${minutes} min read</text>
  <rect x="90" y="546" width="44" height="2" fill="${OG.accent}"/>
  <text x="90" y="588" font-family="Newsreader 16pt" font-weight="400" font-size="26" fill="${OG.muted}">johnkferguson.com</text>
</svg>`;

	return renderPng(svg);
}
