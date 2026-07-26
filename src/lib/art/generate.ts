/**
 * Seeded generative art for banners, thumbnails, and the home backdrop.
 *
 * Two tiers: bespoke per-post pieces (src/lib/art/pieces, pinned via
 * frontmatter `art.piece`) and the four generic families below, which
 * remain the fallback for anything without a commissioned piece. The
 * layout system treats art as swappable (frontmatter image overrides
 * generation), so families can be retired as pieces replace them.
 *
 * Colors are CSS variables so inline SVG themes with the site palette.
 */

import type { QuietCtx, QuietZone } from "./core";
import { hashSeed, quietPoint, quietSpan, resolveParams, rng } from "./core";
import { getPiece } from "./pieces";

export type { QuietZone } from "./core";
export { DEFAULT_QUIET, hashSeed, rng } from "./core";

export type ArtFamily = "strata" | "field" | "walk" | "depth";

export const FAMILIES: ArtFamily[] = ["strata", "field", "walk", "depth"];

export interface ArtOptions {
	seedKey: string;
	family?: ArtFamily;
	/** bespoke per-post piece from src/lib/art/pieces; wins over family */
	piece?: string;
	/** dial overrides for the piece (defaults come from its spec) */
	params?: Record<string, number>;
	/** viewBox size; rendered size is CSS's business */
	width?: number;
	height?: number;
	/** region the art thins out to leave room for overlaid text */
	quiet?: QuietZone;
	/** opacity multiplier inside the quiet zone, 0..1 (default 0.16) */
	quietStrength?: number;
	/** window into the composition (fractions of width/height); the
	 * emitted viewBox covers only this region. Used by the homepage
	 * thumbnail so it can show a chosen crop of the same artwork the
	 * post's backdrop renders */
	crop?: { x: number; y: number; w: number; h: number };
	/** emit seeded SMIL motion (pieces only); geometry is unchanged */
	animate?: boolean;
}

export function artSvg(opts: ArtOptions): string {
	const w = opts.width ?? 800;
	const h = opts.height ?? 450;
	const seed = hashSeed(opts.seedKey);
	const r = rng(seed);
	const q: QuietCtx = {
		rect: opts.quiet,
		strength: opts.quietStrength ?? 0.16,
		w,
		h,
	};
	let body: string;
	if (opts.piece) {
		const piece = getPiece(opts.piece);
		/* a frontmatter typo should fail the build, not ship fallback art */
		if (!piece) throw new Error(`unknown art piece "${opts.piece}"`);
		body = piece.render(r, w, h, q, resolveParams(piece.params, opts.params), {
			animate: opts.animate,
			/* decorrelated from the layout stream but still seed-stable */
			animRng: rng(seed ^ 0x5bf03635),
		});
	} else {
		const family = opts.family ?? FAMILIES[seed % FAMILIES.length];
		body =
			family === "strata"
				? strata(r, w, h, q)
				: family === "field"
					? field(r, w, h, q)
					: family === "depth"
						? depth(r, w, h, q)
						: walk(r, w, h, q);
	}
	const c = opts.crop;
	const viewBox = c
		? `${(c.x * w).toFixed(1)} ${(c.y * h).toFixed(1)} ${(c.w * w).toFixed(1)} ${(c.h * h).toFixed(1)}`
		: `0 0 ${w} ${h}`;
	return [
		`<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"`,
		` preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">`,
		body,
		"</svg>",
	].join("");
}

/* mirrored horizontal bands around a midline */
function strata(r: () => number, w: number, h: number, q: QuietCtx): string {
	const rows = 9 + Math.floor(r() * 5);
	const gap = h / (rows * 2 + 1);
	const parts: string[] = [];
	for (let i = 0; i < rows; i++) {
		const len = (0.2 + r() * 0.75) * w;
		const op = 0.12 + r() * 0.5;
		const yTop = h / 2 - (i + 1) * gap;
		const yBot = h / 2 + i * gap + gap * 0.15;
		const lenBot = (0.2 + r() * 0.75) * w;
		const opBot = 0.12 + r() * 0.4;
		parts.push(
			`<rect x="${w - len}" y="${yTop.toFixed(1)}" width="${len.toFixed(1)}" height="${(gap * 0.7).toFixed(1)}" fill="var(--code-color)" opacity="${(op * quietSpan(q, w - len, w, yTop + gap * 0.35)).toFixed(2)}"/>`,
			`<rect x="0" y="${yBot.toFixed(1)}" width="${lenBot.toFixed(1)}" height="${(gap * 0.7).toFixed(1)}" fill="var(--date-color)" opacity="${(opBot * quietSpan(q, 0, lenBot, yBot + gap * 0.35)).toFixed(2)}"/>`,
		);
	}
	parts.push(
		`<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="var(--code-color)" stroke-width="1.5" opacity="${(0.6 * quietSpan(q, 0, w, h / 2)).toFixed(2)}"/>`,
	);
	return parts.join("");
}

/* scattered rings and dots */
function field(r: () => number, w: number, h: number, q: QuietCtx): string {
	const n = 26 + Math.floor(r() * 14);
	const parts: string[] = [];
	for (let i = 0; i < n; i++) {
		const cx = r() * w;
		const cy = r() * h;
		const rad = 3 + r() * 34;
		const color = r() < 0.3 ? "var(--code-color)" : "var(--date-color)";
		/* rings are extended objects; test their horizontal extent */
		const f = quietSpan(q, cx - rad, cx + rad, cy);
		if (r() < 0.55) {
			parts.push(
				`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(0.7 + r() * 1.6).toFixed(1)}" opacity="${((0.1 + r() * 0.35) * f).toFixed(2)}"/>`,
			);
		} else {
			parts.push(
				`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(1 + r() * 3.5).toFixed(1)}" fill="${color}" opacity="${((0.2 + r() * 0.5) * quietPoint(q, cx, cy)).toFixed(2)}"/>`,
			);
		}
	}
	return parts.join("");
}

/* vertical bars rising from the bottom edge, two-sided around a mid,
 * like an order-book depth chart. The quiet zone caps bar heights
 * instead of fading them: the art composes around the title. */
function depth(r: () => number, w: number, h: number, q: QuietCtx): string {
	const n = 36 + Math.floor(r() * 22);
	const bw = w / n;
	const mid = (0.35 + r() * 0.3) * w;
	const zoneBottom =
		q.rect && q.strength < 0.99 ? (q.rect.y + q.rect.h) * h : 0;
	const zx0 = q.rect ? q.rect.x * w : 0;
	const zx1 = q.rect ? (q.rect.x + q.rect.w) * w : 0;
	const parts: string[] = [];
	for (let i = 0; i < n; i++) {
		const x = i * bw;
		const cx = x + bw / 2;
		const dist = Math.abs(cx - mid) / w;
		const frac = Math.max(
			0.04,
			Math.min(0.92, 0.1 + dist * (1.1 + r() * 0.6) + (r() - 0.5) * 0.24),
		);
		let len = frac * h;
		if (zoneBottom && x + bw * 0.72 >= zx0 && x <= zx1) {
			len = Math.min(len, Math.max(0, h - zoneBottom - 6));
		}
		/* order-book semantics: bids (green) left, asks (terracotta) right */
		const color = cx < mid ? "var(--accent-green)" : "var(--code-color)";
		const op = 0.16 + r() * 0.42;
		parts.push(
			`<rect x="${x.toFixed(1)}" y="${(h - len).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${len.toFixed(1)}" fill="${color}" opacity="${op.toFixed(2)}"/>`,
		);
	}
	return parts.join("");
}

/* stepped walks across the frame; drawn as per-step segments so each
 * piece can attenuate independently through the quiet zone */
function walk(r: () => number, w: number, h: number, q: QuietCtx): string {
	const lines = 3 + Math.floor(r() * 3);
	const parts: string[] = [];
	for (let l = 0; l < lines; l++) {
		let y = h * (0.2 + r() * 0.6);
		const steps = 10 + Math.floor(r() * 14);
		const dx = w / steps;
		const color = l === 0 ? "var(--code-color)" : "var(--date-color)";
		const width = l === 0 ? 2 : 1.2;
		const baseOp = l === 0 ? 0.75 : 0.35;
		const seg = (x1: number, y1: number, x2: number, y2: number): string => {
			const f = quietSpan(q, Math.min(x1, x2), Math.max(x1, x2), (y1 + y2) / 2);
			return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${(baseOp * f).toFixed(2)}"/>`;
		};
		for (let i = 1; i <= steps; i++) {
			const yPrev = y;
			y += (r() - 0.5) * h * 0.22;
			y = Math.max(h * 0.05, Math.min(h * 0.95, y));
			parts.push(seg((i - 1) * dx, yPrev, i * dx, yPrev));
			parts.push(seg(i * dx, yPrev, i * dx, y));
		}
	}
	return parts.join("");
}
