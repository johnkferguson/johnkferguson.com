/**
 * Shared machinery for generative art: seeded randomness, the quiet-zone
 * system that thins art behind overlaid text, and the piece interface
 * that per-post artworks implement. Kept free of imports so pieces,
 * primitives, and the dispatcher can all depend on it without cycles.
 */

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

/** default title/date region posts thin their art behind (deep enough
 * to cover the date line at the production 360px backdrop height, where
 * slice-scaling maps screen positions lower into the viewBox) */
export const DEFAULT_QUIET: QuietZone = { x: 0.28, y: 0.02, w: 0.58, h: 0.5 };

export interface QuietCtx {
	rect?: QuietZone;
	strength: number;
	w: number;
	h: number;
}

/** attenuation for a point */
export function quietPoint(q: QuietCtx, cx: number, cy: number): number {
	if (!q.rect) return 1;
	const inX = cx >= q.rect.x * q.w && cx <= (q.rect.x + q.rect.w) * q.w;
	const inY = cy >= q.rect.y * q.h && cy <= (q.rect.y + q.rect.h) * q.h;
	return inX && inY ? q.strength : 1;
}

/** attenuation for a horizontal span [x0, x1] at height y: any overlap
 * with the zone counts (a bar passing through must attenuate even if
 * its center is elsewhere) */
export function quietSpan(
	q: QuietCtx,
	x0: number,
	x1: number,
	y: number,
): number {
	if (!q.rect) return 1;
	const inY = y >= q.rect.y * q.h && y <= (q.rect.y + q.rect.h) * q.h;
	const overlapX = x1 >= q.rect.x * q.w && x0 <= (q.rect.x + q.rect.w) * q.w;
	return inY && overlapX ? q.strength : 1;
}

/** the quiet rect in viewBox pixels, or null when it is effectively off;
 * for pieces that place elements around the zone rather than fading them */
export function quietRectPx(
	q: QuietCtx,
): { x0: number; y0: number; x1: number; y1: number } | null {
	if (!q.rect || q.strength >= 0.99) return null;
	return {
		x0: q.rect.x * q.w,
		y0: q.rect.y * q.h,
		x1: (q.rect.x + q.rect.w) * q.w,
		y1: (q.rect.y + q.rect.h) * q.h,
	};
}

/** one dial on a piece; the dev picker renders these as range inputs and
 * the frontmatter `art.params` block overrides them by key */
export interface ParamSpec {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	default: number;
}

/** per-render context beyond the dials */
export interface PieceCtx {
	/** emit SMIL motion. animRng is a SEPARATE seeded stream so motion
	 * parameters never perturb the layout stream: an animated render is
	 * geometrically identical to the static one */
	animate?: boolean;
	animRng?: () => number;
}

/**
 * A bespoke per-post artwork. Pieces are deterministic programs: the
 * same seed and params always render the same SVG body, so posts pin
 * `art: { piece, seed, params }` in frontmatter instead of committing
 * asset files. Colors must be CSS variables mirrored in palette.ts so
 * the OG renderer can pin them.
 */
export interface ArtPiece {
	/** registry key; also the frontmatter `art.piece` value */
	name: string;
	params: ParamSpec[];
	render(
		r: () => number,
		w: number,
		h: number,
		q: QuietCtx,
		p: Record<string, number>,
		ctx?: PieceCtx,
	): string;
}

/** spec defaults overlaid with any overrides; unknown keys are ignored */
export function resolveParams(
	spec: ParamSpec[],
	overrides?: Record<string, number>,
): Record<string, number> {
	const p: Record<string, number> = {};
	for (const s of spec) {
		p[s.key] = overrides?.[s.key] ?? s.default;
	}
	return p;
}
