import { describe, expect, test } from "bun:test";
import { type BookLevel, computeModel, type FeeParams } from "./engine";

// Reference computation from the mechanism spec (worse-of revision) — "an
// implementation must reproduce these numbers exactly."
// Defaults: F=15, k=0.5, e=1, S=4 (band M ± 2bp), T=$5,000.
// Fee rule: each matched dollar pays max(own stamp, partner stamp);
// unbacked dollars pay F. λ and the combine step no longer exist.
const P: FeeParams = {
	S: 4,
	T: 5000,
	F: 15,
	slope: 0.5,
	expo: 1,
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

	test("outer ask: fully matched, worse leg 0.5bp", () => {
		const b = bk(3);
		expect(b.unpaired).toBe(0);
		expect(b.final).toBeCloseTo(0.5, 10);
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

	test("worse-leg identity: a symmetric matched book pays one leg, not two", () => {
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

	test("your scenario: backing at-or-inside your level costs nothing extra", () => {
		// bid 1bp out (own 0.5); all asks in the band (partner stamp 0):
		// every matched dollar pays max(0.5, 0) = own only.
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

	test("junk-coverage anchor: far coverage is worth exactly nothing", () => {
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
		for (const S of [1, 4, 10]) {
			for (const slope of [0.25, 0.75, 1, 3]) {
				const m = computeModel(book, { ...P, S, slope }, 100);
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

	test("allocation total is conserved: matched + unbacked = size", () => {
		const m = computeModel(book, P, 100);
		for (const lv of m.levels) {
			if (!lv.bk) continue;
			const covered = lv.bk.pairs.reduce((s, pr) => s + pr.matched, 0);
			expect(covered + lv.bk.unpaired).toBeCloseTo(lv.size, 6);
		}
	});
});
