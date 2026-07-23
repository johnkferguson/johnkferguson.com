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

/** render at (x, y) with square pixels of size px; the small inset
 * between pixels gives the mosaic seam */
export function spriteSvg(
	sprite: Sprite,
	x: number,
	y: number,
	px: number,
	fill: string,
	opacity: number,
): string {
	const inset = px * 0.09;
	const size = px - inset * 2;
	const rx = px * 0.16;
	const parts: string[] = [];
	for (let row = 0; row < sprite.length; row++) {
		const line = sprite[row];
		for (let col = 0; col < line.length; col++) {
			if (line[col] !== "X") continue;
			parts.push(
				`<rect x="${(x + col * px + inset).toFixed(1)}" y="${(y + row * px + inset).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="${rx.toFixed(1)}" fill="${fill}" opacity="${opacity.toFixed(2)}"/>`,
			);
		}
	}
	return parts.join("");
}
