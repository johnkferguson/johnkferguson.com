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

/** Fees for one account's book, judged against a given Mark. */
export interface AccountFees {
	levels: FeeLevel[];
	edgeBid: number;
	edgeAsk: number;
	stampOf: (price: number, side: "bid" | "ask") => number;
}

/**
 * Stamps, joint pairing allocation (spillover), and per-dollar worse-of fees
 * for one account's book against a given M. The Mark may be communal (multi
 * maker) or the account's own (single-maker lab).
 */
export function computeAccountFees(
	book: BookLevel[],
	p: FeeParams,
	M: number,
): AccountFees {
	const { S, F, slope, expo, comp } = p;
	const bids = book
		.filter((l) => l.side === "bid")
		.sort((a, b) => b.price - a.price);
	const asks = book
		.filter((l) => l.side === "ask")
		.sort((a, b) => a.price - b.price);

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
	return { levels, edgeBid, edgeAsk, stampOf };
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
	const { S, T } = p;
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

	const af = computeAccountFees(book, p, M);
	const bidTotal = book.reduce(
		(s, l) => s + (l.side === "bid" ? l.size : 0),
		0,
	);
	const askTotal = book.reduce(
		(s, l) => s + (l.side === "ask" ? l.size : 0),
		0,
	);
	return {
		levels: af.levels,
		M,
		iBid,
		iAsk,
		edgeBid: af.edgeBid,
		edgeAsk: af.edgeAsk,
		frozen,
		bidTotal,
		askTotal,
		markUsed,
		stampOf: af.stampOf,
	};
}

// ————————————————————————————————————————————————————————————————
// Multi-maker Mark
// ————————————————————————————————————————————————————————————————

export interface MakerBook {
	id: string;
	levels: BookLevel[];
}

export interface MultiMark {
	M: number;
	iBid: number | null;
	iAsk: number | null;
	frozen: boolean;
	edgeBid: number;
	edgeAsk: number;
	/** Walk consumption per account: id -> (level i -> $). */
	used: Map<string, Map<number, number>>;
	/** Each account's share of the walked dollars, per side (0..1). */
	shareBid: Map<string, number>;
	shareAsk: Map<string, number>;
	/** Mark-eligible size per account: id -> (level i -> $). */
	eligible: Map<string, Map<number, number>>;
}

/**
 * The communal Mark. Only demonstrated two-sided size is eligible: per
 * account and side, quotes count up to the account's two-sided overlap
 * (min of its in-range bid and ask totals), allocated best-first, and only
 * within 8×S of that side's market-wide best. The T-walk then consumes the
 * aggregated eligible book best-first, pro-rata across accounts at equal
 * prices. One-sided size has no vote; far size has no vote.
 */
export function computeMultiMark(
	books: MakerBook[],
	p: { S: number; T: number },
	fallbackM: number,
): MultiMark {
	const { S, T } = p;
	const lim = 8 * S * BP + 1e-9;

	let bestBid = Number.NEGATIVE_INFINITY;
	let bestAsk = Number.POSITIVE_INFINITY;
	for (const b of books) {
		for (const l of b.levels) {
			if (l.size <= 0) continue;
			if (l.side === "bid" && l.price > bestBid) bestBid = l.price;
			if (l.side === "ask" && l.price < bestAsk) bestAsk = l.price;
		}
	}

	interface ElQuote {
		id: string;
		i: number;
		price: number;
		el: number;
	}
	const eligible = new Map<string, Map<number, number>>();
	const elBids: ElQuote[] = [];
	const elAsks: ElQuote[] = [];
	for (const b of books) {
		const em = new Map<number, number>();
		eligible.set(b.id, em);
		const bids = b.levels
			.filter((l) => l.side === "bid" && l.size > 0 && bestBid - l.price <= lim)
			.sort((a, c) => c.price - a.price);
		const asks = b.levels
			.filter((l) => l.side === "ask" && l.size > 0 && l.price - bestAsk <= lim)
			.sort((a, c) => a.price - c.price);
		const overlap = Math.min(
			bids.reduce((s, l) => s + l.size, 0),
			asks.reduce((s, l) => s + l.size, 0),
		);
		let cap = overlap;
		for (const l of bids) {
			if (cap <= 1e-9) break;
			const take = Math.min(cap, l.size);
			em.set(l.i, take);
			elBids.push({ id: b.id, i: l.i, price: l.price, el: take });
			cap -= take;
		}
		cap = overlap;
		for (const l of asks) {
			if (cap <= 1e-9) break;
			const take = Math.min(cap, l.size);
			em.set(l.i, take);
			elAsks.push({ id: b.id, i: l.i, price: l.price, el: take });
			cap -= take;
		}
	}

	const used = new Map<string, Map<number, number>>();
	for (const b of books) used.set(b.id, new Map());
	const useTotals = {
		bid: new Map<string, number>(),
		ask: new Map<string, number>(),
	};

	const walkSide = (els: ElQuote[], side: "bid" | "ask") => {
		els.sort((a, b) =>
			side === "bid" ? b.price - a.price : a.price - b.price,
		);
		let rem = T;
		let cost = 0;
		let tot = 0;
		let k = 0;
		while (k < els.length && rem > 1e-9) {
			let j = k;
			let grp = 0;
			while (j < els.length && Math.abs(els[j].price - els[k].price) < 1e-9) {
				grp += els[j].el;
				j += 1;
			}
			const take = Math.min(rem, grp);
			for (let q = k; q < j; q++) {
				const part = take * (els[q].el / grp);
				if (part > 1e-9) {
					const um = used.get(els[q].id);
					if (um) um.set(els[q].i, (um.get(els[q].i) ?? 0) + part);
					const tm = useTotals[side];
					tm.set(els[q].id, (tm.get(els[q].id) ?? 0) + part);
				}
			}
			cost += take * els[k].price;
			tot += take;
			rem -= take;
			k = j;
		}
		return { price: tot > 0 ? cost / tot : null, tot };
	};

	const wBid = walkSide(elBids, "bid");
	const wAsk = walkSide(elAsks, "ask");
	let M: number;
	let frozen = false;
	if (wBid.price != null && wAsk.price != null)
		M = (wBid.price + wAsk.price) / 2;
	else {
		M = fallbackM;
		frozen = true;
	}
	const half = (S / 2) * BP;

	const share = (tm: Map<string, number>, tot: number) => {
		const out = new Map<string, number>();
		for (const b of books)
			out.set(b.id, tot > 0 ? (tm.get(b.id) ?? 0) / tot : 0);
		return out;
	};

	return {
		M,
		iBid: wBid.price,
		iAsk: wAsk.price,
		frozen,
		edgeBid: M - half,
		edgeAsk: M + half,
		used,
		shareBid: share(useTotals.bid, wBid.tot),
		shareAsk: share(useTotals.ask, wAsk.tot),
		eligible,
	};
}
