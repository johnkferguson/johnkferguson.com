/**
 * Snapshot fees — pure mechanism engine.
 *
 * Framework-free so every lab (single-maker, multi-maker, …) renders the same
 * mechanism, and so the engine can be unit-tested against the spec's
 * reference computation (see engine.test.ts).
 *
 * The Mark pipeline (computeMark) is shared by every lab: every two-sided
 * account seeds a candidate eligible book (two anchoring passes each), a
 * span check drops incoherent candidates, the largest candidate wins, and
 * the impact walks run on the winner with boundary fill at the window edge.
 * A single account is just a one-book market.
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
	/** Typical demand D — the measuring size for the Mark walk, in $. */
	D: number;
	/** Fee cap / taker rate, in bps. */
	F: number;
	/**
	 * Maker Zone Z — working radius past the band edge, in bps. The stamp
	 * knee sits Z beyond the band edge; the Mark's eligibility range, walk
	 * truncation, and boundary-fill price all reach Z + B/2 from the
	 * anchors, so both layers cover the same working width (span B + 2Z).
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

/** One leg of pairing: the partner level, the dollars paired with it, its stamp. */
export interface PairLeg {
	price: number;
	paired: number;
	stamp: number;
}

export interface Allocation {
	pairs: PairLeg[];
	unpaired: number;
	/** Opposite-side dollars already consumed by better-priced same-side levels. */
	claimedBefore: number;
}

export interface FeeBreakdown {
	/** This level's own placement stamp, bps. */
	own: number;
	pairs: PairLeg[];
	unpaired: number;
	claimedBefore: number;
	/** Per-dollar worse-of rate: paired $ pay max(own, partner), directional pay F. */
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
	/** Band edges; null in the no-mark state. */
	edgeBid: number | null;
	edgeAsk: number | null;
	stampOf: (price: number, side: "bid" | "ask") => number;
}

/**
 * Stamps, joint pairing allocation (spillover), and per-dollar worse-of fees
 * for one account's book against a given M. The Mark may be communal (multi
 * maker) or the account's own (single-maker lab). With no mark (M null — the
 * pre-first-mark state) there is nothing to measure placement against, so
 * every stamp is the cap and every dollar pays F.
 */
export function computeAccountFees(
	book: BookLevel[],
	p: FeeParams,
	M: number | null,
): AccountFees {
	const { B, F, Z, slope, slope2, comp } = p;
	const bids = book
		.filter((l) => l.side === "bid")
		.sort((a, b) => b.price - a.price);
	const asks = book
		.filter((l) => l.side === "ask")
		.sort((a, b) => a.price - b.price);

	const half = (B / 2) * BP;
	const edgeBid = M == null ? null : M - half;
	const edgeAsk = M == null ? null : M + half;

	// Bracketed stamp via the shared curve: distance beyond the band edge
	// plus B/2 is distance from M. No mark → no distance to measure → F.
	const stampOf = (price: number, side: "bid" | "ask"): number => {
		if (edgeBid == null || edgeAsk == null) return F;
		const d = side === "ask" ? price - edgeAsk : edgeBid - price;
		return baseFeeBps(Math.max(0, d / BP) + B / 2, { B, F, Z, slope, slope2 });
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
					paired: m,
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
		// Per-dollar worse-of: each paired dollar pays the worse of its two
		// legs — this order's own stamp or its partner's — and directional
		// dollars pay F. A round trip is as good as its worse leg.
		const pairing =
			(a.pairs.reduce((s, pr) => s + pr.paired * Math.max(own, pr.stamp), 0) +
				a.unpaired * F) /
			q;
		const combined = Math.min(F, pairing);
		const distBp =
			M == null ? Number.POSITIVE_INFINITY : Math.abs(lv.price - M) / BP;
		const insideComp =
			comp > 0 && Number.isFinite(distBp)
				? comp * Math.max(0, 1 - distBp / (B / 2))
				: 0;
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

/**
 * fresh — a candidate eligible book won this window and M was measured from it.
 * held  — a mark existed, but this window produced no winner (no valid
 *         candidate, or a strict tie between disjoint candidates); the last
 *         M carries with this flag.
 * none  — no mark has ever formed (launch): nothing to measure, nothing to
 *         carry. Fees stamp at the cap until the first candidate appears.
 */
export type MarkState = "fresh" | "held" | "none";

export interface MarkShort {
	/** Dollars the walk could not source from eligible size. */
	missing: number;
	/** Where those dollars were priced: the side's anchor ± (Z + B/2). */
	price: number;
}

export interface MultiMark {
	/** The mark; null only in the no-mark ("none") state. */
	M: number | null;
	state: MarkState;
	iBid: number | null;
	iAsk: number | null;
	edgeBid: number | null;
	edgeAsk: number | null;
	/** iAsk − iBid, the thinness thermometer. Null unless fresh. */
	impactSpread: number | null;
	/** Boundary fill per side, when the eligible ladder held less than D. */
	shortBid: MarkShort | null;
	shortAsk: MarkShort | null;
	/** Walk consumption per account: id -> (level i -> $). */
	used: Map<string, Map<number, number>>;
	/** Each account's share of the walked dollars, per side (0..1). */
	shareBid: Map<string, number>;
	shareAsk: Map<string, number>;
	/** Mark-eligible size per account (the winning candidate): id -> (level i -> $). */
	eligible: Map<string, Map<number, number>>;
}

/**
 * The Mark. Only paired (demonstrated two-sided) size votes: per account
 * and side, quotes count up to the account's overlap — min(in-range bid $,
 * in-range ask $) — allocated best-first, where in range means within
 * Z + B/2 of that side's anchor (the same working width the fee schedule
 * discounts, total span B + 2Z).
 *
 * Anchoring is seeded per account: every account standing both a bid and an
 * ask proposes its own best quotes as trial anchors, and each seed runs
 * exactly two passes (eligibility from the trial anchors, re-anchor at the
 * best eligible quote, recompute once). Each distinct converged outcome is a
 * candidate eligible book. A candidate whose converged anchors stand farther
 * apart than the span B + 2Z is incoherent and dropped (crossed anchors pass
 * trivially). The largest candidate wins; overlapping candidates at an exact
 * tie break deterministically (tighter anchor spread, then higher bid
 * anchor), while a strict tie between DISJOINT candidates is two books
 * disputing the price with no dominant market — no fresh M. One-sided
 * accounts propose no seed and carry no eligible size, so they can neither
 * position a window nor vote; junk far from the market converges to a tiny
 * candidate and loses to the real book's size.
 *
 * With no winner: held (carry the last M) if a mark has ever existed, else
 * none (launch — no mark until a valid candidate forms).
 *
 * The D-walk consumes the winning ladder best-first, pro-rata across
 * accounts at equal prices; if the ladder holds less than D, the missing
 * dollars are priced at the anchor ± (Z + B/2) (boundary fill). Because every
 * account's eligible size is equal on both sides by construction, the
 * eligible book is dollar-symmetric: shortfalls are always equal, so raw
 * size imbalance never tilts M. Boundary fill only interpolates —
 * M = c·(walked mid) + (1−c)·(anchor mid), c = eligible/D — and inflates
 * the exported impact spread, the health signal. Placement is the only vote.
 */
export function computeMark(
	books: MakerBook[],
	p: { B: number; D: number; Z: number },
	lastM: number | null,
): MultiMark {
	const { B, D, Z } = p;
	const half = (B / 2) * BP;
	// The measurement reach: Z past the band's half-width, per side, so the
	// mark reads over exactly the working width the fee schedule discounts
	// (total span B + 2Z). Quote-anchored: measured from the anchors, never
	// from M or the band.
	const reachD = (Z + B / 2) * BP;
	// The coherence span: a candidate's own anchors may stand at most this
	// far apart — the same working width, hung across the market.
	const spanD = 2 * reachD;

	const mapBy = <V>(mk: () => V): Map<string, V> => {
		const m = new Map<string, V>();
		for (const b of books) m.set(b.id, mk());
		return m;
	};
	const noMark = (): MultiMark => ({
		M: lastM,
		state: lastM == null ? "none" : "held",
		iBid: null,
		iAsk: null,
		edgeBid: lastM == null ? null : lastM - half,
		edgeAsk: lastM == null ? null : lastM + half,
		impactSpread: null,
		shortBid: null,
		shortAsk: null,
		used: mapBy(() => new Map<number, number>()),
		shareBid: mapBy(() => 0),
		shareAsk: mapBy(() => 0),
		eligible: mapBy(() => new Map<number, number>()),
	});

	// A non-positive walk size cannot measure anything: without this guard
	// the walk's cost / D divides by zero and every downstream fee is NaN
	// while the state still claims "fresh".
	if (!(D > 0)) return noMark();

	// —— Coherence gate: a self-crossed account (own best bid at or above
	// its own best ask) would trade with itself — wash-trading posture,
	// not a view of the market. It gets no voice in the mark this window:
	// no seed, no eligibility contribution. (Its orders still match and
	// pay fees; only mark participation is withheld.) Without this gate a
	// $20 self-crossed straddle across two far-apart markets hijacks
	// anchor convergence and mints a mark between them — the one-sided
	// reach filters admit its far quote via its near pair, and every
	// seed converges to a widely-crossed anchor key. Crossing BETWEEN
	// accounts remains normal batch behavior and is unaffected. ——
	const marketBooks = books.filter((b) => {
		let bb = Number.NEGATIVE_INFINITY;
		let ba = Number.POSITIVE_INFINITY;
		for (const l of b.levels) {
			if (l.size <= 0) continue;
			if (l.side === "bid" && l.price > bb) bb = l.price;
			if (l.side === "ask" && l.price < ba) ba = l.price;
		}
		// one-sided or empty books pass through: harmless to eligibility
		// (the paired cap zeroes them) and they never seed anyway
		return bb < ba;
	});

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
		for (const b of marketBooks) {
			const em = eligible.get(b.id);
			if (!em) continue;
			const bids = b.levels
				.filter(
					(l) =>
						l.side === "bid" &&
						l.size > 0 &&
						anchorBid - l.price <= reachD + 1e-9,
				)
				.sort((a, c) => c.price - a.price);
			const asks = b.levels
				.filter(
					(l) =>
						l.side === "ask" &&
						l.size > 0 &&
						l.price - anchorAsk <= reachD + 1e-9,
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

	// —— Seeds: each two-sided account proposes its own best quotes ——
	const seeds = new Map<string, { bb: number; ba: number }>();
	for (const b of marketBooks) {
		let bb = Number.NEGATIVE_INFINITY;
		let ba = Number.POSITIVE_INFINITY;
		for (const l of b.levels) {
			if (l.size <= 0) continue;
			if (l.side === "bid" && l.price > bb) bb = l.price;
			if (l.side === "ask" && l.price < ba) ba = l.price;
		}
		if (bb !== Number.NEGATIVE_INFINITY && ba !== Number.POSITIVE_INFINITY)
			seeds.set(`${bb}|${ba}`, { bb, ba });
	}
	if (!seeds.size) return noMark();

	// —— Converge each seed (exactly two passes), keep distinct valid candidates ——
	interface Candidate {
		aBid: number;
		aAsk: number;
		eligible: Map<string, Map<number, number>>;
		elBids: ElQuote[];
		elAsks: ElQuote[];
		/** Eligible $ per side (both sides equal by construction). */
		size: number;
	}
	const candidates: Candidate[] = [];
	const seen = new Set<string>();
	for (const { bb, ba } of seeds.values()) {
		const e1 = eligibilityOf(bb, ba);
		if (!e1.elBids.length || !e1.elAsks.length) continue;
		let aBid = Number.NEGATIVE_INFINITY;
		let aAsk = Number.POSITIVE_INFINITY;
		for (const q of e1.elBids) if (q.price > aBid) aBid = q.price;
		for (const q of e1.elAsks) if (q.price < aAsk) aAsk = q.price;
		// Coherence: a candidate whose own anchors disagree by more than the
		// working span is not a market (an incoherent book of one). Crossed
		// anchors pass trivially.
		if (aAsk - aBid > spanD + 1e-9) continue;
		const key = `${aBid}|${aAsk}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const e2 = eligibilityOf(aBid, aAsk);
		if (!e2.elBids.length || !e2.elAsks.length) continue;
		const size = e2.elBids.reduce((s, q) => s + q.el, 0);
		candidates.push({
			aBid,
			aAsk,
			eligible: e2.eligible,
			elBids: e2.elBids,
			elAsks: e2.elAsks,
			size,
		});
	}
	if (!candidates.length) return noMark();

	// —— Selection: the largest candidate eligible book wins. A strict tie
	// between disjoint candidates is disagreement (no dominant market → no
	// fresh M); ties between overlapping candidates are two readings of one
	// region and break deterministically. ——
	// "Shares size" means the SAME PHYSICAL ORDER (account AND level) is
	// counted by both candidates — possible only when their spans truly
	// intersect through real liquidity. Deliberately NOT account-level:
	// one account running small paired books in two separate regions must
	// not convert a disjoint tie (disagreement → held) into a forced
	// tiebreak. NOTE: the straddler currently bypasses this entirely by
	// hijacking anchoring (see the test.todo in engine.test.ts).
	const sharesSize = (a: Candidate, b: Candidate): boolean => {
		for (const [id, em] of a.eligible) {
			const bm = b.eligible.get(id);
			if (!bm) continue;
			for (const [i, v] of em)
				if (v > 1e-9 && (bm.get(i) ?? 0) > 1e-9) return true;
		}
		return false;
	};
	let maxSize = 0;
	for (const c of candidates) if (c.size > maxSize) maxSize = c.size;
	const top = candidates.filter((c) => Math.abs(c.size - maxSize) <= 1e-6);
	if (top.length > 1) {
		for (let i = 0; i < top.length; i++)
			for (let j = i + 1; j < top.length; j++)
				if (!sharesSize(top[i], top[j])) return noMark();
		top.sort((x, y) => x.aAsk - x.aBid - (y.aAsk - y.aBid) || y.aBid - x.aBid);
	}
	const win = top[0];

	// —— The impact walks, with boundary fill at anchor ± (Z + B/2) ——
	const used = mapBy(() => new Map<number, number>());
	const useTotals = {
		bid: new Map<string, number>(),
		ask: new Map<string, number>(),
	};

	const walkSide = (els: ElQuote[], side: "bid" | "ask", boundary: number) => {
		els.sort((a, b) =>
			side === "bid" ? b.price - a.price : a.price - b.price,
		);
		let rem = D;
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
		return { price: cost / D, walked: D - (short?.missing ?? 0), short };
	};

	const wBid = walkSide(win.elBids, "bid", win.aBid - reachD);
	const wAsk = walkSide(win.elAsks, "ask", win.aAsk + reachD);
	const M = (wBid.price + wAsk.price) / 2;

	const share = (tm: Map<string, number>, tot: number) => {
		const out = new Map<string, number>();
		for (const b of books)
			out.set(b.id, tot > 0 ? (tm.get(b.id) ?? 0) / tot : 0);
		return out;
	};

	return {
		M,
		state: "fresh",
		iBid: wBid.price,
		iAsk: wAsk.price,
		edgeBid: M - half,
		edgeAsk: M + half,
		impactSpread: wAsk.price - wBid.price,
		shortBid: wBid.short,
		shortAsk: wAsk.short,
		used,
		shareBid: share(useTotals.bid, wBid.walked),
		shareAsk: share(useTotals.ask, wAsk.walked),
		eligible: win.eligible,
	};
}

export interface MarketModel {
	levels: FeeLevel[];
	/** The mark; null only in the no-mark ("none") state. */
	M: number | null;
	state: MarkState;
	iBid: number | null;
	iAsk: number | null;
	edgeBid: number | null;
	edgeAsk: number | null;
	/** iAsk − iBid, the thinness thermometer. Null unless fresh. */
	impactSpread: number | null;
	/** Boundary fill per side, when the eligible ladder held less than D. */
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
 * seed → candidate → impact walks with boundary fill → M → band → stamps →
 * joint pairing allocation (spillover) → combined fee. `lastM` is the mark
 * carried from prior windows (null at launch — the no-mark state, where
 * everything pays the cap).
 *
 * Every level's breakdown answers: if the sweep reached this level and it
 * fully filled, what rate would it pay?
 */
export function computeModel(
	book: BookLevel[],
	p: FeeParams,
	lastM: number | null,
): MarketModel {
	const { B, D, Z } = p;
	const mm = computeMark([{ id: "solo", levels: book }], { B, D, Z }, lastM);
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
		state: mm.state,
		iBid: mm.iBid,
		iAsk: mm.iAsk,
		edgeBid: af.edgeBid,
		edgeAsk: af.edgeAsk,
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

/**
 * The base-fee curve as a pure function of distance from the mark in
 * bps: free inside the band, k₁ through the zone, k₂ beyond, capped at
 * F. The single source of the stamp shape — labs must render this
 * rather than re-implement it.
 */
export function baseFeeBps(
	distFromMBps: number,
	p: { B: number; F: number; Z: number; slope: number; slope2: number },
): number {
	const beyond = Math.max(0, distFromMBps - p.B / 2);
	const raw =
		p.slope * Math.min(beyond, p.Z) + p.slope2 * Math.max(0, beyond - p.Z);
	return Math.min(p.F, raw);
}
