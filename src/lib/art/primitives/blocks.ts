/**
 * Cell-grid layout primitive: pieces place rectangular blocks (and
 * sprites, which reserve cells the same way) into an occupancy grid so
 * nothing overlaps. First built for refactoring-with-love; shared here
 * so future grid-based pieces reuse it.
 */

export class CellGrid {
	readonly cols: number;
	readonly rows: number;
	private used: Uint8Array;

	constructor(cols: number, rows: number) {
		this.cols = cols;
		this.rows = rows;
		this.used = new Uint8Array(cols * rows);
	}

	/** true when the w x h block at (c, r) is fully inside and unoccupied */
	free(c: number, r: number, w: number, h: number): boolean {
		if (c < 0 || r < 0 || c + w > this.cols || r + h > this.rows) return false;
		for (let y = r; y < r + h; y++) {
			for (let x = c; x < c + w; x++) {
				if (this.used[y * this.cols + x]) return false;
			}
		}
		return true;
	}

	occupy(c: number, r: number, w: number, h: number): void {
		for (let y = r; y < r + h; y++) {
			for (let x = c; x < c + w; x++) {
				this.used[y * this.cols + x] = 1;
			}
		}
	}
}

/** tetromino-ish block footprints in cells, weighted toward small */
const SHAPES: [w: number, h: number, weight: number][] = [
	[1, 1, 3],
	[2, 1, 3],
	[1, 2, 2],
	[2, 2, 1.4],
	[3, 1, 1],
	[1, 3, 0.6],
];

const TOTAL_WEIGHT = SHAPES.reduce((sum, [, , w]) => sum + w, 0);

/** weighted random block footprint */
export function pickShape(r: () => number): [w: number, h: number] {
	let roll = r() * TOTAL_WEIGHT;
	for (const [w, h, weight] of SHAPES) {
		roll -= weight;
		if (roll <= 0) return [w, h];
	}
	return [1, 1];
}
