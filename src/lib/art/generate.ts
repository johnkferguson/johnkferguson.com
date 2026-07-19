/**
 * Seeded generative art for banners, thumbnails, and the home backdrop.
 * Placeholder-quality families for now; the layout system treats art as
 * swappable (frontmatter image overrides generation), so families can be
 * refined or replaced by pregenerated images later without rework.
 *
 * Colors are CSS variables so inline SVG themes with the site palette.
 */

export type ArtFamily = "strata" | "field" | "walk";

export const FAMILIES: ArtFamily[] = ["strata", "field", "walk"];

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

export interface ArtOptions {
	seedKey: string;
	family?: ArtFamily;
	/** viewBox size; rendered size is CSS's business */
	width?: number;
	height?: number;
}

export function artSvg(opts: ArtOptions): string {
	const w = opts.width ?? 800;
	const h = opts.height ?? 450;
	const seed = hashSeed(opts.seedKey);
	const family = opts.family ?? FAMILIES[seed % FAMILIES.length];
	const r = rng(seed);
	const body =
		family === "strata"
			? strata(r, w, h)
			: family === "field"
				? field(r, w, h)
				: walk(r, w, h);
	return [
		`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"`,
		` preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">`,
		body,
		"</svg>",
	].join("");
}

/* mirrored horizontal bands around a midline */
function strata(r: () => number, w: number, h: number): string {
	const rows = 9 + Math.floor(r() * 5);
	const gap = h / (rows * 2 + 1);
	const parts: string[] = [];
	for (let i = 0; i < rows; i++) {
		const len = (0.2 + r() * 0.75) * w;
		const op = 0.12 + r() * 0.5;
		const yTop = h / 2 - (i + 1) * gap;
		const yBot = h / 2 + i * gap + gap * 0.15;
		parts.push(
			`<rect x="${w - len}" y="${yTop.toFixed(1)}" width="${len.toFixed(1)}" height="${(gap * 0.7).toFixed(1)}" fill="var(--code-color)" opacity="${op.toFixed(2)}"/>`,
			`<rect x="0" y="${yBot.toFixed(1)}" width="${((0.2 + r() * 0.75) * w).toFixed(1)}" height="${(gap * 0.7).toFixed(1)}" fill="var(--date-color)" opacity="${(0.12 + r() * 0.4).toFixed(2)}"/>`,
		);
	}
	parts.push(
		`<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="var(--code-color)" stroke-width="1.5" opacity="0.6"/>`,
	);
	return parts.join("");
}

/* scattered rings and dots */
function field(r: () => number, w: number, h: number): string {
	const n = 26 + Math.floor(r() * 14);
	const parts: string[] = [];
	for (let i = 0; i < n; i++) {
		const cx = (r() * w).toFixed(1);
		const cy = (r() * h).toFixed(1);
		const rad = (3 + r() * 34).toFixed(1);
		const color = r() < 0.3 ? "var(--code-color)" : "var(--date-color)";
		if (r() < 0.55) {
			parts.push(
				`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${color}" stroke-width="${(0.7 + r() * 1.6).toFixed(1)}" opacity="${(0.1 + r() * 0.35).toFixed(2)}"/>`,
			);
		} else {
			parts.push(
				`<circle cx="${cx}" cy="${cy}" r="${(1 + r() * 3.5).toFixed(1)}" fill="${color}" opacity="${(0.2 + r() * 0.5).toFixed(2)}"/>`,
			);
		}
	}
	return parts.join("");
}

/* stepped walks across the frame */
function walk(r: () => number, w: number, h: number): string {
	const lines = 3 + Math.floor(r() * 3);
	const parts: string[] = [];
	for (let l = 0; l < lines; l++) {
		let y = h * (0.2 + r() * 0.6);
		const steps = 10 + Math.floor(r() * 14);
		const dx = w / steps;
		const pts: string[] = [`0,${y.toFixed(1)}`];
		for (let i = 1; i <= steps; i++) {
			y += (r() - 0.5) * h * 0.22;
			y = Math.max(h * 0.05, Math.min(h * 0.95, y));
			pts.push(`${(i * dx).toFixed(1)},${pts[pts.length - 1].split(",")[1]}`);
			pts.push(`${(i * dx).toFixed(1)},${y.toFixed(1)}`);
		}
		const color = l === 0 ? "var(--code-color)" : "var(--date-color)";
		parts.push(
			`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="${l === 0 ? 2 : 1.2}" opacity="${l === 0 ? 0.75 : 0.35}"/>`,
		);
	}
	return parts.join("");
}
