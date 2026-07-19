/**
 * Seeded generative art for banners, thumbnails, and the home backdrop.
 * Placeholder-quality families for now; the layout system treats art as
 * swappable (frontmatter image overrides generation), so families can be
 * refined or replaced by pregenerated images later without rework.
 *
 * Colors are CSS variables so inline SVG themes with the site palette.
 */

export type ArtFamily = "strata" | "field" | "walk" | "depth";

export const FAMILIES: ArtFamily[] = ["strata", "field", "walk", "depth"];

/** deterministic 32-bit hash of a string (FNV-1a) */
export function hashSeed(key: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** mulberry32 seeded PRNG, returns [0, 1) */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface QuietZone {
	/** all values are fractions of the viewBox */
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface ArtOptions {
	seedKey: string;
	family?: ArtFamily;
	/** viewBox size; rendered size is CSS's business */
	width?: number;
	height?: number;
	/** region the art thins out to leave room for overlaid text */
	quiet?: QuietZone;
	/** opacity multiplier inside the quiet zone, 0..1 (default 0.16) */
	quietStrength?: number;
}

/** default title/date region posts thin their art behind */
export const DEFAULT_QUIET: QuietZone = { x: 0.28, y: 0.02, w: 0.58, h: 0.36 };

interface QuietCtx {
	rect?: QuietZone;
	strength: number;
	w: number;
	h: number;
}

/** attenuation for a point */
function quietPoint(q: QuietCtx, cx: number, cy: number): number {
	if (!q.rect) return 1;
	const inX = cx >= q.rect.x * q.w && cx <= (q.rect.x + q.rect.w) * q.w;
	const inY = cy >= q.rect.y * q.h && cy <= (q.rect.y + q.rect.h) * q.h;
	return inX && inY ? q.strength : 1;
}

/** attenuation for a horizontal span [x0, x1] at height y: any overlap
 * with the zone counts (a bar passing through must attenuate even if
 * its center is elsewhere) */
function quietSpan(q: QuietCtx, x0: number, x1: number, y: number): number {
	if (!q.rect) return 1;
	const inY = y >= q.rect.y * q.h && y <= (q.rect.y + q.rect.h) * q.h;
	const overlapX = x1 >= q.rect.x * q.w && x0 <= (q.rect.x + q.rect.w) * q.w;
	return inY && overlapX ? q.strength : 1;
}

export function artSvg(opts: ArtOptions): string {
	const w = opts.width ?? 800;
	const h = opts.height ?? 450;
	const seed = hashSeed(opts.seedKey);
	const family = opts.family ?? FAMILIES[seed % FAMILIES.length];
	const r = rng(seed);
	const q: QuietCtx = {
		rect: opts.quiet,
		strength: opts.quietStrength ?? 0.16,
		w,
		h,
	};
	const body =
		family === "strata"
			? strata(r, w, h, q)
			: family === "field"
				? field(r, w, h, q)
				: family === "depth"
					? depth(r, w, h, q)
					: walk(r, w, h, q);
	return [
		`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"`,
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
		const color = cx < mid ? "var(--code-color)" : "var(--date-color)";
		const op = 0.16 + r() * 0.42;
		parts.push(
			`<rect x="${x.toFixed(1)}" y="${(h - len).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${len.toFixed(1)}" fill="${color}" opacity="${op.toFixed(2)}"/>`,
		);
	}
	parts.push(
		`<line x1="${mid.toFixed(1)}" y1="${(h * 0.12).toFixed(1)}" x2="${mid.toFixed(1)}" y2="${h}" stroke="var(--code-color)" stroke-width="1.2" opacity="${(0.45 * quietSpan(q, mid - 1, mid + 1, h * 0.3)).toFixed(2)}"/>`,
	);
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
