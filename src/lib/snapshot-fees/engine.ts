/**
 * Snapshot fees — pure mechanism engine.
 *
 * Framework-free so every lab (single-maker, multi-maker, …) renders the same
 * mechanism, and so the engine can be unit-tested against the spec's
 * reference computation (see engine.test.ts).
 *
 * The Mark pipeline (computeMark) is shared by every lab: two-pass anchoring,
 * matched-only eligibility, and boundary fill at the window edge. A single
 * account is just a one-book market.
 *
 * Conventions: prices near $100, so 1bp = $0.01. Floating-point is fine here —
 * an on-chain implementation would use fixed-point integers, but the labs only
 * need visual fidelity plus exactness on the reference vectors.
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
	/** Inner band width B, in bps — the band is drawn M ± B/2. */
	B: number;
	/** Typical trade — the measuring size for the Mark walk, in $. */
	T: number;
	/** Fee cap / taker rate, in bps. */
	F: number;
	/**
	 * Maker Zone Z — absolute working radius, in bps. Governs the Mark's
	 * eligibility range, walk truncation, boundary-fill price, and the
	 * stamp knee. Validity: Z ≥ B.
	 */
	Z: number;
	/** Stamp slope k₁ — fee bps per bp beyond the band edge, inside the zone. */
	slope: number;
	/** Stamp slope k₂ — fee bps per bp beyond the zone edge (the knee). */
	slope2: number;
	/** Inside compensation max, bps (parked module — reward channel). */
	comp: number;
}

/** $ per basis point at the $100 reference price. */
export const BP = 0.01;

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
	const { B, F, Z, slope, slope2, comp } = p;
	const bids = book
		.filter((l) => l.side === "bid")
		.sort((a, b) => b.price - a.price);
	const asks = book
		.filter((l) => l.side === "ask")
		.sort((a, b) => a.price - b.price);

	const half = (B / 2) * BP;
	const edgeBid = M - half;
	const edgeAsk = M + half;

	// Bracketed stamp: the first Z bps of distance are priced at k₁, the
	// excess at k₂, capped at F.
	const stampOf = (price: number, side: "bid" | "ask"): number => {
		const d = side === "ask" ? price - edgeAsk : edgeBid - price;
		const bps = Math.max(0, d / BP);
		const raw = slope * Math.min(bps, Z) + slope2 * Math.max(0, bps - Z);
		return Math.min(F, raw);
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
		const insideComp = comp > 0 ? comp * Math.max(0, 1 - distBp / (B / 2)) : 0;
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

// ————————————————————————————————————————————————————————————————
// The Mark
// ————————————————————————————————————————————————————————————————

export interface MakerBook {
	id: string;
	levels: BookLevel[];
}

export interface MarkShort {
	/** Dollars the walk could not source from eligible size. */
	missing: number;
	/** Where those dollars were priced: the side's anchor ± Z. */
	price: number;
}

export interface MultiMark {
	M: number;
	iBid: number | null;
	iAsk: number | null;
	frozen: boolean;
	edgeBid: number;
	edgeAsk: number;
	/** iAsk − iBid, the thinness thermometer. Null while held. */
	impactSpread: number | null;
	/** Boundary fill per side, when the eligible ladder held less than T. */
	shortBid: MarkShort | null;
	shortAsk: MarkShort | null;
	/** Walk consumption per account: id -> (level i -> $). */
	used: Map<string, Map<number, number>>;
	/** Each account's share of the walked dollars, per side (0..1). */
	shareBid: Map<string, number>;
	shareAsk: Map<string, number>;
	/** Mark-eligible size per account: id -> (level i -> $). */
	eligible: Map<string, Map<number, number>>;
}

/**
 * The Mark. Only matched (demonstrated two-sided) size votes: per account
 * and side, quotes count up to the account's overlap — min(in-range bid $,
 * in-range ask $) — allocated best-first, where in range means within Z of
 * that side's anchor.
 *
 * Anchoring is exactly two passes: pass 1 anchors each side at the best
 * quote among raw two-sided accounts (any paired size, no range condition);
 * pass 2 re-anchors at the best pass-1-eligible quote and recomputes
 * eligibility once — a one-sided touch order can never position the window.
 * No pass-1 eligible size on a side → M held at the fallback.
 *
 * The T-walk consumes the pooled eligible ladder best-first, pro-rata across
 * accounts at equal prices; if the ladder holds less than T, the missing
 * dollars are priced at the anchor ± Z (boundary fill). Because every
 * account's eligible size is equal on both sides by construction, the
 * eligible book is dollar-symmetric: shortfalls are always equal, so raw
 * size imbalance never tilts M. Boundary fill only interpolates —
 * M = c·(walked mid) + (1−c)·(anchor mid), c = eligible/T — and inflates
 * the exported impact spread, the health signal. Placement is the only vote.
 */
export function computeMark(
	books: MakerBook[],
	p: { B: number; T: number; Z: number },
	fallbackM: number,
): MultiMark {
	const { B, T, Z } = p;
	const zD = Z * BP;
	const half = (B / 2) * BP;

	const mapBy = <V>(mk: () => V): Map<string, V> => {
		const m = new Map<string, V>();
		for (const b of books) m.set(b.id, mk());
		return m;
	};
	const held = (): MultiMark => ({
		M: fallbackM,
		iBid: null,
		iAsk: null,
		frozen: true,
		edgeBid: fallbackM - half,
		edgeAsk: fallbackM + half,
		impactSpread: null,
		shortBid: null,
		shortAsk: null,
		used: mapBy(() => new Map<number, number>()),
		shareBid: mapBy(() => 0),
		shareAsk: mapBy(() => 0),
		eligible: mapBy(() => new Map<number, number>()),
	});

	// —— Pass 1 anchors: best quote among raw two-sided accounts ——
	let a1Bid = Number.NEGATIVE_INFINITY;
	let a1Ask = Number.POSITIVE_INFINITY;
	for (const b of books) {
		let bb = Number.NEGATIVE_INFINITY;
		let ba = Number.POSITIVE_INFINITY;
		for (const l of b.levels) {
			if (l.size <= 0) continue;
			if (l.side === "bid" && l.price > bb) bb = l.price;
			if (l.side === "ask" && l.price < ba) ba = l.price;
		}
		if (bb !== Number.NEGATIVE_INFINITY && ba !== Number.POSITIVE_INFINITY) {
			if (bb > a1Bid) a1Bid = bb;
			if (ba < a1Ask) a1Ask = ba;
		}
	}
	if (a1Bid === Number.NEGATIVE_INFINITY || a1Ask === Number.POSITIVE_INFINITY)
		return held();

	interface ElQuote {
		id: string;
		i: number;
		price: number;
		el: number;
	}
	const eligibilityOf = (anchorBid: number, anchorAsk: number) => {
		const eligible = mapBy(() => new Map<number, number>());
		const elBids: ElQuote[] = [];
		const elAsks: ElQuote[] = [];
		for (const b of books) {
			const em = eligible.get(b.id);
			if (!em) continue;
			const bids = b.levels
				.filter(
					(l) =>
						l.side === "bid" && l.size > 0 && anchorBid - l.price <= zD + 1e-9,
				)
				.sort((a, c) => c.price - a.price);
			const asks = b.levels
				.filter(
					(l) =>
						l.side === "ask" && l.size > 0 && l.price - anchorAsk <= zD + 1e-9,
				)
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
		return { eligible, elBids, elAsks };
	};

	// —— Pass 1 eligibility, then pass 2: re-anchor on eligible size ——
	let pass = eligibilityOf(a1Bid, a1Ask);
	if (!pass.elBids.length || !pass.elAsks.length) return held();
	let a2Bid = Number.NEGATIVE_INFINITY;
	let a2Ask = Number.POSITIVE_INFINITY;
	for (const q of pass.elBids) if (q.price > a2Bid) a2Bid = q.price;
	for (const q of pass.elAsks) if (q.price < a2Ask) a2Ask = q.price;
	pass = eligibilityOf(a2Bid, a2Ask);
	if (!pass.elBids.length || !pass.elAsks.length) return held();

	// —— The impact walks, with boundary fill at anchor ± W ——
	const used = mapBy(() => new Map<number, number>());
	const useTotals = {
		bid: new Map<string, number>(),
		ask: new Map<string, number>(),
	};

	const walkSide = (els: ElQuote[], side: "bid" | "ask", boundary: number) => {
		els.sort((a, b) =>
			side === "bid" ? b.price - a.price : a.price - b.price,
		);
		let rem = T;
		let cost = 0;
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
			rem -= take;
			k = j;
		}
		let short: MarkShort | null = null;
		if (rem > 1e-9) {
			cost += rem * boundary;
			short = { missing: rem, price: boundary };
		}
		return { price: cost / T, walked: T - (short?.missing ?? 0), short };
	};

	const wBid = walkSide(pass.elBids, "bid", a2Bid - zD);
	const wAsk = walkSide(pass.elAsks, "ask", a2Ask + zD);
	const M = (wBid.price + wAsk.price) / 2;

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
		frozen: false,
		edgeBid: M - half,
		edgeAsk: M + half,
		impactSpread: wAsk.price - wBid.price,
		shortBid: wBid.short,
		shortAsk: wAsk.short,
		used,
		shareBid: share(useTotals.bid, wBid.walked),
		shareAsk: share(useTotals.ask, wAsk.walked),
		eligible: pass.eligible,
	};
}

export interface MarketModel {
	levels: FeeLevel[];
	M: number;
	iBid: number | null;
	iAsk: number | null;
	edgeBid: number;
	edgeAsk: number;
	/** True when no eligible walk was possible and M fell back to `fallbackM`. */
	frozen: boolean;
	/** iAsk − iBid, the thinness thermometer. Null while held. */
	impactSpread: number | null;
	/** Boundary fill per side, when the eligible ladder held less than T. */
	shortBid: MarkShort | null;
	shortAsk: MarkShort | null;
	bidTotal: number;
	askTotal: number;
	/** Size the Mark walk consumed, keyed by level identity. */
	markUsed: Map<number, number>;
	stampOf: (price: number, side: "bid" | "ask") => number;
}

/**
 * Run the full window pipeline on one account's book, as a one-book market:
 * eligibility → impact walks with boundary fill → M → band → stamps →
 * joint pairing allocation (spillover) → combined fee.
 *
 * Every level's breakdown answers: if the sweep reached this level and it
 * fully filled, what rate would it pay?
 */
export function computeModel(
	book: BookLevel[],
	p: FeeParams,
	fallbackM: number,
): MarketModel {
	const { B, T, Z } = p;
	const mm = computeMark(
		[{ id: "solo", levels: book }],
		{ B, T, Z },
		fallbackM,
	);
	const af = computeAccountFees(book, p, mm.M);
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
		M: mm.M,
		iBid: mm.iBid,
		iAsk: mm.iAsk,
		edgeBid: af.edgeBid,
		edgeAsk: af.edgeAsk,
		frozen: mm.frozen,
		impactSpread: mm.impactSpread,
		shortBid: mm.shortBid,
		shortAsk: mm.shortAsk,
		bidTotal,
		askTotal,
		markUsed: mm.used.get("solo") ?? new Map(),
		stampOf: af.stampOf,
	};
}

/** Bps beyond the band edge at which the stamp reaches the cap F. */
export function stampCapBps(p: {
	F: number;
	Z: number;
	slope: number;
	slope2: number;
}): number {
	const { F, Z, slope, slope2 } = p;
	return F <= slope * Z ? F / slope : Z + (F - slope * Z) / slope2;
}
