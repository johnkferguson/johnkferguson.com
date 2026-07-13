import { describe, expect, test } from "bun:test";
import {
	type BookLevel,
	BP,
	computeAccountFees,
	computeMark,
	computeModel,
	type FeeParams,
	stampCapBps,
} from "./engine";

// Reference computation from the mechanism spec (worse-of revision) — "an
// implementation must reproduce these numbers exactly."
// Vector settings: F=15, k=0.5, e=1, B=4 (band M ± 2bp), T=$5,000, Z=20bps (the Maker Zone, formerly W)
// absolute (the spec's older drafts wrote this as the multiple "W=5", i.e.
// 5×S; vectors verify arithmetic at their stated settings, which need not
// match working defaults).
// Fee rule: each paired dollar pays max(own stamp, partner stamp);
// directional dollars pay F. λ and the combine step no longer exist.
const P: FeeParams = {
	B: 4,
	T: 5000,
	F: 15,
	Z: 20,
	slope: 0.5,
	slope2: 2,
	comp: 0,
};

const book: BookLevel[] = [
	{ i: 0, price: 99.97, side: "bid", size: 3000 },
	{ i: 1, price: 99.99, side: "bid", size: 3000 },
	{ i: 2, price: 100.01, side: "ask", size: 3000 },
	{ i: 3, price: 100.03, side: "ask", size: 2000 },
];

describe("spec reference computation (worse-of)", () => {
	const m = computeModel(book, P, 100);
	const bk = (i: number) => {
		const b = m.levels.find((l) => l.i === i)?.bk;
		if (!b) throw new Error(`no breakdown for level ${i}`);
		return b;
	};

	test("impact walks", () => {
		// overlap = min($6k bids, $5k asks) = $5k = T: the eligible walk is
		// exactly the raw walk here.
		// impact bid = (3,000×99.99 + 2,000×99.97)/5,000
		expect(m.iBid).toBeCloseTo(99.982, 10);
		// impact ask = (3,000×100.01 + 2,000×100.03)/5,000
		expect(m.iAsk).toBeCloseTo(100.018, 10);
	});

	test("Mark and band edges", () => {
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.edgeBid).toBeCloseTo(99.98, 10);
		expect(m.edgeAsk).toBeCloseTo(100.02, 10);
		expect(m.frozen).toBe(false);
	});

	test("stamps", () => {
		expect(bk(1).own).toBe(0); // bid 99.99 — in band
		expect(bk(2).own).toBe(0); // ask 100.01 — in band
		expect(bk(0).own).toBeCloseTo(0.5, 10); // bid 99.97 — d = 1bp
		expect(bk(3).own).toBeCloseTo(0.5, 10); // ask 100.03 — d = 1bp
	});

	test("inside bid: both legs in the band → fee 0", () => {
		const b = bk(1);
		expect(b.pairing).toBe(0);
		expect(b.final).toBe(0);
	});

	test("outer bid: worse-of legs, fee 5.3333bp → $1.60, shortfall 35.6%", () => {
		const b = bk(0);
		// $3,000 of ask stock already claimed by the better-priced bid
		expect(b.claimedBefore).toBe(3000);
		// fee = (2,000 × max(0.5, 0.5) + 1,000 × 15) / 3,000
		expect(b.pairing).toBeCloseTo(5.333333333, 8);
		expect(b.final).toBeCloseTo(5.333333333, 8);
		const dollars = (b.final / 10000) * b.q;
		expect(dollars).toBeCloseTo(1.6, 6);
		expect(b.final / P.F).toBeCloseTo(0.3556, 4);
	});

	test("outer ask: fully paired, worse leg 0.5bp", () => {
		const b = bk(3);
		expect(b.unpaired).toBe(0);
		expect(b.final).toBeCloseTo(0.5, 10);
	});
});

describe("Mark pipeline: eligibility, two passes, boundary fill", () => {
	test("dollar-symmetry lemma: raw size imbalance never tilts M (corrected spec vector 2)", () => {
		// Asks shrunk to $3k + $1k against $6k of bids. The overlap gate makes
		// the eligible book $4k per side, so BOTH walks are $1k short and the
		// shortfall cancels exactly: M = 100.0000, not the tilted value the
		// spec's uncorrected vector claimed.
		const m = computeModel(
			[
				{ i: 0, price: 99.97, side: "bid", size: 3000 },
				{ i: 1, price: 99.99, side: "bid", size: 3000 },
				{ i: 2, price: 100.01, side: "ask", size: 3000 },
				{ i: 3, price: 100.03, side: "ask", size: 1000 },
			],
			P,
			100,
		);
		// eligible bids best-first: 3k @ 99.99 + 1k @ 99.97; missing $1k at
		// the window edge 99.99 − 20bps = 99.79 (asks mirrored at 100.21)
		expect(m.iBid).toBeCloseTo(99.946, 10);
		expect(m.iAsk).toBeCloseTo(100.054, 10);
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.shortBid?.missing).toBeCloseTo(1000, 6);
		expect(m.shortBid?.price).toBeCloseTo(99.79, 10);
		expect(m.shortAsk?.missing).toBeCloseTo(1000, 6);
		expect(m.shortAsk?.price).toBeCloseTo(100.21, 10);
	});

	test("symmetric shortage: M unmoved, thinness recorded in the impact spread", () => {
		// Spec vector 3: $10k per side against T=$20k. Half of each walk is
		// boundary fill; M stays put and the impact spread balloons to 22bps.
		const m = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 10000 },
				{ i: 1, price: 100.01, side: "ask", size: 10000 },
			],
			{ ...P, T: 20000 },
			100,
		);
		expect(m.iBid).toBeCloseTo(99.89, 10);
		expect(m.iAsk).toBeCloseTo(100.11, 10);
		expect(m.M).toBeCloseTo(100.0, 10);
		expect((m.impactSpread ?? 0) / BP).toBeCloseTo(22, 8);
	});

	test("boundary fill is an interpolator: M = c·walkedMid + (1−c)·anchorMid, Z cancels", () => {
		const thin: BookLevel[] = [
			{ i: 0, price: 99.95, side: "bid", size: 5000 },
			{ i: 1, price: 99.99, side: "bid", size: 5000 },
			{ i: 2, price: 100.01, side: "ask", size: 10000 },
		];
		const m = computeModel(thin, { ...P, T: 20000 }, 100);
		// c = eligible/T = 0.5; walked mid = (99.97 + 100.01)/2 = 99.99;
		// anchor mid = (99.99 + 100.01)/2 = 100.00
		expect(m.M).toBeCloseTo(0.5 * 99.99 + 0.5 * 100.0, 10);
		// the Z terms cancel in the midpoint: same M at any zone width
		// (given the same eligible set), even as both impact prices move
		const m10 = computeModel(thin, { ...P, T: 20000, Z: 10 }, 100);
		expect(m10.iBid).not.toBeCloseTo(m.iBid ?? Number.NaN, 6);
		expect(m10.M).toBeCloseTo(m.M, 10);
	});

	test("incoherent market: no mutually in-range consensus → M held", () => {
		// Spec vector 6. P: 100.00 / 100.50; Q: 99.60 / 100.02; W = 20bps.
		// Pass 1 anchors 100.00 / 100.02; P's ask and Q's bid are both out of
		// range, so both overlaps are zero and the eligible set is empty.
		const m = computeMark(
			[
				{
					id: "P",
					levels: [
						{ i: 0, price: 100.0, side: "bid", size: 5000 },
						{ i: 1, price: 100.5, side: "ask", size: 5000 },
					],
				},
				{
					id: "Q",
					levels: [
						{ i: 0, price: 99.6, side: "bid", size: 5000 },
						{ i: 1, price: 100.02, side: "ask", size: 5000 },
					],
				},
			],
			{ B: 4, T: 5000, Z: 20 },
			100.123,
		);
		expect(m.frozen).toBe(true);
		expect(m.M).toBe(100.123);
		expect(m.impactSpread).toBeNull();
	});

	test("two-pass anchoring: a one-sided touch order cannot position the window", () => {
		// A voiceless aggressive bid at 100.00 far above a real maker's book.
		// Anchors come from two-sided accounts only, so the maker keeps its
		// window and M computes fresh from its quotes.
		const m = computeMark(
			[
				{
					id: "silencer",
					levels: [{ i: 0, price: 100.0, side: "bid", size: 5000 }],
				},
				{
					id: "maker",
					levels: [
						{ i: 0, price: 99.75, side: "bid", size: 5000 },
						{ i: 1, price: 99.77, side: "ask", size: 5000 },
					],
				},
			],
			{ B: 4, T: 5000, Z: 20 },
			100,
		);
		expect(m.frozen).toBe(false);
		expect(m.M).toBeCloseTo(99.76, 10);
		expect(m.shareBid.get("silencer")).toBe(0);
		expect(m.shareBid.get("maker")).toBeCloseTo(1, 10);
	});
});

describe("anchors and invariants", () => {
	test("taker anchor: no opposite quotes → fee = F", () => {
		const m = computeModel(
			[{ i: 0, price: 99.99, side: "bid", size: 5000 }],
			P,
			100,
		);
		const b = m.levels[0].bk;
		expect(b?.pairing).toBe(P.F);
		expect(b?.final).toBe(P.F);
	});

	test("one side empty → M frozen at fallback", () => {
		const m = computeModel(
			[{ i: 0, price: 99.99, side: "bid", size: 5000 }],
			P,
			100.005,
		);
		expect(m.frozen).toBe(true);
		expect(m.M).toBe(100.005);
	});

	test("worse-leg identity: a symmetric paired book pays one leg, not two", () => {
		// bids and asks both 2bp outside the band (stamp 1.0 at k=0.5):
		// per-dollar max(1.0, 1.0) = 1.0 — width pressure is k alone.
		const m = computeModel(
			[
				{ i: 0, price: 99.96, side: "bid", size: 5000 },
				{ i: 1, price: 100.04, side: "ask", size: 5000 },
			],
			P,
			100,
		);
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.levels[0].bk?.own).toBeCloseTo(1.0, 10);
		expect(m.levels[0].bk?.final).toBeCloseTo(1.0, 10);
		expect(m.levels[1].bk?.final).toBeCloseTo(1.0, 10);
	});

	test("your scenario: pairing at-or-inside your level costs nothing extra", () => {
		// M lands at 99.99, so both quotes sit exactly on their band edges
		// (own = 0); every paired dollar pays max(own, 0) = own only.
		const m = computeModel(
			[
				{ i: 0, price: 99.97, side: "bid", size: 5000 },
				{ i: 1, price: 100.01, side: "ask", size: 5000 },
			],
			P,
			100,
		);
		const b = m.levels[0].bk;
		expect(b?.unpaired).toBe(0);
		expect(b?.final).toBeCloseTo(b?.own ?? Number.NaN, 10);
	});

	test("junk-pairing anchor: far pairing is worth exactly nothing", () => {
		const withJunk = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 5000 },
				{ i: 1, price: 100.005, side: "ask", size: 100 },
				{ i: 2, price: 100.4, side: "ask", size: 5000 },
			],
			P,
			100,
		);
		const without = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 5000 },
				{ i: 1, price: 100.005, side: "ask", size: 100 },
			],
			P,
			100,
		);
		expect(withJunk.M).toBeCloseTo(without.M, 10);
		expect(withJunk.stampOf(100.4, "ask")).toBe(P.F);
		const feeWith = withJunk.levels[0].bk?.final;
		const feeWithout = without.levels[0].bk?.final;
		expect(feeWith).toBeCloseTo(feeWithout ?? Number.NaN, 10);
	});

	test("single-account caveat: a LONE far ask bends M toward itself", () => {
		// The self-anchoring regime: the far ask is its own side's best, so
		// it stays in range, feeds the walk, and cuts its own stamp below
		// the cap (documented limitation; leave-one-out is the upgrade path).
		const m = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 5000 },
				{ i: 1, price: 100.4, side: "ask", size: 5000 },
			],
			P,
			100,
		);
		expect(m.M).toBeCloseTo(100.195, 10);
		expect(m.levels[1].bk?.own).toBeCloseTo(9.25, 6);
	});

	test("fee ∈ [0, F] across a parameter sweep", () => {
		for (const B of [1, 4, 10]) {
			for (const slope of [0.25, 0.75, 1, 3]) {
				const m = computeModel(book, { ...P, B, slope }, 100);
				for (const lv of m.levels) {
					if (!lv.bk) continue;
					expect(lv.bk.final).toBeGreaterThanOrEqual(0);
					expect(lv.bk.final).toBeLessThanOrEqual(P.F);
				}
			}
		}
	});

	test("own-distance floor: fee ≥ own stamp", () => {
		const m = computeModel(book, P, 100);
		for (const lv of m.levels) {
			if (!lv.bk) continue;
			expect(lv.bk.final).toBeGreaterThanOrEqual(
				Math.min(lv.bk.own, P.F) - 1e-9,
			);
		}
	});

	test("allocation total is conserved: paired + directional = size", () => {
		const m = computeModel(book, P, 100);
		for (const lv of m.levels) {
			if (!lv.bk) continue;
			const paired = lv.bk.pairs.reduce((s, pr) => s + pr.paired, 0);
			expect(paired + lv.bk.unpaired).toBeCloseTo(lv.size, 6);
		}
	});
});

describe("multi-maker Mark", () => {
	const MP = { B: 2, T: 20000, Z: 8 };
	const you = (levels: BookLevel[]) => ({ id: "you", levels });
	const agg = (levels: BookLevel[]) => ({ id: "agg", levels });

	test("pro-rata attribution and walk shares", () => {
		const m = computeMark(
			[
				you([
					{ i: 9, price: 99.995, side: "bid", size: 5000 },
					{ i: 11, price: 100.005, side: "ask", size: 5000 },
				]),
				agg([
					{ i: 9, price: 99.995, side: "bid", size: 15000 },
					{ i: 11, price: 100.005, side: "ask", size: 15000 },
				]),
			],
			MP,
			100,
		);
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.iBid).toBeCloseTo(99.995, 10);
		expect(m.shareBid.get("you")).toBeCloseTo(0.25, 10);
		expect(m.shareBid.get("agg")).toBeCloseTo(0.75, 10);
		expect(m.used.get("you")?.get(9)).toBeCloseTo(5000, 6);
		expect(m.used.get("agg")?.get(9)).toBeCloseTo(15000, 6);
	});

	test("one-sided size has no vote", () => {
		const m = computeMark(
			[
				you([{ i: 8, price: 99.99, side: "bid", size: 5000 }]),
				agg([
					{ i: 9, price: 99.995, side: "bid", size: 1000 },
					{ i: 11, price: 100.005, side: "ask", size: 1000 },
				]),
			],
			MP,
			100,
		);
		// your bid is the biggest size in the book, and it counts for nothing
		expect(m.eligible.get("you")?.size ?? 0).toBe(0);
		expect(m.shareBid.get("you")).toBe(0);
		// the $1k eligible book walks first; the missing $19k boundary-fills
		// at the window edge (99.995 − 8bps and 100.005 + 8bps)
		expect(m.iBid).toBeCloseTo((1000 * 99.995 + 19000 * 99.915) / 20000, 10);
		expect(m.M).toBeCloseTo(100.0, 10);
		// the thermometer reads the thinness that M's location does not
		expect((m.impactSpread ?? 0) / BP).toBeCloseTo(16.2, 8);
	});

	test("size beyond W of the side's anchor has no vote and burns no overlap", () => {
		const m = computeMark(
			[
				you([
					{ i: 9, price: 99.995, side: "bid", size: 5000 },
					{ i: 11, price: 100.005, side: "ask", size: 5000 },
					// 19.5bps behind the anchor: invisible at W = 8bps
					{ i: 0, price: 99.8, side: "bid", size: 8000 },
				]),
				agg([
					{ i: 9, price: 99.995, side: "bid", size: 5000 },
					{ i: 11, price: 100.005, side: "ask", size: 5000 },
				]),
			],
			MP,
			100,
		);
		expect(m.eligible.get("you")?.get(0)).toBeUndefined();
		expect(m.eligible.get("you")?.get(9)).toBeCloseTo(5000, 6);
		expect(m.M).toBeCloseTo(100.0, 10);
	});

	test("a leaning crowd moves M and re-prices an untouched book", () => {
		const P: FeeParams = {
			B: 2,
			T: 20000,
			F: 15,
			Z: 8,
			slope: 0.5,
			slope2: 1,
			comp: 0,
		};
		const yourBook: BookLevel[] = [
			{ i: 9, price: 99.995, side: "bid", size: 5000 },
			{ i: 11, price: 100.005, side: "ask", size: 5000 },
		];
		const balanced = computeMark(
			[
				you(yourBook),
				agg([
					{ i: 9, price: 99.995, side: "bid", size: 20000 },
					{ i: 11, price: 100.005, side: "ask", size: 20000 },
				]),
			],
			MP,
			100,
		);
		expect(balanced.M).toBeCloseTo(100.0, 10);
		const feesBefore = computeAccountFees(yourBook, P, balanced.M);
		expect(feesBefore.levels[0].bk?.final).toBeCloseTo(0, 10);

		const leaning = computeMark(
			[
				you(yourBook),
				agg([
					{ i: 9, price: 99.995, side: "bid", size: 20000 },
					{ i: 12, price: 100.045, side: "ask", size: 20000 },
				]),
			],
			MP,
			100,
		);
		// bid walk: 20,000 of the 25,000 at 99.995, pro-rata
		expect(leaning.used.get("you")?.get(9)).toBeCloseTo(4000, 6);
		expect(leaning.used.get("agg")?.get(9)).toBeCloseTo(16000, 6);
		// ask walk: your 5,000 at 100.005 plus 15,000 at 100.045
		expect(leaning.iAsk).toBeCloseTo(100.035, 10);
		expect(leaning.M).toBeCloseTo(100.015, 10);

		// your book did not move, but the yardstick did: both legs now 1bps
		// outside their edges' reach → worse-of gives 0.5bps each
		const feesAfter = computeAccountFees(yourBook, P, leaning.M);
		expect(feesAfter.levels[0].bk?.own).toBeCloseTo(0.5, 10);
		expect(feesAfter.levels[0].bk?.final).toBeCloseTo(0.5, 10);
		expect(feesAfter.levels[1].bk?.final).toBeCloseTo(0.5, 10);
	});
});

describe("piecewise stamp (the zone knee)", () => {
	// Settled calibration: B=2, Z=8, k1=0.8, k2=1, F=10: stamp 6.4bps at the
	// knee, cap reached 11.6bps beyond the band edge (12.6bps from M).
	const p: FeeParams = {
		B: 2,
		T: 20000,
		F: 10,
		Z: 8,
		slope: 0.8,
		slope2: 1,
		comp: 0,
	};

	test("gentle inside the zone, steeper beyond, capped at F", () => {
		const af = computeAccountFees([], p, 100);
		const at = (dBps: number) => af.stampOf(100.01 + dBps * BP, "ask");
		expect(at(4)).toBeCloseTo(3.2, 10); // k1 region
		expect(at(8)).toBeCloseTo(6.4, 10); // the knee
		expect(at(10)).toBeCloseTo(8.4, 10); // k2 region: 6.4 + 1 x 2
		expect(at(11.6)).toBeCloseTo(10, 10); // cap arrives
		expect(at(20)).toBe(10); // and holds
	});

	test("stampCapBps: cap distance honours the knee", () => {
		expect(stampCapBps(p)).toBeCloseTo(11.6, 10);
		// a cap below the knee never reaches k2: F/k1 alone
		expect(stampCapBps({ ...p, F: 5 })).toBeCloseTo(6.25, 10);
	});
});
