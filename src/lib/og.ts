/**
 * Shared pieces for the OG/social card endpoints. Cards are SVG rendered
 * to PNG at build time via resvg, using static Newsreader instances from
 * src/assets/og-fonts/ (build-time-only inputs, never deployed, built by
 * scripts/build-og-fonts.py).
 *
 * Two things the renderer cannot tell us about, so we check them here:
 * resvg draws a missing glyph as an empty box without erroring, and it
 * ignores CSS custom properties (the art module emits them), so both are
 * validated before rendering rather than discovered on someone's feed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { OG_SIZE } from "../consts";
import type { ArtFamily, ArtOptions } from "./art/generate";
import { getPiece } from "./art/pieces";
import { palette } from "./palette";

/* cards are always drawn in the dark palette, whatever theme the reader
 * is in — a share preview has no theme to follow */
export const OG = {
	...OG_SIZE,
	bg: palette.dark["--bg"],
	ink: palette.dark["--heading-color"],
	muted: palette.dark["--date-color"],
	accent: palette.dark["--code-color"],
} as const;

/** Family name written into the instances by build-og-fonts.py. The card
 * SVGs select fonts by this string; og.test.ts asserts the files agree. */
export const OG_FAMILY = "Newsreader OG";

/**
 * How the card asks for its art. Shared with the drift guard
 * (pinned-art.test.ts) rather than restated there: a guard that keeps
 * its own copy of these numbers can silently stop describing the card
 * it is supposed to be watching, which is the failure it exists to
 * catch.
 *
 * A piece may narrow the zone for its own card; everything else keeps
 * the shared default, so tuning one artwork cannot redraw the rest.
 */
export function ogArtOptions(
	art:
		| {
				seed?: string;
				family?: string;
				piece?: string;
				params?: Record<string, number>;
		  }
		| undefined,
	/** seed to fall back to when the post pins none; the post's id */
	fallbackSeed: string,
): ArtOptions {
	const pieceQuiet = art?.piece ? getPiece(art.piece)?.ogQuiet : undefined;
	return {
		seedKey: art?.seed ?? fallbackSeed,
		family: art?.family as ArtFamily | undefined,
		piece: art?.piece,
		params: art?.params,
		width: OG.width,
		height: OG.height,
		quiet: pieceQuiet?.rect ?? { x: 0.04, y: 0.22, w: 0.92, h: 0.56 },
		quietStrength: pieceQuiet?.strength ?? 0.28,
		/* the card's zone is big enough that clipping under it turns art
		 * into a flat mass; scale it to fit instead. Pieces that ignore
		 * the hint are unaffected. */
		quietFit: "scale",
	};
}

/* cwd-relative ON PURPOSE. An import.meta.url-relative path looks
 * sturdier but breaks the production build: Astro bundles endpoint
 * modules into dist/.prerender/, so the module's own directory has no
 * assets/ beside it (ENOENT on every card). Astro always builds from the
 * project root, so cwd is the stable anchor; og.test.ts asserts the
 * files resolve. */
const FONT_DIR = resolve("src/assets/og-fonts");

export const FONT_FILES = [
	`${FONT_DIR}/newsreader-og-semibold.ttf`,
	`${FONT_DIR}/newsreader-og-regular.ttf`,
	`${FONT_DIR}/newsreader-og-semibold-ext.ttf`,
	`${FONT_DIR}/newsreader-og-regular-ext.ttf`,
];

/* ——— minimal TrueType reader: advance widths and glyph coverage ———
 * Enough of cmap/hmtx/hhea to lay out a line exactly as resvg will.
 * Avoids a font-parsing dependency for what is a few table reads. */

interface FontMetrics {
	unitsPerEm: number;
	/** codepoint -> advance width in font units */
	advances: Map<number, number>;
}

function parseFont(path: string): FontMetrics {
	const buf = readFileSync(path);
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const numTables = view.getUint16(4);
	const tables = new Map<string, number>();
	for (let i = 0; i < numTables; i++) {
		const rec = 12 + i * 16;
		const tag = String.fromCharCode(
			buf[rec],
			buf[rec + 1],
			buf[rec + 2],
			buf[rec + 3],
		);
		tables.set(tag, view.getUint32(rec + 8));
	}

	const head = tables.get("head");
	const hhea = tables.get("hhea");
	const hmtx = tables.get("hmtx");
	const cmap = tables.get("cmap");
	if (!head || !hhea || !hmtx || !cmap) {
		throw new Error(`${path}: missing required font tables`);
	}
	const unitsPerEm = view.getUint16(head + 18);
	const numHMetrics = view.getUint16(hhea + 34);

	/* cmap: prefer a format 4 unicode subtable (what these files carry) */
	const numSubtables = view.getUint16(cmap + 2);
	let sub = 0;
	for (let i = 0; i < numSubtables; i++) {
		const rec = cmap + 4 + i * 8;
		const platform = view.getUint16(rec);
		const encoding = view.getUint16(rec + 2);
		const offset = view.getUint32(rec + 4);
		const isUnicode =
			platform === 3 ? encoding === 1 || encoding === 10 : platform === 0;
		if (isUnicode && view.getUint16(cmap + offset) === 4) sub = cmap + offset;
	}
	if (!sub) throw new Error(`${path}: no format 4 unicode cmap`);

	const segCount = view.getUint16(sub + 6) / 2;
	const ends = sub + 14;
	const starts = ends + segCount * 2 + 2;
	const deltas = starts + segCount * 2;
	const rangeOffsets = deltas + segCount * 2;

	const advanceOf = (glyphId: number): number =>
		view.getUint16(
			hmtx + (glyphId < numHMetrics ? glyphId : numHMetrics - 1) * 4,
		);

	const advances = new Map<number, number>();
	for (let seg = 0; seg < segCount; seg++) {
		const end = view.getUint16(ends + seg * 2);
		const start = view.getUint16(starts + seg * 2);
		if (start === 0xffff) continue;
		const delta = view.getInt16(deltas + seg * 2);
		const rangeOffset = view.getUint16(rangeOffsets + seg * 2);
		for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
			let glyphId: number;
			if (rangeOffset === 0) {
				glyphId = (cp + delta) & 0xffff;
			} else {
				const addr = rangeOffsets + seg * 2 + rangeOffset + (cp - start) * 2;
				if (addr + 1 >= buf.byteLength) continue;
				const raw = view.getUint16(addr);
				if (raw === 0) continue;
				glyphId = (raw + delta) & 0xffff;
			}
			if (glyphId !== 0) advances.set(cp, advanceOf(glyphId));
		}
	}
	return { unitsPerEm, advances };
}

let boldMetrics: FontMetrics | null = null;
function metrics(): FontMetrics {
	if (boldMetrics) return boldMetrics;
	/* title layout uses the semibold cut; merge the ext face's coverage so
	 * width and coverage checks see every glyph resvg can draw */
	const latin = parseFont(FONT_FILES[0]);
	const ext = parseFont(FONT_FILES[2]);
	for (const [cp, adv] of ext.advances) {
		if (!latin.advances.has(cp)) latin.advances.set(cp, adv);
	}
	boldMetrics = latin;
	return latin;
}

/** rendered width of a string at a given px size, in the title face */
export function textWidth(text: string, size: number): number {
	const { unitsPerEm, advances } = metrics();
	let units = 0;
	for (const ch of text) units += advances.get(ch.codePointAt(0) ?? 0) ?? 0;
	return (units * size) / unitsPerEm;
}

/** codepoints the card fonts cannot draw (resvg would emit empty boxes) */
export function missingGlyphs(text: string): string[] {
	const { advances } = metrics();
	const missing = new Set<string>();
	for (const ch of text) {
		if (ch === " " || ch === "\n") continue;
		if (!advances.has(ch.codePointAt(0) ?? 0)) missing.add(ch);
	}
	return [...missing];
}

export function pinArtColors(svg: string): string {
	/* every token in the dark palette, so adding one to palette.ts is all
	 * it takes for the art module to be able to use it */
	let pinned = svg;
	for (const [prop, hex] of Object.entries(palette.dark)) {
		pinned = pinned.replaceAll(`var(${prop})`, hex);
	}
	/* resvg silently drops attributes it cannot parse, so an unmapped
	 * variable would ship as an invisible shape; fail the build instead */
	const leftover = pinned.match(/var\(--[a-z0-9-]+\)/i);
	if (leftover) {
		throw new Error(
			`OG card art contains an unmapped CSS variable: ${leftover[0]}. Add it to the dark palette in src/lib/palette.ts.`,
		);
	}
	return pinned;
}

export function escapeXml(s: string): string {
	return s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export interface TitleLayout {
	lines: string[];
	size: number;
	lineHeight: number;
}

/**
 * Greedy word wrap measured in real pixels (character budgets are off by
 * up to 3.5x between "iiii" and "MMMM", which clipped wide title-case
 * titles off the card). Steps the size down until the title fits the
 * available width in at most maxLines.
 */
export function layoutTitle(
	title: string,
	maxWidth: number,
	sizes: number[] = [72, 64, 58, 52, 46],
	maxLines = 3,
): TitleLayout {
	const wrapAt = (size: number): string[] => {
		const lines: string[] = [];
		let line = "";
		for (const word of title.split(/\s+/).filter(Boolean)) {
			const next = line ? `${line} ${word}` : word;
			if (line && textWidth(next, size) > maxWidth) {
				lines.push(line);
				line = word;
			} else {
				line = next;
			}
		}
		if (line) lines.push(line);
		return lines;
	};

	for (const size of sizes) {
		const lines = wrapAt(size);
		const fits =
			lines.length <= maxLines &&
			lines.every((l) => textWidth(l, size) <= maxWidth);
		if (fits) return { lines, size, lineHeight: size * 1.16 };
	}
	/* smallest size still overflows (one enormous unbroken word): use it
	 * rather than failing the build over a title nobody would write */
	const size = sizes[sizes.length - 1];
	return { lines: wrapAt(size), size, lineHeight: size * 1.16 };
}

export function renderPng(svg: string): Response {
	const resvg = new Resvg(svg, {
		font: { fontFiles: FONT_FILES, loadSystemFonts: false },
	});
	return new Response(new Uint8Array(resvg.render().asPng()), {
		headers: { "Content-Type": "image/png" },
	});
}
