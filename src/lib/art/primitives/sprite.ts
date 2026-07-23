/**
 * Pixel-sprite primitive: bitmaps drawn as grids of small rounded
 * squares, mosaic-style, so sprites read as built from the same blocky
 * material as the grid pieces around them.
 */

/** rows of "." (empty) and "X" (filled); all rows the same length */
export type Sprite = string[];

/** classic 8-bit heart, 7x6 */
export const HEART: Sprite = [
	".XX.XX.",
	"XXXXXXX",
	"XXXXXXX",
	".XXXXX.",
	"..XXX..",
	"...X...",
];

export function spriteCols(sprite: Sprite): number {
	return sprite[0]?.length ?? 0;
}

export function spriteRows(sprite: Sprite): number {
	return sprite.length;
}

/** one tile of a solved sprite, in sprite-cell coordinates */
export interface SpriteBlock {
	col: number;
	row: number;
	w: number;
	h: number;
}

/* tiling shapes, weighted so mixed sizes dominate over lone pixels */
const TILE_SHAPES: [w: number, h: number, weight: number][] = [
	[2, 2, 1.2],
	[2, 1, 2],
	[1, 2, 2],
	[3, 1, 0.7],
	[1, 1, 1.5],
];

const TILE_WEIGHT = TILE_SHAPES.reduce((sum, [, , w]) => sum + w, 0);

function pickTile(r: () => number): [w: number, h: number] {
	let roll = r() * TILE_WEIGHT;
	for (const [w, h, weight] of TILE_SHAPES) {
		roll -= weight;
		if (roll <= 0) return [w, h];
	}
	return [1, 1];
}

/**
 * "Solve" a sprite: tile its filled cells exactly with a random mix of
 * block shapes, so the sprite is visibly assembled from the same
 * material as a surrounding block grid. Deterministic in r; scanning is
 * top-left to bottom-right, the randomness is in shape choice.
 */
export function spriteBlocks(sprite: Sprite, r: () => number): SpriteBlock[] {
	const rows = sprite.length;
	const cols = spriteCols(sprite);
	const filled = (c: number, row: number): boolean =>
		row >= 0 && row < rows && c >= 0 && c < cols && sprite[row][c] === "X";
	const taken = new Uint8Array(cols * rows);
	const out: SpriteBlock[] = [];
	for (let row = 0; row < rows; row++) {
		for (let c = 0; c < cols; c++) {
			if (!filled(c, row) || taken[row * cols + c]) continue;
			/* try a few random shapes; a lone pixel always fits */
			let w = 1;
			let h = 1;
			for (let attempt = 0; attempt < 4; attempt++) {
				const [tw, th] = pickTile(r);
				let fits = true;
				for (let y = row; y < row + th && fits; y++) {
					for (let x = c; x < c + tw && fits; x++) {
						if (!filled(x, y) || taken[y * cols + x]) fits = false;
					}
				}
				if (fits) {
					w = tw;
					h = th;
					break;
				}
			}
			for (let y = row; y < row + h; y++) {
				for (let x = c; x < c + w; x++) {
					taken[y * cols + x] = 1;
				}
			}
			out.push({ col: c, row, w, h });
		}
	}
	return out;
}
