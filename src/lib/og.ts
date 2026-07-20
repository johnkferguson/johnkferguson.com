/**
 * Shared pieces for the OG/social card endpoints. Cards are SVG rendered
 * to PNG at build time via resvg, using static Newsreader instances from
 * src/assets/og-fonts/ (build-time-only inputs, never deployed).
 *
 * The generative art module emits CSS-var colors for the page context;
 * resvg knows no custom properties, so cards pin them to the dark
 * palette (cards are dark regardless of the reader's theme).
 */
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

export const OG = {
	width: 1200,
	height: 630,
	bg: "#1c1917",
	ink: "#e6e1db",
	muted: "#98928b",
	accent: "#d08770",
} as const;

const FONT_DIR = resolve("src/assets/og-fonts");

export function pinArtColors(svg: string): string {
	return svg
		.replaceAll("var(--code-color)", "#d08770")
		.replaceAll("var(--date-color)", "#98928b")
		.replaceAll("var(--accent-green)", "#a3be8c")
		.replaceAll("var(--bg)", OG.bg);
}

export function escapeXml(s: string): string {
	return s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** greedy word wrap by character budget (Newsreader's average advance
 * is close enough for card layout; resvg does the real shaping) */
export function wrapTitle(title: string, maxChars: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of title.split(/\s+/)) {
		const next = line ? `${line} ${word}` : word;
		if (line && next.length > maxChars) {
			lines.push(line);
			line = word;
		} else {
			line = next;
		}
	}
	if (line) lines.push(line);
	return lines;
}

export function renderPng(svg: string): Response {
	const resvg = new Resvg(svg, {
		font: {
			fontFiles: [
				`${FONT_DIR}/newsreader-og-semibold.ttf`,
				`${FONT_DIR}/newsreader-og-regular.ttf`,
			],
			loadSystemFonts: false,
		},
	});
	return new Response(new Uint8Array(resvg.render().asPng()), {
		headers: { "Content-Type": "image/png" },
	});
}
