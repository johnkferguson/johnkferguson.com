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

/**
 * What the quiet zone does to art that would otherwise fill it.
 *
 * "clip" holds art under the zone's floor and lets it collect there.
 * "scale" fits the whole composition into the room available instead.
 * Which one looks right depends on how much of the frame the zone takes:
 * a small zone can clip invisibly, while a zone covering most of the
 * canvas turns clipping into a flat mass and needs scaling to keep the
 * art legible.
 */
export type QuietFit = "clip" | "scale";

/** per-render context beyond the dials */
export interface PieceCtx {
	/** how to fit art under the quiet zone; defaults to "clip" */
	fit?: QuietFit;
	/** the hashed seed, for pieces that need a stream of their own on
	 * top of the layout one (see animRng for the same idea) */
	seed?: number;
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
	/** the share card's quiet zone, when this piece's composition needs
	 * different room than the card's default. Opt-in per piece: the
	 * default is shared by every card, so tuning it for one artwork
	 * silently redraws the rest. */
	ogQuiet?: { rect: QuietZone; strength?: number };
	render(
		r: () => number,
		w: number,
		h: number,
		q: QuietCtx,
		p: Record<string, number>,
		ctx?: PieceCtx,
	): string;
}

/**
 * Spec defaults overlaid with any overrides.
 *
 * Rejects rather than clamps, and rejects unknown keys outright. Params
 * are hand-edited in frontmatter, where every way of getting them wrong
 * used to be silent: a typo like barz rendered a perfectly ordinary card
 * that simply was not the one configured, and books: 0 shipped
 * keyTimes="0; Infinity; 1" into the markup. Neither is visible without
 * opening the SVG. Same reasoning as the unknown-piece throw above and
 * the unmapped-variable throw in the OG renderer: a frontmatter mistake
 * should fail the build, not ship art nobody asked for.
 *
 * Step alignment is deliberately not enforced; a value between steps is
 * harmless and rejecting it would only fight hand-tuning.
 */
export function resolveParams(
	spec: ParamSpec[],
	overrides?: Record<string, number>,
): Record<string, number> {
	for (const [key, value] of Object.entries(overrides ?? {})) {
		const s = spec.find((x) => x.key === key);
		if (!s) {
			throw new Error(
				`unknown art param "${key}"; this piece takes ${spec.map((x) => x.key).join(", ")}`,
			);
		}
		if (!Number.isFinite(value) || value < s.min || value > s.max) {
			throw new Error(
				`art param "${key}" is ${value}, outside its range ${s.min}..${s.max}`,
			);
		}
	}
	const p: Record<string, number> = {};
	for (const s of spec) {
		p[s.key] = overrides?.[s.key] ?? s.default;
	}
	return p;
}
