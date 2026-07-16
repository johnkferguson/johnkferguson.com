import { describe, expect, test } from "bun:test";
import { type DemandParams, nEff, runEpoch, runEpochs } from "./demand";

// The hand-run reference: seed $1,000 (floor coincides), g=25, α=1/2, c=4.
const P: DemandParams = {
	seed: 1000,
	floor: 1000,
	gate: 25,
	alpha: 0.5,
	clampMult: 4,
};

describe("the hand-run day (reference computation)", () => {
	// Seven windows of $4,000 against D = $1,000.
	const r = runEpoch(1000, [[7, 4000]], P);

	test("accumulators: S1 = $28k, S2 = 112M", () => {
		expect(r.s1).toBe(28000);
		expect(r.s2).toBe(112_000_000);
	});

	test("gate: $28k ≥ 25 × $1,000 → the sample counts", () => {
		expect(r.gate).toBe(true);
	});

	test("sensor S2/S1 = $4,000 — no window count anywhere", () => {
		expect(r.sensor).toBe(4000);
	});

	test("rebase: √(4000/1000) = 2 → D closes at $2,000", () => {
		expect(r.rawStep).toBeCloseTo(2, 10);
		expect(r.step).toBeCloseTo(2, 10);
		expect(r.clamped).toBe(false);
		expect(r.dClose).toBeCloseTo(2000, 10);
	});
});

describe("convergence: close half the remaining doublings per day", () => {
	test("six steady days land on the closed form D_n = 4000 × 0.25^(1/2^n)", () => {
		// 500 windows per day so every day clears the gate at any D en route.
		const days = Array.from(
			{ length: 6 },
			() => [[500, 4000]] as [number, number][],
		);
		const rr = runEpochs(days, P);
		for (let n = 1; n <= 6; n++) {
			expect(rr[n - 1].dClose).toBeCloseTo(4000 * 0.25 ** (0.5 ** n), 6);
		}
		// the hand-run table's day 2 and day 6 values
		expect(rr[1].dClose).toBeCloseTo(2828.427, 2);
		expect(rr[5].dClose).toBeCloseTo(3914.29, 1);
	});
});

describe("the sensor is the dollar-weighted typical window", () => {
	// One $2,000 window and one $8,000 window: the per-window mean says
	// $5,000; the dollar-weighted answer is 0.2×2000 + 0.8×8000 = $6,800.
	const p: DemandParams = { ...P, seed: 400, floor: 400 };
	const r = runEpoch(
		400,
		[
			[1, 2000],
			[1, 8000],
		],
		p,
	);

	test("S2/S1 = $6,800", () => {
		expect(r.sensor).toBeCloseTo(6800, 10);
	});

	test("nEff = S1²/S2 ≈ 1.47, and nEff × sensor = S1 exactly", () => {
		const ne = nEff(r.s1, r.s2);
		expect(ne).toBeCloseTo(100_000_000 / 68_000_000, 10);
		expect(ne * (r.sensor ?? 0)).toBeCloseTo(r.s1, 8);
	});

	test("a 17× gap engages the clamp: step capped at c = 4", () => {
		expect(r.rawStep).toBeCloseTo(Math.sqrt(17), 10);
		expect(r.clamped).toBe(true);
		expect(r.step).toBe(4);
		expect(r.dClose).toBeCloseTo(1600, 10);
	});

	test("small windows dip the sensor only by their dollar share", () => {
		// 50 windows of $10 on the same day: $500 of $10,500 ≈ 4.8% of the
		// money, so the sensor dips about 4.8%, not to the per-window mean.
		const rd = runEpoch(
			400,
			[
				[1, 2000],
				[1, 8000],
				[50, 10],
			],
			p,
		);
		expect(rd.sensor).toBeCloseTo(68_005_000 / 10_500, 6);
		expect(rd.sensor).toBeCloseTo(6476.667, 2);
	});
});

describe("update hygiene: gate, clamp, floor", () => {
	test("one strange day moves D at most c×, whatever it contains", () => {
		// Forty $4,000 windows plus one $1M window: the sensor spikes to
		// ~$862.6k, the raw step says ×14.7, the clamp applies ×4.
		const r = runEpoch(
			4000,
			[
				[40, 4000],
				[1, 1_000_000],
			],
			P,
		);
		expect(r.sensor).toBeCloseTo(862_620.69, 1);
		expect(r.rawStep).toBeCloseTo(Math.sqrt(862_620.69 / 4000), 4);
		expect(r.clamped).toBe(true);
		expect(r.step).toBe(4);
		expect(r.dClose).toBeCloseTo(16000, 8);
	});

	test("gate: a day below g·D of flow freezes D — no update, no decay", () => {
		const p: DemandParams = { ...P, seed: 10000, floor: 10000 };
		const r = runEpoch(10000, [[8, 5000]], p);
		expect(r.gate).toBe(false);
		expect(r.sensor).toBeNull();
		expect(r.step).toBe(1);
		expect(r.dClose).toBe(10000);
	});

	test("floor is separate from seed: D can fall below the seed, never the floor", () => {
		const p: DemandParams = {
			seed: 2000,
			floor: 500,
			gate: 25,
			alpha: 0.5,
			clampMult: 10,
		};
		const r = runEpoch(2000, [[500, 100]], p);
		expect(r.gate).toBe(true); // $50k clears 25 × $2,000
		expect(r.sensor).toBeCloseTo(100, 10);
		// √(100/2000) ≈ 0.224 → $447, below the floor → held at $500
		expect(r.floored).toBe(true);
		expect(r.dClose).toBe(500);
		expect(r.dClose).toBeLessThan(p.seed);
	});

	test("empty epoch: nothing happens at all", () => {
		const r = runEpoch(2000, [], P);
		expect(r.s1).toBe(0);
		expect(r.gate).toBe(false);
		expect(r.dClose).toBe(2000);
	});
});

describe("the dials are parameters, not constants", () => {
	test("α = 1 jumps the full gap (subject to the clamp)", () => {
		const r = runEpoch(1000, [[500, 4000]], { ...P, alpha: 1 });
		expect(r.rawStep).toBeCloseTo(4, 10);
		expect(r.dClose).toBeCloseTo(4000, 8);
	});

	test("a looser clamp lets the same strange day move D further", () => {
		const r = runEpoch(
			4000,
			[
				[40, 4000],
				[1, 1_000_000],
			],
			{ ...P, clampMult: 20 },
		);
		expect(r.clamped).toBe(false);
		expect(r.dClose).toBeCloseTo(4000 * Math.sqrt(862_620.69 / 4000), 0);
	});

	test("a higher gate freezes a day the default would accept", () => {
		const r = runEpoch(1000, [[7, 4000]], { ...P, gate: 30 });
		expect(r.gate).toBe(false); // $28k < 30 × $1,000
		expect(r.dClose).toBe(1000);
	});
});
