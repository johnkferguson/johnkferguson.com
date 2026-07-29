import { describe, expect, test } from "bun:test";
import { artSvg } from "../generate";
import { PIECES } from "./index";

/*
 * The snapshot cycle is the piece's whole point and none of it is
 * visible to the generic piece tests: those check determinism, colors,
 * and that motion leaves the resting frame alone. What matters here is
 * the shape of the timeline, because the homepage script reads it back
 * (src/lib/art/thumb-motion.ts) to decide whether the pointer left
 * during a book or during a clear.
 */

const base = { seedKey: "snapshot-fees", piece: "snapshot-fees" as const };
const anim = (params?: Record<string, number>) =>
	artSvg({ ...base, width: 800, height: 560, animate: true, params });

/* Read the cadence off the piece rather than restating it. The numbers
 * are still being dialed in, and a test that transcribes them tests
 * nothing except that someone updated two files; what has to hold is the
 * shape (a slot is a book plus a clear, the loop is every slot, and the
 * books tile it with no overlap or gap). */
const DEF = Object.fromEntries(
	PIECES["snapshot-fees"].params.map((s) => [s.key, s.default]),
);
const BOOK = DEF.bookMs;
const CLEAR = DEF.clearMs;
const SLOT = BOOK + CLEAR;
const CYCLE = SLOT * DEF.books;

/** every book group's opacity animation, in document order */
function timeline(svg: string) {
	return [...svg.matchAll(/<animate ([^>]*)\/>/g)].map((m) => {
		const attr = (k: string) => m[1].match(new RegExp(`${k}="([^"]*)"`))?.[1];
		return {
			keyTimes: (attr("keyTimes") ?? "").split(";").map((s) => Number(s)),
			values: (attr("values") ?? "").split(";").map((s) => Number(s)),
			dur: attr("dur"),
		};
	});
}

describe("snapshot cycle", () => {
	test("the still render carries no timeline at all", () => {
		const still = artSvg({ ...base, width: 800, height: 560 });
		expect(still).not.toContain("<animate");
		expect(still).not.toContain("data-snapshot-cycle");
	});

	test("publishes the timings the hover script reads back", () => {
		const svg = anim();
		expect(svg).toContain(`data-snapshot-book="${BOOK}"`);
		expect(svg).toContain(`data-snapshot-slot="${SLOT}"`);
		expect(svg).toContain(`data-snapshot-cycle="${CYCLE}"`);
		expect(svg).toContain(`data-snapshot-lead="${DEF.leadMs}"`);
	});

	test("the lead-in can never outlast the book it shortens", () => {
		/* it is subtracted from the showing book's remaining time, so a
		 * lead-in longer than a book would seek backwards on hover */
		expect(anim({ bookMs: 400, leadMs: 1200 })).toContain(
			'data-snapshot-lead="400"',
		);
	});

	test("emits one gated group per book", () => {
		expect(timeline(anim()).length).toBe(DEF.books);
		expect(timeline(anim({ books: 3 })).length).toBe(3);
		expect(timeline(anim({ books: 7 })).length).toBe(7);
	});

	test("every book runs the same loop, in step order", () => {
		for (const t of timeline(anim())) {
			expect(t.dur).toBe(`${(CYCLE / 1000).toFixed(3)}s`);
			expect(t.keyTimes[0]).toBe(0);
			expect(t.keyTimes.at(-1)).toBe(1);
			expect(t.keyTimes).toEqual([...t.keyTimes].sort((a, b) => a - b));
			expect(t.values.length).toBe(t.keyTimes.length);
		}
	});

	test("book one is the frame at rest and the others are hidden", () => {
		const svg = anim();
		const [first, ...rest] = timeline(svg);
		expect(first.values[0]).toBe(1);
		for (const t of rest) expect(t.values[0]).toBe(0);
		/* and the hidden ones say so before the timeline even starts, so
		 * a thumbnail is correct on the first paint */
		expect(svg.match(/<g opacity="0">/g)?.length).toBe(DEF.books - 1);
	});

	test("books are held, then cleared, with no overlap or gap", () => {
		const spans = timeline(anim()).map((t, i) => {
			/* book one turns on at zero; the rest have an explicit on step */
			const on = i === 0 ? 0 : t.keyTimes[1] * CYCLE;
			const off = (i === 0 ? t.keyTimes[1] : t.keyTimes[2]) * CYCLE;
			return { on, off };
		});
		/* keyTimes are written as 4-decimal fractions of the loop, so
		 * reading them back as milliseconds carries up to CYCLE/20000 of
		 * rounding: compare to the nearest millisecond, not past it */
		const ms = (a: number, b: number) =>
			expect(Math.abs(a - b)).toBeLessThan(1);
		for (const [i, s] of spans.entries()) {
			ms(s.on, i * SLOT);
			ms(s.off - s.on, BOOK);
			/* the next book waits out the full clear */
			const next = spans[i + 1];
			if (next) ms(next.on - s.off, CLEAR);
		}
		/* the last clear runs to the end of the loop, so the wrap back to
		 * book one is a seal like every other */
		ms(CYCLE - spans[spans.length - 1].off, CLEAR);
	});

	test("the mark starts centered and moves every book", () => {
		/* Nothing draws the mark: it is only visible as the point where
		 * bids stop and asks start, so the count of green levels per book
		 * is what locates it. Splitting on the animation nodes groups the
		 * rects by book, since each book's body precedes its own gate. */
		const bids = anim()
			.split("<animate")
			.slice(0, -1)
			.map((book) => (book.match(/var\(--accent-green\)/g) ?? []).length);
		expect(bids.length).toBe(DEF.books);
		/* at rest the book is even: the backdrop and the OG card render
		 * this frame, and one that opened lopsided would look cropped */
		expect(bids[0]).toBe(DEF.bars / 2);
		/* two consecutive snapshots at the same price read as a dropped
		 * frame, so every book has to move at least one level across */
		for (let i = 1; i < bids.length; i++) {
			expect(bids[i]).not.toBe(bids[i - 1]);
		}
		/* and the walk has to cover ground, not just jitter by one */
		expect(Math.max(...bids) - Math.min(...bids)).toBeGreaterThanOrEqual(4);
	});

	test("rerolling the market path leaves the still frame alone", () => {
		/* The whole point of the walk having its own stream: the route the
		 * market takes and the shape of its book are separate judgements.
		 * A pinned backdrop must survive reconsidering the former, or
		 * tuning the animation silently redraws the post page. */
		const still = (walk: number) =>
			artSvg({ ...base, width: 1600, height: 640, params: { walk } });
		expect(still(0)).toBe(still(7));
		expect(still(0)).toBe(still(123));
		/* while the cycle really does take a different route */
		const path = (walk: number) =>
			anim({ walk })
				.split("<animate")
				.slice(0, -1)
				.map((b) => (b.match(/var\(--accent-green\)/g) ?? []).length);
		expect(path(0)).not.toEqual(path(16));
	});

	test("the mark holds a direction rather than alternating every book", () => {
		/* A walk that can turn on any book zigzags around the centre on
		 * roughly a fifth of seeds: it reads as jitter and never travels.
		 * Checked across seeds because it was a property of the walk, not
		 * of any one seed.
		 *
		 * Asserted as the longest run of same-signed steps, which is the
		 * rule itself ("a direction holds for at least two books"). The
		 * obvious alternatives both miss: counting direction changes and
		 * requiring few of them fails honest walks like +--+ (a move, a
		 * two-book run, a turn), while requiring merely that they are not
		 * ALL changes passes a walk that alternates on two of three. */
		for (const seedKey of ["nev47f", "k9m2p", "q4w8e", "sf3", "abc"]) {
			const bids = artSvg({
				seedKey,
				piece: "snapshot-fees",
				width: 800,
				height: 560,
				animate: true,
			})
				.split("<animate")
				.slice(0, -1)
				.map((b) => (b.match(/var\(--accent-green\)/g) ?? []).length);
			/* steps across the walk, excluding the bridge book, which is
			 * meant to turn back */
			const steps: number[] = [];
			for (let i = 1; i < bids.length - 1; i++) {
				steps.push(bids[i] - bids[i - 1]);
			}
			/* the mark's position here is quantised to whole levels, so a
			 * small enough move rounds to a zero step, whose sign matches
			 * neither neighbour and would read as a turn in both
			 * directions. It does not happen at the shipped settings, and
			 * if it starts to, that is worth knowing rather than papering
			 * over inside the run count. */
			expect(steps, `${seedKey} has a level-rounded zero step`).not.toContain(
				0,
			);
			let longest = 1;
			let run = 1;
			for (let i = 1; i < steps.length; i++) {
				run = Math.sign(steps[i]) === Math.sign(steps[i - 1]) ? run + 1 : 1;
				longest = Math.max(longest, run);
			}
			expect(
				longest,
				`${seedKey} never holds a direction for two books`,
			).toBeGreaterThanOrEqual(2);
		}
	});
});
