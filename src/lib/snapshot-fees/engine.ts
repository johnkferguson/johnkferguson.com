/**
 * Snapshot fees — pure mechanism engine.
 *
 * Framework-free so every lab (single-maker, dual-maker, …) renders the same
 * mechanism, and so the engine can be unit-tested against the spec's
 * reference computation (see engine.test.ts).
 *
 * Conventions: prices near $100, so 1bp = $0.01. Floating-point is fine here —
 * an on-chain implementation would use fixed-point integers, but the labs only
 * need visual fidelity plus exactness on the reference vector.
 */

export type Side = "bid" | "ask" | "mid";

export interface BookLevel {
	/** Stable identity for the level (labs use the grid index). */
	i: number;
	price: number;
	side: Side;
	size: number;
}

export interface FeeParams {
	/** Spread standard — width of the free band, in bps. */
	S: number;
	/** Typical trade — the measuring size for the Mark walk, in $. */
	T: number;
	/** Fee cap / taker rate, in bps. */
	F: number;
	/** Stamp slope k — fee bps per bp of placement beyond the band edge. */
	slope: number;
	/** Stamp curvature e. */
	expo: number;
	/** Inside compensation max, bps (parked module — reward channel). */
	comp: number;
}

/** $ per basis point at the $100 reference price. */
export const BP = 0.01;

export interface ImpactWalkResult {
	/** Volume-weighted price of the walk, or null if the side is empty. */
	price: number | null;
	/** Size the walk consumed, keyed by level identity `i`. */
	used: Map<number, number>;
}

/**
 * Volume-weighted price to trade `size` into `levels` (must be sorted
 * best-first), ignoring quotes more than 8×S behind the side's best.
 * If the side holds less than `size`, walks what's there.
 */
export function impactWalk(
	levels: BookLevel[],
	size: number,
	S: number,
): ImpactWalkResult {
	const live = levels.filter((l) => l.size > 0);
	if (!live.length) return { price: null, used: new Map() };
	const best = live[0].price;
	const lim = 8 * S * BP + 1e-9;
	let rem = size;
	let cost = 0;
	let usedTotal = 0;
	const used = new Map<number, number>();
	for (const l of live) {
		if (Math.abs(l.price - best) > lim) break;
		const take = Math.min(rem, l.size);
		cost += take * l.price;
		usedTotal += take;
		rem -= take;
		used.set(l.i, take);
		if (rem <= 1e-9) break;
	}
	return { price: usedTotal > 0 ? cost / usedTotal : null, used };
}

export interface CoveragePair {
	price: number;
	matched: number;
	stamp: number;
}

export interface Allocation {
	pairs: CoveragePair[];
	unpaired: number;
	/** Opposite-side dollars already consumed by better-priced same-side levels. */
	claimedBefore: number;
}

export interface FeeBreakdown {
	/** This level's own placement stamp, bps. */
	own: number;
	pairs: CoveragePair[];
	unpaired: number;
	claimedBefore: number;
	/** Per-dollar worse-of rate: matched $ pay max(own, partner), unbacked pay F. */
	pairing: number;
	/** min(F, pairing) — the cap is decorative; every per-dollar term is ≤ F. */
	combined: number;
	/** Inside compensation, bps (parked module). */
	insideComp: number;
	/** Final fee rate, bps. */
	final: number;
	/** Level size, $. */
	q: number;
}

export interface FeeLevel extends BookLevel {
	bk: FeeBreakdown | null;
}

export interface MarketModel {
	levels: FeeLevel[];
	M: number;
	iBid: number | null;
	iAsk: number | null;
	edgeBid: number;
	edgeAsk: number;
	/** True when a side was empty and M fell back to `fallbackM`. */
	frozen: boolean;
	bidTotal: number;
	askTotal: number;
	/** Size the Mark walk consumed, keyed by level identity. */
	markUsed: Map<number, number>;
	stampOf: (price: number, side: "bid" | "ask") => number;
}

/**
 * Run the full window pipeline on one account's book:
 * Mark → band → stamps → joint pairing allocation (spillover) → combined fee.
 *
 * Every level's breakdown answers: if the sweep reached this level and it
 * fully filled, what rate would it pay?
 */
export function computeModel(
	book: BookLevel[],
	p: FeeParams,
	fallbackM: number,
): MarketModel {
	const { S, T, F, slope, expo, comp } = p;
	const bids = book
		.filter((l) => l.side === "bid")
		.sort((a, b) => b.price - a.price);
	const asks = book
		.filter((l) => l.side === "ask")
		.sort((a, b) => a.price - b.price);

	const wBid = impactWalk(bids, T, S);
	const wAsk = impactWalk(asks, T, S);
	const iBid = wBid.price;
	const iAsk = wAsk.price;
	const markUsed = new Map([...wBid.used, ...wAsk.used]);
	let M: number;
	let frozen = false;
	if (iBid != null && iAsk != null) M = (iBid + iAsk) / 2;
	else {
		M = fallbackM;
		frozen = true;
	}

	const half = (S / 2) * BP;
	const edgeBid = M - half;
	const edgeAsk = M + half;

	const stampOf = (price: number, side: "bid" | "ask"): number => {
		const d = side === "ask" ? price - edgeAsk : edgeBid - price;
		const bps = Math.max(0, d / BP);
		return Math.min(F, slope * bps ** expo);
	};

	// Joint allocation: opposite-side stock is CONSUMED across same-side
	// levels, inside-first — uncovered size spills outward.
	const allocate = (
		same: BookLevel[],
		opp: BookLevel[],
	): Map<number, Allocation> => {
		const map = new Map<number, Allocation>();
		let oi = 0;
		let oRem = opp.length ? opp[oi].size : 0;
		let claimed = 0;
		for (const lv of same) {
			const entry: Allocation = {
				pairs: [],
				unpaired: 0,
				claimedBefore: claimed,
			};
			let rem = lv.size;
			while (rem > 1e-9 && oi < opp.length) {
				if (opp[oi].size <= 0 || oRem <= 1e-9) {
					oi += 1;
					oRem = oi < opp.length ? opp[oi].size : 0;
					continue;
				}
				const m = Math.min(rem, oRem);
				entry.pairs.push({
					price: opp[oi].price,
					matched: m,
					stamp: stampOf(opp[oi].price, opp[oi].side as "bid" | "ask"),
				});
				rem -= m;
				oRem -= m;
				claimed += m;
			}
			entry.unpaired = rem;
			map.set(lv.i, entry);
		}
		return map;
	};
	const bidAlloc = allocate(bids, asks);
	const askAlloc = allocate(asks, bids);

	const breakdown = (lv: BookLevel): FeeBreakdown | null => {
		if (lv.size <= 0 || lv.side === "mid") return null;
		const own = stampOf(lv.price, lv.side);
		const a = (lv.side === "bid" ? bidAlloc : askAlloc).get(lv.i) ?? {
			pairs: [],
			unpaired: lv.size,
			claimedBefore: 0,
		};
		const q = lv.size;
		// Per-dollar worse-of: each matched dollar pays the worse of its two
		// legs — this order's own stamp or its partner's — and unbacked
		// dollars pay F. A round trip is as good as its worse leg.
		const pairing =
			(a.pairs.reduce((s, pr) => s + pr.matched * Math.max(own, pr.stamp), 0) +
				a.unpaired * F) /
			q;
		const combined = Math.min(F, pairing);
		const distBp = Math.abs(lv.price - M) / BP;
		const insideComp = comp > 0 ? comp * Math.max(0, 1 - distBp / (S / 2)) : 0;
		const final = combined - insideComp;
		return {
			own,
			pairs: a.pairs,
			unpaired: a.unpaired,
			claimedBefore: a.claimedBefore,
			pairing,
			combined,
			insideComp,
			final,
			q,
		};
	};

	const levels: FeeLevel[] = book.map((lv) => ({ ...lv, bk: breakdown(lv) }));
	const bidTotal = book.reduce(
		(s, l) => s + (l.side === "bid" ? l.size : 0),
		0,
	);
	const askTotal = book.reduce(
		(s, l) => s + (l.side === "ask" ? l.size : 0),
		0,
	);
	return {
		levels,
		M,
		iBid,
		iAsk,
		edgeBid,
		edgeAsk,
		frozen,
		bidTotal,
		askTotal,
		markUsed,
		stampOf,
	};
}
