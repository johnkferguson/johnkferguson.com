/**
 * snapshot-fees: a two-sided order book, bids left of the mark and asks
 * right of it, drawn as depth rising from the bottom edge. The post's
 * subject is what a batch auction does to that book: it seals the whole
 * thing at one instant, prices every fill from the sealed snapshot, then
 * opens a fresh window.
 *
 * So the piece has two states. Still, it is one book with the mark dead
 * center: that is what the post backdrop and the OG card render, and what
 * a paused homepage thumbnail shows. Animated, it cycles through several
 * books, each held for a beat and separated by a brief clear as the
 * window seals. The mark walks between books, which is the market moving.
 *
 * Books after the first are emitted only when ctx.animate is set, and the
 * layout stream generates book one first, so the still render is a strict
 * subset of the animated one and the two agree pixel for pixel at rest.
 */

import type { ArtPiece, PieceCtx, QuietCtx } from "../core";
import { rng } from "../core";

/* the mark's walk is bounded to the middle of the frame: past this the
 * book stops reading as two-sided at thumbnail size */
const MID_RANGE = 0.2;

/* tallest a level can draw, as a fraction of the frame; also the input
 * range the quiet zone's ceiling scales down from */
const MAX_FRAC = 0.92;

interface Timing {
	bookMs: number;
	clearMs: number;
	leadMs: number;
	slotMs: number;
	cycleMs: number;
}

/**
 * Gate each book with a discrete-step opacity animation on one shared
 * timeline. Steps rather than cross-fades for two reasons: a fade is the
 * opposite of a seal, and pausing mid-fade (the homepage does pause, on
 * mouseleave) would leave two books stacked on screen.
 *
 * The timings ride along as data attributes because the homepage script
 * needs them to decide whether the pointer left during a book or during
 * a clear, and they belong to the piece, not to the script.
 */
function cycle(bodies: string[], t: Timing): string {
	const dur = (t.cycleMs / 1000).toFixed(3);
	const at = (ms: number) => (ms / t.cycleMs).toFixed(4);
	const groups = bodies
		.map((body, i) => {
			const off = at(i * t.slotMs + t.bookMs);
			/* book one is the still frame: visible at time zero, so a
			 * paused thumbnail matches the backdrop exactly */
			const anim =
				i === 0
					? `<animate attributeName="opacity" calcMode="discrete" keyTimes="0; ${off}; 1" values="1; 0; 0" dur="${dur}s" repeatCount="indefinite"/>`
					: `<animate attributeName="opacity" calcMode="discrete" keyTimes="0; ${at(i * t.slotMs)}; ${off}; 1" values="0; 1; 0; 0" dur="${dur}s" repeatCount="indefinite"/>`;
			return `<g${i === 0 ? "" : ' opacity="0"'}>${body}${anim}</g>`;
		})
		.join("");
	return `<g data-snapshot-cycle="${t.cycleMs}" data-snapshot-slot="${t.slotMs}" data-snapshot-book="${t.bookMs}" data-snapshot-lead="${t.leadMs}">${groups}</g>`;
}

export const snapshotFees: ArtPiece = {
	name: "snapshot-fees",
	/* The card default runs 4% to 96%, wider than any title line ever
	 * gets, which leaves a book no full-height room at all on a card
	 * whose right third carries nothing. Narrower here only: the default
	 * is shared, and other pieces compose around it.
	 *
	 * The right edge is chosen BY EYE, not derived. Titles lay out to
	 * 1110px on a 1200px card, so a long one runs past this zone and its
	 * tail sits over taller art; the current title already overhangs by
	 * 25px. That was rendered on a deliberately long title and accepted:
	 * the art is at half opacity and the levels near the edge are short,
	 * so it reads fine. If a future card ever does read badly, widening
	 * this one number is the fix.
	 *
	 * That number lives on the PIECE, so it moves every post using it.
	 * Safe because pieces are one per post here, which ogQuiet-per-post
	 * is not built for and pieces.test.ts enforces.
	 *
	 * No strength: this piece reads q.strength only as an on/off gate
	 * (see zoneBottom below), so any value under 0.99 renders the same
	 * picture. The endpoint's default applies. */
	ogQuiet: { rect: { x: 0.05, y: 0.22, w: 0.7, h: 0.52 } },
	params: [
		{ key: "bars", label: "bars", min: 20, max: 72, step: 2, default: 46 },
		{
			key: "depth",
			label: "depth curve",
			min: 0.4,
			max: 2.2,
			step: 0.1,
			default: 1.3,
		},
		{ key: "noise", label: "noise", min: 0, max: 2, step: 0.1, default: 1 },
		{ key: "books", label: "books", min: 3, max: 8, step: 1, default: 6 },
		/* rerolls the mark's path alone. The walk draws from its own
		 * stream so the levels, and with them the still frame the
		 * backdrop and card render, do not move when the market's route
		 * through the cycle is reconsidered */
		{
			key: "walk",
			label: "market path",
			min: 0,
			max: 400,
			step: 1,
			default: 0,
		},
		{
			key: "drift",
			label: "mark drift",
			min: 0,
			max: 0.2,
			step: 0.01,
			default: 0.1,
		},
		{
			key: "bookMs",
			label: "book ms",
			min: 400,
			max: 2500,
			step: 25,
			default: 850,
		},
		{
			key: "clearMs",
			label: "clear ms",
			min: 50,
			max: 800,
			step: 25,
			default: 200,
		},
		/* how much of the showing book is left when a hover starts: the
		 * card is a still book until it is pointed at, and waiting out a
		 * full hold before the first seal reads as nothing happening */
		{
			key: "leadMs",
			label: "lead-in ms",
			min: 0,
			max: 1200,
			step: 25,
			default: 500,
		},
	],

	render(r, w, h, q: QuietCtx, p, ctx?: PieceCtx) {
		const n = Math.round(p.bars);
		const bw = w / n;

		/* the quiet zone caps bar heights rather than fading them, so the
		 * art composes around the overlaid title instead of ghosting
		 * behind it (inherited from the depth family, which is what this
		 * piece replaces) */
		/* strength is read as a SWITCH, not a dial: this piece holds art
		 * under the zone rather than fading it through, so every value
		 * below the threshold renders identically and only crossing 0.99
		 * turns the zone off. Anyone reaching for it as an attenuation
		 * factor will find it does nothing. */
		const zoneBottom =
			q.rect && q.strength < 0.99 ? (q.rect.y + q.rect.h) * h : 0;
		const zx0 = q.rect ? q.rect.x * w : 0;
		const zx1 = q.rect ? (q.rect.x + q.rect.w) * w : 0;
		/* How much room the art has under the zone's floor. */
		const floorCap = Math.max(0, h - zoneBottom - 6);
		const tallest = MAX_FRAC * h;

		/**
		 * Two fits, because the two surfaces that carry a quiet zone are
		 * not alike (see QuietFit in core).
		 *
		 * The backdrop's zone is small and most of what it covers sits
		 * behind the prose column anyway, so clipping never shows: levels
		 * bank up under the title and the visible art in the gutters is
		 * untouched. The share card's zone covers most of the canvas, and
		 * there clipping flattens nearly the whole book onto one line, so
		 * it scales instead. Scaling ramps in from the zone's edges, since
		 * a step change in the factor would put a visible seam between a
		 * full-height level and its neighbour.
		 */
		const capped = (len: number, x0: number, x1: number): number => {
			if (!zoneBottom) return len;
			if (ctx?.fit !== "scale") {
				return x1 >= zx0 && x0 <= zx1 ? Math.min(len, floorCap) : len;
			}
			const inside = Math.min(x1 - zx0, zx1 - x0);
			if (inside <= 0) return len;
			const ramp = Math.min(1, inside / (w * 0.07));
			const ceil = h - (h - floorCap) * (ramp * ramp * (3 - 2 * ramp));
			return len * Math.min(1, ceil / tallest);
		};

		/* Per-level state, held across books so consecutive snapshots are
		 * the same market a moment later rather than an unrelated draw.
		 * Drawn before any book is emitted, and mutated only between
		 * books, so book one never depends on how many follow it. */
		const slope: number[] = [];
		const wobble: number[] = [];
		const alpha: number[] = [];
		for (let j = 0; j < n; j++) {
			slope.push((0.85 + r() * 0.45) * p.depth);
			wobble.push((r() - 0.5) * 0.24 * p.noise);
			alpha.push(0.16 + r() * 0.42);
		}
		/* What each level resettles toward. Two jobs: without it the
		 * per-book variation is a random walk that ratchets, and by the
		 * last book the levels sit at extremes the first never visits;
		 * and it gives the closing book something to converge ON, so the
		 * loop can come back around rather than snapping back. */
		const restSlope = [...slope];
		const restAlpha = [...alpha];

		/* one book, drawn from the current level state; consumes no
		 * randomness, so all the seeded variation lives in settle() */
		const book = (mid: number): string => {
			const parts: string[] = [];
			for (let j = 0; j < n; j++) {
				const x = j * bw;
				const bar = bw * 0.72;
				const cx = x + bw / 2;
				const dist = Math.abs(cx - mid) / w;
				/* depth grows away from the mark, which is the shape a
				 * resting book actually has */
				const frac = Math.max(
					0.04,
					Math.min(MAX_FRAC, 0.1 + dist * slope[j] + wobble[j]),
				);
				const len = capped(frac * h, x, x + bar);
				const color = cx < mid ? "var(--accent-green)" : "var(--code-color)";
				parts.push(
					`<rect x="${x.toFixed(1)}" y="${(h - len).toFixed(1)}" width="${bar.toFixed(1)}" height="${len.toFixed(1)}" fill="${color}" opacity="${alpha[j].toFixed(2)}"/>`,
				);
			}
			return parts.join("");
		};

		/* at rest the mark sits dead center */
		const first = book(w / 2);
		if (!ctx?.animate) return first;

		const books = Math.round(p.books);
		const bookMs = Math.round(p.bookMs);
		const clearMs = Math.round(p.clearMs);
		const slotMs = bookMs + clearMs;

		/* The mark's walk. Step magnitudes stay in a narrow band and the
		 * direction carries momentum, so the market trends and sometimes
		 * turns instead of teleporting: with only a handful of books, one
		 * outsized step reads as a cut to an unrelated market rather than
		 * as drift.
		 *
		 * The pull back toward center strengthens as the loop nears its
		 * end, so the walk trends out and mean-reverts. Detrending a free
		 * walk instead (subtracting its ramp) looks like the same idea but
		 * is not: it flattens a trending walk into noise and dumps the
		 * whole excursion into the wrap.
		 *
		 * Drawn from its own stream, keyed by the `walk` dial. The route
		 * the market takes and the shape of its book are separate
		 * judgements, and rerolling one used to mean losing the other:
		 * both came off the layout stream, so a different path also meant
		 * a different still frame on the backdrop and the card. */
		const wr = rng(
			((ctx.seed ?? 0) ^ 0x27d4eb2d ^ (Math.round(p.walk) * 0x9e3779b9)) >>> 0,
		);
		const mids: number[] = [w / 2];
		const bound = MID_RANGE * w;
		/* every book must move the mark at least this far: two snapshots
		 * that land on the same price read as a dropped frame */
		const least = 0.45 * p.drift * w;
		const closing = books - 1;
		let off = 0;
		let dir = wr() < 0.5 ? -1 : 1;
		/* books since the mark last turned. A direction that can flip on
		 * any book lets the walk alternate every window, which reads as
		 * jitter around the centre rather than a market going somewhere,
		 * and it never travels far enough to be worth watching. Holding a
		 * direction for at least two books makes a run the default and a
		 * turn an event. */
		let run = 0;
		for (let k = 1; k < books; k++) {
			run++;
			if (run >= 2 && wr() < 0.45) {
				dir = -dir;
				run = 0;
			}
			const kick = dir * (0.7 + wr() * 0.3) * p.drift * w;
			/* reversion arrives late rather than building evenly, so the
			 * middle of the loop is free to trend; the bridge book below
			 * is what actually closes the circuit */
			const ramp = k / closing;
			const pull = -off * 0.55 * ramp * ramp;
			let delta = kick + pull;
			/* a kick and the pull can cancel; keep the visible move */
			if (Math.abs(delta) < least) delta = Math.sign(delta || dir) * least;
			/* at the bound the market turns rather than grinding along it */
			if (Math.abs(off + delta) > bound) {
				dir = -dir;
				run = 0;
				delta = -Math.sign(delta) * Math.max(least, Math.abs(delta) * 0.6);
			}
			off = Math.max(-bound, Math.min(bound, off + delta));
			/* The last book is a bridge back to the first. Reverting alone
			 * does not close the loop: wherever the walk has wandered, the
			 * wrap has to cover all of it at once, which is the one
			 * transition that reads as a cut rather than a window passing.
			 * Parking the closing book about one step out makes the wrap a
			 * step like any other. */
			if (k === closing) {
				const prev = mids[k - 1] - w / 2;
				/* stay on the side it was reverting from, so the bridge
				 * reads as the walk continuing home */
				off = Math.sign(prev || dir) * least * (0.8 + wr() * 0.4);
				/* unless that lands on top of the book before it: parking
				 * skips the minimum-step guard above, and the bridge still
				 * has to be a book of its own */
				if (Math.abs(off - prev) < least) off = -off;
			}
			mids.push(w / 2 + off);
		}

		/* The market a window later: the mark has moved and every level
		 * has resettled a little, but it is recognizably the same book.
		 * `home` is how hard the levels are pulled back toward their
		 * resting state; the closing book pulls hard and adds almost no
		 * fresh noise, so its shape lands near the first book's too. */
		const settle = (home: number) => {
			const fresh = 1 - home;
			for (let j = 0; j < n; j++) {
				slope[j] +=
					(restSlope[j] - slope[j]) * home +
					(r() - 0.5) * 0.3 * restSlope[j] * fresh;
				wobble[j] =
					wobble[j] * (1 - home) + (r() - 0.5) * 0.16 * p.noise * fresh;
				alpha[j] = Math.max(
					0.1,
					Math.min(
						0.62,
						alpha[j] +
							(restAlpha[j] - alpha[j]) * home +
							(r() - 0.5) * 0.14 * fresh,
					),
				);
			}
		};

		const bodies = [first];
		for (let k = 1; k < books; k++) {
			settle(k === closing ? 0.62 : 0.3);
			bodies.push(book(mids[k]));
		}

		return cycle(bodies, {
			bookMs,
			clearMs,
			leadMs: Math.min(Math.round(p.leadMs), bookMs),
			slotMs,
			cycleMs: slotMs * books,
		});
	},
};
