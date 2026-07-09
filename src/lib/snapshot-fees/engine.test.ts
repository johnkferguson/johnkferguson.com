import { describe, expect, test } from "bun:test";
import { type BookLevel, computeModel, type FeeParams } from "./engine";

// Reference computation from the mechanism spec — "an implementation must
// reproduce these numbers exactly."
// Defaults: F=15, k=0.5, e=1, λ=0.5, S=4 (band M ± 2bp), T=$5,000.
const P: FeeParams = {
	S: 4,
	T: 5000,
	F: 15,
	slope: 0.5,
	expo: 1,
	lambda: 0.5,
	comp: 0,
};

const book: BookLevel[] = [
	{ i: 0, price: 99.97, side: "bid", size: 3000 },
	{ i: 1, price: 99.99, side: "bid", size: 3000 },
	{ i: 2, price: 100.01, side: "ask", size: 3000 },
	{ i: 3, price: 100.03, side: "ask", size: 1000 },
];

describe("spec reference computation", () => {
	const m = computeModel(book, P, 100);
	const bk = (i: number) => {
		const b = m.levels.find((l) => l.i === i)?.bk;
		if (!b) throw new Error(`no breakdown for level ${i}`);
		return b;
	};

	test("impact walks", () => {
		// impact bid = (3,000×99.99 + 2,000×99.97)/5,000
		expect(m.iBid).toBeCloseTo(99.982, 10);
		// ask side holds less than T — walk what's there:
		// (3,000×100.01 + 1,000×100.03)/4,000
		expect(m.iAsk).toBeCloseTo(100.015, 10);
	});

	test("Mark and band edges", () => {
		expect(m.M).toBeCloseTo(99.9985, 10);
		expect(m.edgeBid).toBeCloseTo(99.9785, 10);
		expect(m.edgeAsk).toBeCloseTo(100.0185, 10);
		expect(m.frozen).toBe(false);
	});

	test("stamps", () => {
		expect(bk(1).own).toBe(0); // bid 99.99 — in band
		expect(bk(2).own).toBe(0); // ask 100.01 — in band
		expect(bk(0).own).toBeCloseTo(0.425, 10); // bid 99.97 — d = 0.85bp
		expect(bk(3).own).toBeCloseTo(0.575, 10); // ask 100.03 — d = 1.15bp
	});

	test("inside bid pairs fully at stamp 0 → fee 0", () => {
		const b = bk(1);
		expect(b.pairing).toBe(0);
		expect(b.final).toBe(0);
	});

	test("outer bid: spillover leaves $1,000 coverage, fee 10.4042bp → $3.12", () => {
		const b = bk(0);
		// $3,000 of ask stock already claimed by the better-priced bid
		expect(b.claimedBefore).toBe(3000);
		// pairing = (1,000×0.575 + 2,000×15)/3,000
		expect(b.pairing).toBeCloseTo(10.191666666, 8);
		expect(b.combined).toBeCloseTo(10.404166666, 8);
		const dollars = (b.final / 10000) * b.q;
		expect(dollars).toBeCloseTo(3.12, 2);
		// shortfall = fee / F — the directional fraction of the fill
		expect(b.final / P.F).toBeCloseTo(0.694, 3);
	});
});

describe("anchors and invariants", () => {
	test("taker anchor: no opposite quotes → fee = F, at every λ", () => {
		for (const lambda of [0, 0.25, 0.5, 1]) {
			const m = computeModel(
				[{ i: 0, price: 99.99, side: "bid", size: 5000 }],
				{ ...P, lambda },
				100,
			);
			const b = m.levels[0].bk;
			expect(b?.pairing).toBe(P.F);
			expect(b?.final).toBe(P.F);
		}
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

	test("junk-coverage anchor: far coverage is worth exactly nothing", () => {
		// A small real ask pins the band near 100; the junk ask sits 40bp out —
		// past the cap distance (F/k)^(1/e) = 30bp and past the Mark walk's
		// 8×S visibility, so it can neither bend M nor stamp below F.
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
		const junkStamp = withJunk.stampOf(100.4, "ask");
		expect(junkStamp).toBe(P.F);
		// covered-by-junk dollars pay F, same as uncovered dollars:
		// the bid's fee is identical with or without the fake coverage
		const feeWith = withJunk.levels[0].bk?.final;
		const feeWithout = without.levels[0].bk?.final;
		expect(feeWith).toBeCloseTo(feeWithout ?? Number.NaN, 10);
	});

	test("single-account caveat: a LONE far ask bends M toward itself", () => {
		// With no real ask pinning the band, the junk quote IS the side's best:
		// it feeds the Mark walk, drags M halfway toward itself, and its own
		// stamp lands below the cap. In a multi-maker market M aggregates all
		// eligible books, so one account's junk barely moves it — this is why
		// the dual-maker lab matters, and why the spec's Mark-eligibility rule
		// (demonstrated two-sided size only) needs its own treatment.
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
			for (const lambda of [0, 0.5, 1]) {
				for (const slope of [0.25, 1, 3]) {
					const m = computeModel(book, { ...P, S, lambda, slope }, 100);
					for (const lv of m.levels) {
						if (!lv.bk) continue;
						expect(lv.bk.final).toBeGreaterThanOrEqual(0);
						expect(lv.bk.final).toBeLessThanOrEqual(P.F);
					}
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

	test("allocation total is conserved: coverage + unpaired = size", () => {
		const m = computeModel(book, P, 100);
		for (const lv of m.levels) {
			if (!lv.bk) continue;
			const covered = lv.bk.pairs.reduce((s, pr) => s + pr.matched, 0);
			expect(covered + lv.bk.unpaired).toBeCloseTo(lv.size, 6);
		}
	});
});
