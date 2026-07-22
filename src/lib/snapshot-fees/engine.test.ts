import { describe, expect, test } from "bun:test";
import {
	type BookLevel,
	BP,
	computeAccountFees,
	computeMark,
	computeModel,
	type FeeParams,
	fullFeeBps,
} from "./engine";

// Reference computation from the mechanism spec (worse-of revision) — "an
// implementation must reproduce these numbers exactly."
// Vector settings: F=15, k=0.5, e=1, B=4 (band M ± 2bp), D=$5,000, Z=20bps (the Maker Zone, formerly W)
// absolute (the spec's older drafts wrote this as the multiple "W=5", i.e.
// 5×S; vectors verify arithmetic at their stated settings, which need not
// match working defaults).
// Fee rule: each paired dollar pays max(own base fee, partner base fee);
// directional dollars pay F. λ and the combine step no longer exist.
const P: FeeParams = {
	B: 4,
	D: 5000,
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
	// lastM null: a fresh M must never depend on carried state
	const m = computeModel(book, P, null);
	const bk = (i: number) => {
		const b = m.levels.find((l) => l.i === i)?.bk;
		if (!b) throw new Error(`no breakdown for level ${i}`);
		return b;
	};

	test("impact walks", () => {
		// overlap = min($6k bids, $5k asks) = $5k = D: the eligible walk is
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
		expect(m.state).toBe("fresh");
	});

	test("base fees", () => {
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

describe("Mark pipeline: eligibility, candidates, boundary fill", () => {
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
			null,
		);
		// eligible bids best-first: 3k @ 99.99 + 1k @ 99.97; missing $1k at
		// the window edge 99.99 − (Z + B/2) = 99.99 − 22bps = 99.77 (asks
		// mirrored at 100.23)
		expect(m.iBid).toBeCloseTo(99.942, 10);
		expect(m.iAsk).toBeCloseTo(100.058, 10);
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.shortBid?.missing).toBeCloseTo(1000, 6);
		expect(m.shortBid?.price).toBeCloseTo(99.77, 10);
		expect(m.shortAsk?.missing).toBeCloseTo(1000, 6);
		expect(m.shortAsk?.price).toBeCloseTo(100.23, 10);
	});

	test("symmetric shortage: M unmoved, thinness recorded in the impact spread", () => {
		// Spec vector 3: $10k per side against D=$20k. Half of each walk is
		// boundary fill at anchor ± 22bps; M stays put and the impact spread
		// balloons to 24bps.
		const m = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 10000 },
				{ i: 1, price: 100.01, side: "ask", size: 10000 },
			],
			{ ...P, D: 20000 },
			null,
		);
		expect(m.iBid).toBeCloseTo(99.88, 10);
		expect(m.iAsk).toBeCloseTo(100.12, 10);
		expect(m.M).toBeCloseTo(100.0, 10);
		expect((m.impactSpread ?? 0) / BP).toBeCloseTo(24, 8);
	});

	test("boundary fill is an interpolator: M = c·walkedMid + (1−c)·anchorMid, Z cancels", () => {
		const thin: BookLevel[] = [
			{ i: 0, price: 99.95, side: "bid", size: 5000 },
			{ i: 1, price: 99.99, side: "bid", size: 5000 },
			{ i: 2, price: 100.01, side: "ask", size: 10000 },
		];
		const m = computeModel(thin, { ...P, D: 20000 }, null);
		// c = eligible/D = 0.5; walked mid = (99.97 + 100.01)/2 = 99.99;
		// anchor mid = (99.99 + 100.01)/2 = 100.00
		expect(m.M).toBeCloseTo(0.5 * 99.99 + 0.5 * 100.0, 10);
		// the Z terms cancel in the midpoint: same M at any zone width
		// (given the same eligible set), even as both impact prices move
		const m10 = computeModel(thin, { ...P, D: 20000, Z: 10 }, null);
		expect(m10.iBid).not.toBeCloseTo(m.iBid ?? Number.NaN, 6);
		expect(m10.M).toBeCloseTo(m.M ?? Number.NaN, 10);
	});

	test("incoherent quoter dropped: P/Q resolves to the one valid candidate (re-pinned spec vector 6)", () => {
		// P: 100.00 / 100.50; Q: 99.60 / 100.02; reach 22bp, span 44bp.
		// P's own quotes stand 50bp apart — wider than the span — so P's
		// candidate is incoherent and dropped. Q's (42bp) is a valid market:
		// the mark computes from Q alone. (Under the pre-candidate pipeline
		// this vector emptied both sides and held; the span check re-pins it.)
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
			{ B: 4, D: 5000, Z: 20 },
			100.123,
		);
		expect(m.state).toBe("fresh");
		expect(m.M).toBeCloseTo(99.81, 10);
		expect((m.impactSpread ?? 0) / BP).toBeCloseTo(42, 8);
		expect(m.shareBid.get("P")).toBe(0);
		expect(m.shareBid.get("Q")).toBeCloseTo(1, 10);
	});

	test("disjoint candidates at a strict tie: two books disputing the price → M held", () => {
		// Both books are internally coherent (40bp and 42bp, inside the 44bp
		// span) but stand outside each other's reach, and their eligible size
		// ties exactly: no dominant candidate, no fresh M.
		const books = [
			{
				id: "P",
				levels: [
					{ i: 0, price: 100.0, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.4, side: "ask" as const, size: 5000 },
				],
			},
			{
				id: "Q",
				levels: [
					{ i: 0, price: 99.6, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.02, side: "ask" as const, size: 5000 },
				],
			},
		];
		const held = computeMark(books, { B: 4, D: 5000, Z: 20 }, 100.123);
		expect(held.state).toBe("held");
		expect(held.M).toBe(100.123);
		expect(held.impactSpread).toBeNull();
		// at launch there is no mark to carry: the no-mark state
		const none = computeMark(books, { B: 4, D: 5000, Z: 20 }, null);
		expect(none.state).toBe("none");
		expect(none.M).toBeNull();
	});

	test("straddler cannot merge two markets: self-crossed account is gated, disjoint tie holds", () => {
		// Two separate two-sided markets, 300bp apart, eligible sizes tied
		// exactly. Account X straddles both with tiny paired books — which
		// makes X self-crossed (own bid 102.995 above own ask 100.005).
		// The coherence gate drops X from mark participation entirely, the
		// real markets tie as disjoint candidates, and the tie resolves to
		// held. (Pre-gate, X hijacked anchoring and minted M = 101.5.)
		const books = [
			{
				id: "P1",
				levels: [
					{ i: 0, price: 99.99, side: "bid" as const, size: 50000 },
					{ i: 1, price: 100.01, side: "ask" as const, size: 50000 },
				],
			},
			{
				id: "P2",
				levels: [
					{ i: 0, price: 102.99, side: "bid" as const, size: 50000 },
					{ i: 1, price: 103.01, side: "ask" as const, size: 50000 },
				],
			},
			{
				id: "X",
				levels: [
					{ i: 0, price: 99.995, side: "bid" as const, size: 5 },
					{ i: 1, price: 100.005, side: "ask" as const, size: 5 },
					{ i: 2, price: 102.995, side: "bid" as const, size: 5 },
					{ i: 3, price: 103.005, side: "ask" as const, size: 5 },
				],
			},
		];
		const held = computeMark(books, { B: 4, D: 5000, Z: 20 }, 100.5);
		expect(held.state).toBe("held");
		expect(held.M).toBe(100.5);
		expect(held.shareBid.get("X")).toBe(0);
		const none = computeMark(books, { B: 4, D: 5000, Z: 20 }, null);
		expect(none.state).toBe("none");
	});

	test("self-crossed account alone cannot form a mark", () => {
		const books = [
			{
				id: "X",
				levels: [
					{ i: 0, price: 100.05, side: "bid" as const, size: 5000 },
					{ i: 1, price: 99.95, side: "ask" as const, size: 5000 },
				],
			},
		];
		expect(computeMark(books, { B: 4, D: 5000, Z: 20 }, null).state).toBe(
			"none",
		);
		expect(computeMark(books, { B: 4, D: 5000, Z: 20 }, 100).state).toBe(
			"held",
		);
	});

	test("locked own book (bid == ask) is gated like crossed", () => {
		const books = [
			{
				id: "X",
				levels: [
					{ i: 0, price: 100.0, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.0, side: "ask" as const, size: 5000 },
				],
			},
		];
		expect(computeMark(books, { B: 4, D: 5000, Z: 20 }, null).state).toBe(
			"none",
		);
	});

	test("gated account changes nothing for the healthy market around it", () => {
		const healthy = [
			{
				id: "P",
				levels: [
					{ i: 0, price: 99.99, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.01, side: "ask" as const, size: 5000 },
				],
			},
		];
		const withCrossed = [
			...healthy,
			{
				id: "X",
				levels: [
					{ i: 0, price: 100.2, side: "bid" as const, size: 9000 },
					{ i: 1, price: 99.8, side: "ask" as const, size: 9000 },
				],
			},
		];
		const a = computeMark(healthy, { B: 4, D: 5000, Z: 20 }, null);
		const b = computeMark(withCrossed, { B: 4, D: 5000, Z: 20 }, null);
		expect(b.state).toBe("fresh");
		expect(b.M).toBeCloseTo(a.M ?? Number.NaN, 12);
		expect(b.iBid).toBeCloseTo(a.iBid ?? Number.NaN, 12);
		expect(b.iAsk).toBeCloseTo(a.iAsk ?? Number.NaN, 12);
		expect(b.shareBid.get("X")).toBe(0);
		expect(b.shareBid.get("P")).toBeCloseTo(1, 10);
	});

	test("crossing BETWEEN accounts is normal and unaffected by the gate", () => {
		// A's bid stands above B's ask (batch crossing) but each account is
		// internally coherent — both participate, a mark forms.
		const books = [
			{
				id: "A",
				levels: [
					{ i: 0, price: 100.02, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.1, side: "ask" as const, size: 5000 },
				],
			},
			{
				id: "B",
				levels: [
					{ i: 0, price: 99.9, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.0, side: "ask" as const, size: 5000 },
				],
			},
		];
		const m = computeMark(books, { B: 4, D: 5000, Z: 20 }, null);
		expect(m.state).toBe("fresh");
		expect(m.M).not.toBeNull();
		expect((m.shareBid.get("A") ?? 0) + (m.shareBid.get("B") ?? 0)).toBeCloseTo(
			1,
			10,
		);
	});

	test("non-positive D cannot mint a mark (guards the 0/0 walk)", () => {
		const books = [
			{
				id: "P",
				levels: [
					{ i: 0, price: 99.99, side: "bid" as const, size: 5000 },
					{ i: 1, price: 100.01, side: "ask" as const, size: 5000 },
				],
			},
		];
		const zero = computeMark(books, { B: 4, D: 0, Z: 20 }, null);
		expect(zero.state).toBe("none");
		expect(zero.M).toBeNull();
		const zeroHeld = computeMark(books, { B: 4, D: 0, Z: 20 }, 100.05);
		expect(zeroHeld.state).toBe("held");
		expect(zeroHeld.M).toBe(100.05);
		const negative = computeMark(books, { B: 4, D: -100, Z: 20 }, null);
		expect(negative.state).toBe("none");
	});

	test("one-sided touch order cannot position the window (no seed, no voice)", () => {
		// A voiceless aggressive bid at 100.00 far above a real maker's book.
		// One-sided accounts propose no seed, so the maker's own candidate is
		// the only one and M computes fresh from its quotes.
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
			{ B: 4, D: 5000, Z: 20 },
			100,
		);
		expect(m.state).toBe("fresh");
		expect(m.M).toBeCloseTo(99.76, 10);
		expect(m.shareBid.get("silencer")).toBe(0);
		expect(m.shareBid.get("maker")).toBeCloseTo(1, 10);
	});
});

describe("candidate selection: seeds, span, largest book wins", () => {
	test("dust far from the market loses the size comparison (the dust-freeze attack is dead)", () => {
		// $2 of paired dust 100bp away. Under global best-quote anchoring this
		// grabbed the bid anchor and emptied eligibility on both sides,
		// freezing M. Under candidate selection the honest book ($5k/side)
		// dwarfs the dust candidate ($2/side): M computes at 100.
		const m = computeMark(
			[
				{
					id: "honest",
					levels: [
						{ i: 0, price: 99.99, side: "bid", size: 5000 },
						{ i: 1, price: 100.01, side: "ask", size: 5000 },
					],
				},
				{
					id: "dust",
					levels: [
						{ i: 0, price: 101.0, side: "bid", size: 2 },
						{ i: 1, price: 101.01, side: "ask", size: 2 },
					],
				},
			],
			{ B: 4, D: 5000, Z: 20 },
			null,
		);
		expect(m.state).toBe("fresh");
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.shareBid.get("dust")).toBe(0);
		expect(m.shareAsk.get("dust")).toBe(0);
		expect(m.eligible.get("dust")?.size ?? 0).toBe(0);
	});

	test("wide-straddle seed is cleaned by pass 2: the far ask cannot vote", () => {
		// The attacker's bid sits at the honest touch and its ask 30bp above,
		// so its SEED window swallows everything. Pass 2 re-anchors at the
		// best eligible quotes and the far ask falls out of reach, zeroing
		// the attacker's overlap: the surviving candidate is honest-only.
		const m = computeMark(
			[
				{
					id: "honest",
					levels: [
						{ i: 0, price: 99.99, side: "bid", size: 5000 },
						{ i: 1, price: 100.01, side: "ask", size: 5000 },
					],
				},
				{
					id: "straddle",
					levels: [
						{ i: 0, price: 99.995, side: "bid", size: 10000 },
						{ i: 1, price: 100.3, side: "ask", size: 10000 },
					],
				},
			],
			{ B: 2, D: 5000, Z: 8 },
			null,
		);
		expect(m.state).toBe("fresh");
		expect(m.M).toBeCloseTo(100.0, 10);
		expect(m.shareBid.get("straddle")).toBe(0);
		expect(m.eligible.get("straddle")?.size ?? 0).toBe(0);
	});

	test("chain: overlapping candidates resolve to the larger, no held (the Q4 geometry)", () => {
		// A—B—C: B is within reach of both ends, A and C are out of reach of
		// each other. Two overlapping candidates form, {A,B} $35k and {B,C}
		// $25k, sharing B. Overlap is ambiguity, not disagreement: the larger
		// wins, C gets no voice, and M never holds.
		const m = computeMark(
			[
				{
					id: "A",
					levels: [
						{ i: 0, price: 99.9, side: "bid", size: 20000 },
						{ i: 1, price: 99.98, side: "ask", size: 20000 },
					],
				},
				{
					id: "B",
					levels: [
						{ i: 0, price: 99.97, side: "bid", size: 15000 },
						{ i: 1, price: 100.05, side: "ask", size: 15000 },
					],
				},
				{
					id: "C",
					levels: [
						{ i: 0, price: 100.04, side: "bid", size: 10000 },
						{ i: 1, price: 100.12, side: "ask", size: 10000 },
					],
				},
			],
			{ B: 2, D: 20000, Z: 8 },
			null,
		);
		expect(m.state).toBe("fresh");
		// winner {A,B}: iBid = (15k×99.97 + 5k×99.90)/20k, iAsk = 99.98
		expect(m.iBid).toBeCloseTo(99.9525, 10);
		expect(m.iAsk).toBeCloseTo(99.98, 10);
		expect(m.M).toBeCloseTo(99.96625, 10);
		expect(m.shareBid.get("B")).toBeCloseTo(0.75, 10);
		expect(m.shareBid.get("A")).toBeCloseTo(0.25, 10);
		expect(m.shareBid.get("C")).toBe(0);
		expect(m.eligible.get("C")?.size ?? 0).toBe(0);
	});

	test("overlapping candidates at an exact tie break deterministically, never hold", () => {
		// Symmetric chain: {A,B} and {B,C} both hold $15k. They share B, so
		// this is one region read twice, not two markets disputing the price:
		// the tiebreak (tighter anchor spread, then higher bid anchor) picks
		// {B,C} and M stays fresh.
		const m = computeMark(
			[
				{
					id: "A",
					levels: [
						{ i: 0, price: 99.9, side: "bid", size: 10000 },
						{ i: 1, price: 99.98, side: "ask", size: 10000 },
					],
				},
				{
					id: "B",
					levels: [
						{ i: 0, price: 99.97, side: "bid", size: 5000 },
						{ i: 1, price: 100.05, side: "ask", size: 5000 },
					],
				},
				{
					id: "C",
					levels: [
						{ i: 0, price: 100.04, side: "bid", size: 10000 },
						{ i: 1, price: 100.12, side: "ask", size: 10000 },
					],
				},
			],
			{ B: 2, D: 15000, Z: 8 },
			null,
		);
		expect(m.state).toBe("fresh");
		expect(m.iBid).toBeCloseTo(100.016666667, 8);
		expect(m.iAsk).toBeCloseTo(100.096666667, 8);
		expect(m.M).toBeCloseTo(100.056666667, 8);
		expect(m.eligible.get("A")?.size ?? 0).toBe(0);
		expect((m.eligible.get("C")?.size ?? 0) > 0).toBe(true);
	});

	test("span check: a lone pair wider than B + 2Z is not a market", () => {
		const wide: BookLevel[] = [
			{ i: 0, price: 99.99, side: "bid", size: 5000 },
			{ i: 1, price: 100.45, side: "ask", size: 5000 }, // 46bp > 44bp span
		];
		const heldM = computeModel(wide, P, 100);
		expect(heldM.state).toBe("held");
		expect(heldM.M).toBe(100);
		const noneM = computeModel(wide, P, null);
		expect(noneM.state).toBe("none");
		expect(noneM.M).toBeNull();
	});

	test("span check: a lone pair at exactly B + 2Z is", () => {
		const m = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 5000 },
				{ i: 1, price: 100.43, side: "ask", size: 5000 }, // exactly 44bp
			],
			P,
			null,
		);
		expect(m.state).toBe("fresh");
		expect(m.M).toBeCloseTo(100.21, 10);
	});
});

describe("anchors and invariants", () => {
	test("taker anchor: no opposite quotes → fee = F", () => {
		const m = computeModel(
			[{ i: 0, price: 99.99, side: "bid", size: 5000 }],
			P,
			100,
		);
		expect(m.state).toBe("held");
		const b = m.levels[0].bk;
		expect(b?.pairing).toBe(P.F);
		expect(b?.final).toBe(P.F);
	});

	test("one side empty → M held at the carried mark", () => {
		const m = computeModel(
			[{ i: 0, price: 99.99, side: "bid", size: 5000 }],
			P,
			100.005,
		);
		expect(m.state).toBe("held");
		expect(m.M).toBe(100.005);
	});

	test("no-mark state: no mark has ever formed → M null, every dollar pays the cap", () => {
		const m = computeModel(
			[{ i: 0, price: 99.99, side: "bid", size: 5000 }],
			P,
			null,
		);
		expect(m.state).toBe("none");
		expect(m.M).toBeNull();
		expect(m.edgeBid).toBeNull();
		expect(m.levels[0].bk?.final).toBe(P.F);
		// paired-at-any-width dollars are equally unpriceable without a mark
		const af = computeAccountFees(book, P, null);
		for (const lv of af.levels) {
			if (!lv.bk) continue;
			expect(lv.bk.own).toBe(P.F);
			expect(lv.bk.final).toBe(P.F);
		}
	});

	test("worse-leg identity: a symmetric paired book pays one leg, not two", () => {
		// bids and asks both 2bp outside the band (base fee 1.0 at k=0.5):
		// per-dollar max(1.0, 1.0) = 1.0 — width pressure is k alone.
		const m = computeModel(
			[
				{ i: 0, price: 99.96, side: "bid", size: 5000 },
				{ i: 1, price: 100.04, side: "ask", size: 5000 },
			],
			P,
			null,
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
			null,
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
			null,
		);
		const without = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 5000 },
				{ i: 1, price: 100.005, side: "ask", size: 100 },
			],
			P,
			null,
		);
		expect(withJunk.M).toBeCloseTo(without.M ?? Number.NaN, 10);
		expect(withJunk.baseFeeOf(100.4, "ask")).toBe(P.F);
		const feeWith = withJunk.levels[0].bk?.final;
		const feeWithout = without.levels[0].bk?.final;
		expect(feeWith).toBeCloseTo(feeWithout ?? Number.NaN, 10);
	});

	test("single-account caveat: a LONE far ask within the span bends M toward itself", () => {
		// The self-anchoring regime: the far ask is its own side's best, the
		// pair stands 41bp apart (inside the 44bp span, so still a coherent
		// candidate), it feeds the walk and cuts its own base fee below the cap
		// (documented limitation; leave-one-out is the upgrade path). At
		// working calibrations with a tighter span this shape is excluded —
		// see the span-check tests.
		const m = computeModel(
			[
				{ i: 0, price: 99.99, side: "bid", size: 5000 },
				{ i: 1, price: 100.4, side: "ask", size: 5000 },
			],
			P,
			null,
		);
		expect(m.M).toBeCloseTo(100.195, 10);
		expect(m.levels[1].bk?.own).toBeCloseTo(9.25, 6);
	});

	test("fee ∈ [0, F] across a parameter sweep", () => {
		for (const B of [1, 4, 10]) {
			for (const slope of [0.25, 0.75, 1, 3]) {
				const m = computeModel(book, { ...P, B, slope }, null);
				for (const lv of m.levels) {
					if (!lv.bk) continue;
					expect(lv.bk.final).toBeGreaterThanOrEqual(0);
					expect(lv.bk.final).toBeLessThanOrEqual(P.F);
				}
			}
		}
	});

	test("own-distance floor: fee ≥ own base fee", () => {
		const m = computeModel(book, P, null);
		for (const lv of m.levels) {
			if (!lv.bk) continue;
			expect(lv.bk.final).toBeGreaterThanOrEqual(
				Math.min(lv.bk.own, P.F) - 1e-9,
			);
		}
	});

	test("allocation total is conserved: paired + directional = size", () => {
		const m = computeModel(book, P, null);
		for (const lv of m.levels) {
			if (!lv.bk) continue;
			const paired = lv.bk.pairs.reduce((s, pr) => s + pr.paired, 0);
			expect(paired + lv.bk.unpaired).toBeCloseTo(lv.size, 6);
		}
	});
});

describe("multi-maker Mark", () => {
	const MP = { B: 2, D: 20000, Z: 8 };
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
		// at the window edge, Z + B/2 = 9bps out (99.905 and 100.095)
		expect(m.iBid).toBeCloseTo((1000 * 99.995 + 19000 * 99.905) / 20000, 10);
		expect(m.M).toBeCloseTo(100.0, 10);
		// the thermometer reads the thinness that M's location does not
		expect((m.impactSpread ?? 0) / BP).toBeCloseTo(18.1, 8);
	});

	test("size beyond the reach (Z + B/2) of the side's anchor has no vote and burns no overlap", () => {
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
			D: 20000,
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

describe("piecewise base fee (the zone knee)", () => {
	// Settled calibration: B=2, Z=8, k1=0.8, k2=1, F=10: base fee 6.4bps at the
	// knee, cap reached 11.6bps beyond the band edge (12.6bps from M).
	const p: FeeParams = {
		B: 2,
		D: 20000,
		F: 10,
		Z: 8,
		slope: 0.8,
		slope2: 1,
		comp: 0,
	};

	test("gentle inside the zone, steeper beyond, capped at F", () => {
		const af = computeAccountFees([], p, 100);
		const at = (dBps: number) => af.baseFeeOf(100.01 + dBps * BP, "ask");
		expect(at(4)).toBeCloseTo(3.2, 10); // k1 region
		expect(at(8)).toBeCloseTo(6.4, 10); // the knee
		expect(at(10)).toBeCloseTo(8.4, 10); // k2 region: 6.4 + 1 x 2
		expect(at(11.6)).toBeCloseTo(10, 10); // cap arrives
		expect(at(20)).toBe(10); // and holds
	});

	test("fullFeeBps: cap distance honours the knee", () => {
		expect(fullFeeBps(p)).toBeCloseTo(11.6, 10);
		// a cap below the knee never reaches k2: F/k1 alone
		expect(fullFeeBps({ ...p, F: 5 })).toBeCloseTo(6.25, 10);
	});
});

describe("invariant fuzz (deterministic seeds)", () => {
	function fuzzRng(seed: number) {
		let a = seed >>> 0;
		return () => {
			a += 0x6d2b79f5;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	test("2000 random markets: no NaN marks, sane states, shares in range", () => {
		for (let iter = 0; iter < 2000; iter++) {
			const r = fuzzRng(iter + 1);
			const books = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, b) => {
				const center = 99 + r() * 2;
				const spread = r() < 0.2 ? 3 * r() : 0.3 * r();
				return {
					id: `A${b}`,
					levels: Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => ({
						i,
						price: +(center + (r() - 0.5) * 2 * spread).toFixed(3),
						side: (r() < 0.5 ? "bid" : "ask") as "bid" | "ask",
						size: r() < 0.1 ? 0 : Math.floor(r() * 60000),
					})),
				};
			});
			const lastM = r() < 0.3 ? null : 99 + r() * 2;
			const D = r() < 0.05 ? 0 : Math.floor(r() * 30000);
			const m = computeMark(books, { B: 4, D, Z: 20 }, lastM);
			if (m.state === "fresh") {
				expect(Number.isFinite(m.M as number)).toBe(true);
				expect(Number.isFinite(m.iBid as number)).toBe(true);
				expect(Number.isFinite(m.iAsk as number)).toBe(true);
				expect(m.edgeBid as number).toBeLessThanOrEqual(m.edgeAsk as number);
			}
			if (m.state === "held") expect(m.M).toBe(lastM as number);
			if (m.state === "none") expect(m.M).toBeNull();
			for (const map of [m.shareBid, m.shareAsk]) {
				for (const [, v] of map) {
					expect(Number.isFinite(v)).toBe(true);
					expect(v).toBeGreaterThanOrEqual(-1e-9);
					expect(v).toBeLessThanOrEqual(1 + 1e-9);
				}
			}
		}
	});
});
