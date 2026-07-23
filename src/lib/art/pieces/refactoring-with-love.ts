/**
 * refactoring-with-love: muted tetris-ish blocks being rearranged, with
 * pixel hearts in terracotta living among them. The composition drifts
 * from jumbled (left) to neatly packed (right) — same pieces, better
 * arrangement — and a few blocks sit mid-move with a dashed ghost at
 * their old position. Hearts avoid the quiet zone entirely; blocks fade
 * through it like other art.
 */

import type { ArtPiece, QuietCtx } from "../core";
import { quietRectPx, quietSpan } from "../core";
import { CellGrid, pickShape } from "../primitives/blocks";
import {
	HEART,
	spriteBlocks,
	spriteCols,
	spriteRows,
} from "../primitives/sprite";

interface Block {
	c: number;
	row: number;
	bw: number;
	bh: number;
	/** 0 left edge .. 1 right edge, drives the mess-to-order gradient */
	orderT: number;
}

export const refactoringWithLove: ArtPiece = {
	name: "refactoring-with-love",
	params: [
		{ key: "cell", label: "cell size", min: 24, max: 72, step: 2, default: 44 },
		{
			key: "density",
			label: "density",
			min: 0.1,
			max: 0.85,
			step: 0.05,
			default: 0.5,
		},
		{
			key: "jitter",
			label: "jitter",
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.55,
		},
		{ key: "tidy", label: "tidy", min: 0, max: 1, step: 0.05, default: 0.65 },
		{ key: "hearts", label: "hearts", min: 0, max: 5, step: 1, default: 2 },
		{ key: "ghosts", label: "ghosts", min: 0, max: 4, step: 1, default: 2 },
	],

	render(r, w, h, q: QuietCtx, p) {
		const cell = p.cell;
		const cols = Math.ceil(w / cell);
		const rows = Math.ceil(h / cell);
		const grid = new CellGrid(cols, rows);
		const quiet = quietRectPx(q);
		const gap = cell * 0.16;
		const rx = cell * 0.14;

		/* hearts claim their cells first so blocks pack around them. Each
		 * heart is "solved": its bitmap is tiled with the same mix of
		 * block shapes as the surrounding grid, in graded terracotta, so
		 * it reads as assembled from the material around it */
		const heartParts: string[] = [];
		const heartW = spriteCols(HEART) * cell;
		const heartH = spriteRows(HEART) * cell;
		const heartCellW = spriteCols(HEART);
		const heartCellH = spriteRows(HEART);
		const heartRows = spriteRows(HEART);
		let placed = 0;
		for (let attempt = 0; attempt < 220 && placed < p.hearts; attempt++) {
			const c = Math.floor(r() * (cols - heartCellW + 1));
			const row = Math.floor(r() * (rows - heartCellH + 1));
			const x = c * cell;
			const y = row * cell;
			/* a heart behind the title is clutter; skip the zone outright */
			if (
				quiet &&
				x + heartW >= quiet.x0 &&
				x <= quiet.x1 &&
				y + heartH >= quiet.y0 &&
				y <= quiet.y1
			)
				continue;
			if (!grid.free(c, row, heartCellW, heartCellH)) continue;
			grid.occupy(c, row, heartCellW, heartCellH);
			/* one focal heart, the rest quieter */
			const base = placed === 0 ? 0.75 : 0.35 + r() * 0.25;
			for (const t of spriteBlocks(HEART, r)) {
				/* gradation: random tonal steps per tile plus a mild
				 * lightening toward the point */
				const shade = (0.6 + r() * 0.4) * (1 - 0.2 * (t.row / (heartRows - 1)));
				heartParts.push(
					`<rect x="${(x + t.col * cell + gap / 2).toFixed(1)}" y="${(y + t.row * cell + gap / 2).toFixed(1)}" width="${(t.w * cell - gap).toFixed(1)}" height="${(t.h * cell - gap).toFixed(1)}" rx="${rx.toFixed(1)}" fill="var(--code-color)" opacity="${(base * shade).toFixed(2)}"/>`,
				);
			}
			placed++;
		}

		/* blocks: greedy random placement up to the density target */
		const blocks: Block[] = [];
		const targetCells = Math.floor(cols * rows * p.density);
		let usedCells = 0;
		const maxAttempts = cols * rows * 6;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (usedCells >= targetCells) break;
			const [bw, bh] = pickShape(r);
			const c = Math.floor(r() * (cols - bw + 1));
			const row = Math.floor(r() * (rows - bh + 1));
			if (!grid.free(c, row, bw, bh)) continue;
			grid.occupy(c, row, bw, bh);
			blocks.push({ c, row, bw, bh, orderT: (c + bw / 2) / cols });
			usedCells += bw * bh;
		}

		const ghostParts: string[] = [];
		const blockParts: string[] = [];
		/* messy-side blocks eligible to be "mid-move"; spread the picks */
		const movable = blocks.filter((b) => b.orderT < 0.6);
		const ghostEvery =
			p.ghosts > 0 && movable.length > 0
				? Math.max(1, Math.floor(movable.length / p.ghosts))
				: 0;
		let ghostsDrawn = 0;

		for (const b of blocks) {
			const bx = b.c * cell + gap / 2;
			const by = b.row * cell + gap / 2;
			const bwPx = b.bw * cell - gap;
			const bhPx = b.bh * cell - gap;
			/* how unsettled this block is: jitter scaled down as the
			 * composition tidies toward the right */
			const mess = p.jitter * (1 - p.tidy * b.orderT);
			const dx = (r() - 0.5) * cell * 0.9 * mess;
			const dy = (r() - 0.5) * cell * 0.9 * mess;
			const rot = (r() - 0.5) * 16 * mess;
			const x = bx + dx;
			const y = by + dy;
			const cx = x + bwPx / 2;
			const cy = y + bhPx / 2;

			const dark = r() < 0.25;
			const color = dark ? "var(--date-color)" : "var(--border-color)";
			const op = dark ? 0.2 + r() * 0.25 : 0.5 + r() * 0.4;
			const f = quietSpan(q, x, x + bwPx, cy);
			const transform =
				Math.abs(rot) > 0.3
					? ` transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"`
					: "";
			blockParts.push(
				`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bwPx.toFixed(1)}" height="${bhPx.toFixed(1)}" rx="${rx.toFixed(1)}" fill="${color}" opacity="${(op * f).toFixed(2)}"${transform}/>`,
			);

			/* ghost: the dashed outline of where a mid-move block came from */
			const isGhost =
				ghostEvery > 0 &&
				ghostsDrawn < p.ghosts &&
				b.orderT < 0.6 &&
				movable.indexOf(b) % ghostEvery === 0;
			if (isGhost) {
				ghostsDrawn++;
				const gdx = (1 + Math.round(r())) * cell * (r() < 0.5 ? -1 : 1);
				const gdy = (1 + Math.round(r())) * cell * (r() < 0.5 ? -1 : 1);
				const gx = Math.max(gap, Math.min(w - bwPx - gap, x + gdx));
				const gy = Math.max(gap, Math.min(h - bhPx - gap, y + gdy));
				const gf = quietSpan(q, gx, gx + bwPx, gy + bhPx / 2);
				ghostParts.push(
					`<rect x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" width="${bwPx.toFixed(1)}" height="${bhPx.toFixed(1)}" rx="${rx.toFixed(1)}" fill="none" stroke="var(--date-color)" stroke-width="1.3" stroke-dasharray="${(cell * 0.16).toFixed(1)} ${(cell * 0.13).toFixed(1)}" opacity="${(0.35 * gf).toFixed(2)}"/>`,
				);
			}
		}

		/* ghosts under blocks, hearts on top */
		return [...ghostParts, ...blockParts, ...heartParts].join("");
	},
};
