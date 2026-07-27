import { useEffect, useMemo, useRef, useState } from "react";
import {
	type AccountFees,
	type BookLevel,
	BP,
	computeAccountFees,
	computeMark,
	type MultiMark,
	type Side,
} from "../../../lib/snapshot-fees/engine";
import "./lab-theme.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — multi-maker laboratory, mirrored: your book grows up
// from the midline, the Aggregate Makers grow down. Communal things (M,
// the band) span both halves; personal things live in their own half.
// ————————————————————————————————————————————————————————————————

const N = 61;
const CENTER = 30;
// zoom steps: ticks visible either side of 100.00 (view only, never the book)
const ZOOM_HALVES = [10, 15, 20, 25, 30];
const TICK = 0.005;
const DMAX = 40000; // $ per level, per half
const YOUR_MAX = 25000;
const MAKER_MAX = 40000;
const STEP_DOLLARS = 250;
// Defaults for the Maker Zone Z (the Mark's working radius: eligibility
// range, walk truncation, boundary-fill price, and the base-fee knee) and the
// far slope k₂ beyond the zone edge.
const Z_DEFAULT = 4;
const SLOPE2_DEFAULT = 0.95;

const priceAt = (i: number) => +(100 + (i - CENTER) * TICK).toFixed(3);
// 100.000 (i = CENTER) is a quotable bid; asks start one tick above.
const sideAt = (i: number): Side => (i <= CENTER ? "bid" : "ask");

const round$ = (v: number) =>
	Math.max(0, Math.round(v / STEP_DOLLARS) * STEP_DOLLARS);

// Aggregate Makers ladder, outward from CENTER ± spread, spanning the book
const AGG_LADDER = Array.from(
	{ length: 29 },
	(_, k) => 6000 + Math.round((14000 * k) / 28 / 500) * 500,
);
const aggSizesOf = (depth: number, leanPct: number, spread: number) => {
	const a = Array(N).fill(0);
	const lean = leanPct / 100;
	AGG_LADDER.forEach((v, k) => {
		const bi = CENTER + 1 - spread - k;
		const ai = CENTER + spread + k;
		if (bi >= 0) a[bi] = Math.min(MAKER_MAX, round$(v * depth * (1 + lean)));
		if (ai <= N - 1)
			a[ai] = Math.min(MAKER_MAX, round$(v * depth * (1 - lean)));
	});
	return a;
};

const randomMakers = () => {
	const a = Array(N).fill(0);
	const mk = (start: number, dir: 1 | -1, leanMul: number) => {
		const base = 4500 + Math.random() * 9000;
		const grow = -0.1 + 0.55 * Math.random() ** 0.8;
		for (let k = 0; ; k++) {
			const i = dir === -1 ? CENTER + 1 - start - k : CENTER + start + k;
			if (i < 0 || i > N - 1) break;
			if (Math.random() < 0.15) continue;
			a[i] = Math.min(
				MAKER_MAX,
				round$(
					base *
						leanMul *
						Math.max(0.3, 1 + grow * k) *
						(0.7 + Math.random() * 0.6),
				),
			);
		}
	};
	const lean = 0.5 + Math.random();
	const start = () => {
		const r = Math.random();
		return r < 0.65 ? 1 : r < 0.9 ? 2 : 3;
	};
	mk(start(), -1, lean);
	mk(start(), 1, 2 - lean);
	return a;
};

const bookOf = (fill: Record<number, number>): number[] => {
	const a = Array(N).fill(0);
	for (const [i, v] of Object.entries(fill)) a[+i] = v;
	return a;
};
const YOUR_DEFAULT = () =>
	bookOf({
		[CENTER - 1]: 5000,
		[CENTER - 2]: 6500,
		[CENTER - 3]: 8000,
		[CENTER - 4]: 9500,
		[CENTER + 1]: 5000,
		[CENTER + 2]: 6500,
		[CENTER + 3]: 8000,
		[CENTER + 4]: 9500,
	});

interface Scenario {
	key: string;
	title: string;
	blurb: string;
	you: () => number[];
	depth: number;
	lean: number;
	spread: number;
	/** Levels of YOUR book flipped from the positional side default. */
	flips?: number[];
	/** zoom index into ZOOM_HALVES this scenario opens at (default 1, ±7.5bps) */
	zoom?: number;
}

const SCENARIOS: Scenario[] = [
	{
		key: "alone",
		title: "On Your Own",
		blurb:
			"The aggregate makers are gone: your book is the whole market, exactly as in the first lab. Every dollar of the walk is yours, so M answers to you alone. Drag a side thin and watch it move.",
		you: YOUR_DEFAULT,
		depth: 0,
		lean: 0,
		spread: 1,
	},
	{
		key: "smallfish",
		title: "Small Fish",
		blurb:
			"A deep aggregate book dwarfs yours. Drag your bars: M barely acknowledges you, because your dollars are a sliver of the measuring walk. Your fees still depend entirely on your own placement and matching; only your influence on the yardstick shrank.",
		you: YOUR_DEFAULT,
		depth: 2.5,
		lean: 0,
		spread: 1,
	},
	{
		key: "equal",
		title: "Equal Voice",
		blurb:
			"You and the aggregate makers stand comparable size near the touch, so the walk consumes from both of you pro-rata and the Mark splits the difference. Check your share of each walk in the readout.",
		you: YOUR_DEFAULT,
		depth: 0.55,
		lean: 0,
		spread: 1,
	},
	{
		key: "lean",
		title: "The Makers Lean",
		blurb:
			"The aggregate book goes bid-heavy: their thin ask side makes the buy walk pay up, M rises, and the band follows. Your book has not moved, but your quotes now sit differently against the standard and your fees changed. Your placement is yours; the yardstick is communal.",
		you: YOUR_DEFAULT,
		depth: 1.5,
		lean: 60,
		spread: 1,
	},
	{
		key: "bend",
		title: "Try to Bend It",
		blurb:
			"You stand a huge bid wall below the market, hoping to drag M down. It never votes: only two-sided size counts, and your overlap is spent on your near quotes first. Thin the makers to zero and the wall still has no voice. The only way to move M is to stand real, paired, fillable size near the touch.",
		you: () =>
			bookOf({
				[CENTER - 1]: 5000,
				[CENTER - 2]: 5000,
				[CENTER + 1]: 5000,
				[CENTER + 2]: 5000,
				[CENTER - 9]: 25000,
			}),
		depth: 1,
		lean: 0,
		spread: 1,
	},
	{
		key: "crossed",
		title: "Crossed Market",
		blurb:
			"Your bid stands 2.5bps above the makers' best ask, at size, with your own ask behind it. A crossed book is not an error: the walks run per side, the impact prices cross, and M lands inside the overlap, pulled toward the aggressive bid. The crossing bid's own base fee is zero, since aggression is never charged for contesting the price. In a dual-flow venue makers never trade each other, so a cross like this drains through taker flow instead. A cross narrower than about twice the market-order rate is not even an arbitrage, since a round trip pays that rate twice; a small cross is simply a better price for natural flow.",
		you: () =>
			bookOf({
				[CENTER + 6]: 20000,
				[CENTER + 8]: 20000,
			}),
		flips: [CENTER + 6],
		depth: 1,
		lean: 0,
		spread: 1,
	},
	{
		key: "incoherent",
		title: "Rival Books",
		blurb:
			"Your two-sided market stands 5.5bps above the makers', too far for either book to lie within the other's measuring reach. The snapshot now holds two candidate eligible books, and M reads the larger one: the makers keep the mark, your book gets no voice, and its receipts are priced against the mark their book set. Clear the makers and your book becomes the only candidate: M jumps to it. Only when two rival books stand at exactly equal eligible size is there no dominant candidate; then M holds its last value (the ❄ in the readout).",
		you: () =>
			bookOf({
				[CENTER + 11]: 20000,
				[CENTER + 12]: 20000,
			}),
		flips: [CENTER + 11],
		depth: 1,
		lean: 0,
		spread: 1,
	},
];

const C = {
	panel: "var(--lab-panel)",
	panel2: "var(--lab-panel2)",
	line: "var(--lab-line)",
	grid: "var(--lab-grid)",
	text: "var(--lab-text)",
	dim: "var(--lab-dim)",
	faint: "var(--lab-faint)",
	tipText: "var(--lab-tip-text)",
	tipDim: "var(--lab-tip-dim)",
	tipFaint: "var(--lab-tip-faint)",
	bid: "var(--lab-bid)",
	ask: "var(--lab-ask)",
	fee: "var(--lab-fee)",
	mark: "var(--lab-mark)",
	band: "var(--lab-band)",
	bandEdge: "var(--lab-band-edge)",
	zone: "var(--lab-zone)",
	markSlice: "var(--lab-mark-slice)",
	hatch: "var(--lab-hatch)",
	danger: "var(--lab-danger)",
	inset: "var(--lab-inset)",
	hint: "var(--lab-hint)",
};

const mono = "var(--lab-mono)";
const fmtPx = (v: number) => v.toFixed(3);

const label = {
	fontFamily: mono,
	fontSize: 10,
	letterSpacing: "0.14em",
	color: C.dim,
	textTransform: "uppercase",
	whiteSpace: "nowrap",
} as const;

interface ParamProps {
	name: string;
	val: number;
	set: (v: number) => void;
	min: number;
	max: number;
	stp: number;
	suffix?: string;
	hint?: string;
	fmt?: (v: number) => string;
	warn?: boolean;
}

function Param({
	name,
	val,
	set,
	min,
	max,
	stp,
	suffix,
	hint,
	fmt,
	warn,
}: ParamProps) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 3,
				minWidth: 0,
				overflow: "hidden",
			}}
		>
			<span style={{ ...label, fontSize: 9.5, letterSpacing: "0.1em" }}>
				{name}
			</span>
			<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
				<input
					type="range"
					min={min}
					max={max}
					step={stp}
					value={val}
					onChange={(e) => set(+(e.currentTarget as HTMLInputElement).value)}
					style={{
						flex: "1 1 auto",
						minWidth: 0,
						accentColor: warn ? C.danger : "var(--lab-slider)",
					}}
				/>
				<span
					style={{
						fontFamily: mono,
						fontSize: 11.5,
						color: warn ? C.danger : C.text,
						whiteSpace: "nowrap",
						width: "8ch",
						textAlign: "right",
						flexShrink: 0,
					}}
				>
					{fmt ? fmt(val) : val + (suffix || "")}
				</span>
			</div>
			{hint && (
				<span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.35 }}>
					{hint}
				</span>
			)}
		</div>
	);
}

interface DragState {
	i: number;
	who: "you" | "makers";
	y0: number;
	v0: number;
	moved: boolean;
}

export default function MultiMakerLab() {
	const [B, setB] = useState(2); // inner band width, bps
	const [D, setD] = useState(20000);
	const [F, setF] = useState(10);
	const [Z, setZ] = useState(Z_DEFAULT);
	const [slope, setSlope] = useState(0.8);
	const [slope2, setSlope2] = useState(SLOPE2_DEFAULT);
	const [depth, setDepth] = useState(SCENARIOS[0].depth);
	const [lean, setLean] = useState(SCENARIOS[0].lean);
	const [spread, setSpread] = useState(SCENARIOS[0].spread);
	const [yourSizes, setYourSizes] = useState<number[]>(() =>
		SCENARIOS[0].you(),
	);
	const [makerSizes, setMakerSizes] = useState<number[]>(() =>
		aggSizesOf(SCENARIOS[0].depth, SCENARIOS[0].lean, SCENARIOS[0].spread),
	);
	const [scenario, setScenario] = useState<string | null>(SCENARIOS[0].key);
	// levels of YOUR book whose side is flipped from the positional default;
	// flipping a right-of-center level to bid (or vice versa) builds a
	// crossed book. The aggregate book stays positional.
	const [yourFlips, setYourFlips] = useState<ReadonlySet<number>>(new Set());
	const [playing, setPlaying] = useState(false);
	// the last custom market, remembered when a scenario replaces it; the
	// Custom button restores it
	const [customSnap, setCustomSnap] = useState<{
		yourSizes: number[];
		yourFlips: ReadonlySet<number>;
		depth: number;
		lean: number;
		spread: number;
		makerSizes: number[];
		B: number;
		D: number;
		F: number;
		Z: number;
		slope: number;
		slope2: number;
	} | null>(null);
	const [mHover, setMHover] = useState(false);
	const [feeHover, setFeeHover] = useState<number | null>(null);
	const [makerHover, setMakerHover] = useState<number | null>(null);
	const [zoom, setZoom] = useState(SCENARIOS[0].zoom ?? 1); // default view: ±7.5bps
	// fade the fee receipt while the pointer sits under its box, so the
	// bars beneath stay visible mid-resize
	const [underTip, setUnderTip] = useState(false);
	// visibility toggles: a hidden book leaves the auction entirely (M and
	// every fee recompute without it); its bars stay as faint ghosts
	const [showYou, setShowYou] = useState(true);
	const [showAgg, setShowAgg] = useState(true);
	const tipH = useRef(0);
	const tipY = useRef(0);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);
	const playCenter = useRef(0); // makers' private fair value, in ticks off mid
	const playLean = useRef(0);
	const playDepth = useRef(1);
	const playShape = useRef(0.2); // book shape: +grows outward, −thick at the mid
	const playTilt = useRef(0); // shape opposition: bids vs asks bend opposite ways
	const yourSideOf = (i: number): Side =>
		yourFlips.has(i) ? (sideAt(i) === "bid" ? "ask" : "bid") : sideAt(i);
	const flipLevel = (i: number) =>
		setYourFlips((s) => {
			const nx = new Set(s);
			if (nx.has(i)) nx.delete(i);
			else nx.add(i);
			return nx;
		});
	const model = useMemo(() => {
		const yourBook: BookLevel[] = yourSizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: yourSideOf(i),
			size: showYou ? size : 0,
		}));
		const makerBook: BookLevel[] = makerSizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideAt(i),
			size: showAgg ? size : 0,
		}));
		// the lab always carries a prior mark (lastM starts at 100), so the
		// no-mark state is unreachable here and M / the band edges are numbers
		const mm = computeMark(
			[
				{ id: "you", levels: yourBook },
				{ id: "agg", levels: makerBook },
			],
			{ B, D, Z },
			lastM.current,
		) as MultiMark & { M: number; edgeBid: number; edgeAsk: number };
		const p = { B, D, F, Z, slope, slope2, comp: 0 };
		type Fees = AccountFees & { edgeBid: number; edgeAsk: number };
		const fees = computeAccountFees(yourBook, p, mm.M) as Fees;
		const makerFees = computeAccountFees(makerBook, p, mm.M) as Fees;
		return { mm, fees, makerFees };
	}, [
		yourSizes,
		makerSizes,
		B,
		D,
		F,
		Z,
		slope,
		slope2,
		yourFlips,
		showYou,
		showAgg,
	]);

	const { mm, fees, makerFees } = model;

	useEffect(() => {
		if (mm.state === "fresh") lastM.current = mm.M;
	}, [mm.M, mm.state]);

	// —— play: the makers re-price around a wandering private fair value.
	// Their center, lean, and depth each take slow random walks; level
	// sizes chase the moving envelope, arriving in lumps. Levels the
	// center leaves behind decay out; fresh levels fill in ahead of it.
	useEffect(() => {
		if (!playing) return;
		const id = setInterval(() => {
			playCenter.current = Math.max(
				-2.5,
				Math.min(2.5, playCenter.current + (Math.random() - 0.5) * 0.35),
			);
			playLean.current = Math.max(
				-0.5,
				Math.min(0.5, playLean.current + (Math.random() - 0.5) * 0.05),
			);
			playDepth.current = Math.max(
				0.8,
				Math.min(2.0, playDepth.current + (Math.random() - 0.5) * 0.04),
			);
			playShape.current = Math.max(
				-0.12,
				Math.min(
					0.35,
					playShape.current +
						(0.15 - playShape.current) * 0.05 +
						(Math.random() - 0.5) * 0.025,
				),
			);
			playTilt.current = Math.max(
				-0.3,
				Math.min(0.3, playTilt.current + (Math.random() - 0.5) * 0.03),
			);
			const cF = CENTER + 0.5 + playCenter.current;
			const lv = playLean.current;
			const dp = playDepth.current;
			// sides can bend opposite ways: one thick at the edge while the
			// other stacks the middle
			const gBid = Math.max(
				-0.2,
				Math.min(0.5, playShape.current + playTilt.current),
			);
			const gAsk = Math.max(
				-0.2,
				Math.min(0.5, playShape.current - playTilt.current),
			);
			setMakerSizes((cur) =>
				cur.map((v, i) => {
					const side = sideAt(i);
					if (side === "mid") return 0;
					const dist = side === "bid" ? cF - i : i - cF;
					const sideMul = side === "bid" ? 1 + lv : 1 - lv;
					const g = side === "bid" ? gBid : gAsk;
					const target =
						dist < 0.5
							? 0
							: Math.min(
									MAKER_MAX,
									9000 *
										Math.max(0.35, 1 + g * Math.max(0, dist - 1)) *
										sideMul *
										dp,
								);
					const lump =
						Math.random() < 0.15
							? (Math.random() - 0.5) * 5000
							: (Math.random() - 0.5) * 500;
					const nx = v + 0.22 * (target - v) + lump;
					return Math.min(MAKER_MAX, round$(nx));
				}),
			);
		}, 420);
		return () => clearInterval(id);
	}, [playing]);

	const startStop = () => {
		if (!playing) {
			playCenter.current = 0;
			playLean.current = Math.max(-0.5, Math.min(0.5, lean / 100));
			playDepth.current = Math.max(0.8, Math.min(2.0, depth || 1));
			playShape.current = -0.12 + 0.47 * Math.random() ** 0.75;
			playTilt.current = (Math.random() - 0.5) * 0.3;
		}
		setPlaying((v) => !v);
	};

	// —— chart geometry: mirrored halves ——
	const W = 960;
	const PL = 84;
	const PR = 884;
	const PT = 58;
	const MID = 298;
	const PB = 538;
	const H = 628;
	const AXIS_Y = PB + 4;
	const PAD = 16;
	const viewHalf = ZOOM_HALVES[zoom];
	const loI = CENTER - viewHalf;
	const inView = (i: number) => i >= loI && i <= CENTER + viewHalf;
	const labelStride = [2, 3, 4, 5, 6][zoom];
	const step = (PR - PL - 2 * PAD) / (viewHalf * 2);
	const xAt = (i: number) => PL + PAD + (i - loI) * step;
	const xOfPrice = (p: number) => PL + PAD + ((p - priceAt(loI)) / TICK) * step;
	const barW = step * 0.6;
	const yUp = (v: number) => Math.max(PT, MID - (v / DMAX) * (MID - PT));
	const yDn = (v: number) => Math.min(PB, MID + (v / DMAX) * (PB - MID));
	const feeMax = 25;
	const yFeeUp = (v: number) => MID - (v / feeMax) * (MID - PT);
	const yFeeDn = (v: number) => MID + (v / feeMax) * (PB - MID);

	// —— drag: each bar resizes from its outer edge; handles know their half ——
	const onDown = (e: PointerEvent, i: number, who: "you" | "makers") => {
		const el = e.currentTarget as SVGRectElement;
		el.setPointerCapture(e.pointerId);
		drag.current = {
			i,
			who,
			y0: e.clientY,
			v0: who === "you" ? yourSizes[i] : makerSizes[i],
			moved: false,
		};
	};
	const onMove = (e: PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dy = e.clientY - d.y0;
		if (Math.abs(dy) > 4 && !d.moved) {
			d.moved = true;
			setScenario(null);
			setPlaying(false);
		}
		if (!d.moved) return;
		const half = d.who === "you" ? MID - PT : PB - MID;
		const perPx = DMAX / half;
		// up increases yours, down increases the makers'
		const dv = d.who === "you" ? -dy * perPx : dy * perPx;
		const cap = d.who === "you" ? YOUR_MAX : MAKER_MAX;
		const v = Math.min(cap, round$(d.v0 + dv));
		if (d.who === "you")
			setYourSizes((s) =>
				s[d.i] === v ? s : s.map((x, k) => (k === d.i ? v : x)),
			);
		else
			setMakerSizes((s) =>
				s[d.i] === v ? s : s.map((x, k) => (k === d.i ? v : x)),
			);
	};
	const onUp = () => {
		drag.current = null;
	};

	// hover on a bar body reads that half's fee
	const halfAt = (e: PointerEvent | MouseEvent) => {
		const el = e.currentTarget as SVGRectElement;
		const r = el.getBoundingClientRect();
		const viewY = PT + ((e.clientY - r.top) / r.height) * (PB - PT);
		return viewY < MID ? "you" : "makers";
	};
	const onBodyMove = (e: PointerEvent, i: number) => {
		/* a column is inspectable when either book stands size at it, from
		   whichever half the pointer is in */
		const any = fees.levels[i]?.bk || makerFees.levels[i]?.bk;
		if (halfAt(e) === "you") {
			setFeeHover(any ? i : null);
			setMakerHover(null);
		} else {
			setMakerHover(any ? i : null);
			setFeeHover(null);
		}
	};

	const regenMakers = (nd: number, nl: number, ns: number) => {
		setMakerSizes(aggSizesOf(nd, nl, ns));
	};
	const applyScenario = (sc: Scenario) => {
		if (scenario === null)
			setCustomSnap({
				yourSizes,
				yourFlips,
				depth,
				lean,
				spread,
				makerSizes,
				B,
				D,
				F,
				Z,
				slope,
				slope2,
			});
		setYourSizes(sc.you());
		setYourFlips(new Set(sc.flips ?? []));
		setDepth(sc.depth);
		setLean(sc.lean);
		setSpread(sc.spread);
		regenMakers(sc.depth, sc.lean, sc.spread);
		setZoom(sc.zoom ?? 1);
		setB(2);
		setD(20000);
		setF(10);
		setZ(Z_DEFAULT);
		setSlope(0.8);
		setSlope2(SLOPE2_DEFAULT);
		setPlaying(false);
		setShowYou(true);
		setShowAgg(true);
		setScenario(sc.key);
	};
	const touch =
		(_dial: string, _cur: number, fn: (v: number) => void) => (v: number) => {
			fn(v);
			setScenario(null);
			setPlaying(false);
		};

	const btn = (active: boolean) => ({
		background: active ? "var(--lab-btn-active-bg)" : "var(--lab-btn-bg)",
		border: `1px solid ${active ? "var(--lab-btn-active-bg)" : C.line}`,
		color: active ? C.panel2 : C.dim,
		fontSize: 11,
		padding: "4px 10px",
		borderRadius: 5,
		boxShadow: "var(--lab-btn-shadow)",
		cursor: "pointer",
	});

	const feeLevels = fees.levels;
	const feePts = feeLevels.filter(
		(l) => l.size > 0 && l.side !== "mid" && inView(l.i),
	);
	const feePath = feePts
		.map((l, k) => `${k ? "L" : "M"}${xAt(l.i)},${yFeeUp(l.bk?.final ?? 0)}`)
		.join(" ");
	const makerPts = makerFees.levels.filter(
		(l) => l.size > 0 && l.side !== "mid" && inView(l.i),
	);
	const makerPath = makerPts
		.map((l, k) => `${k ? "L" : "M"}${xAt(l.i)},${yFeeDn(l.bk?.final ?? 0)}`)
		.join(" ");

	const yourShareBid = (mm.shareBid.get("you") ?? 0) * 100;
	const yourShareAsk = (mm.shareAsk.get("you") ?? 0) * 100;
	// —— partner highlighting: dollars paired within your book ——
	const tip = feeHover ?? makerHover;
	const tipLv = tip != null ? feeLevels[tip] : null;
	const tipBk = tipLv?.bk ?? null;
	const tipFeeY = tipBk ? yFeeUp(tipBk.final) : null;
	const makerTipBk = tip != null ? (makerFees.levels[tip]?.bk ?? null) : null;
	const slicesFor = (
		levels: typeof feeLevels,
		hov: number | null,
	): { i: number; from: number; to: number }[] => {
		const lv = hov != null ? levels[hov] : null;
		const b = lv?.bk ?? null;
		if (!lv || !b || lv.side === "mid") return [];
		const offset = new Map<number, number>();
		const sameSide = levels
			.filter((l) => l.side === lv.side && l.size > 0 && l.bk)
			.sort((a, b2) =>
				lv.side === "bid" ? b2.price - a.price : a.price - b2.price,
			);
		for (const l of sameSide) {
			if (l.i === lv.i) break;
			for (const pr of l.bk?.pairs ?? [])
				offset.set(pr.price, (offset.get(pr.price) ?? 0) + pr.paired);
		}
		return b.pairs.flatMap((pr) => {
			const partner = levels.find(
				(l) =>
					l.side !== lv.side &&
					l.side !== "mid" &&
					Math.abs(l.price - pr.price) < 1e-9,
			);
			if (!partner) return [];
			const from = offset.get(pr.price) ?? 0;
			return [{ i: partner.i, from, to: from + pr.paired }];
		});
	};
	/* both books highlight their pairing at the hovered level, whichever
	   half the pointer is in */
	const pairSlices = slicesFor(feeLevels, tip);
	const makerPairSlices = slicesFor(makerFees.levels, tip);
	const involved = new Set(pairSlices.map((sl) => sl.i));
	if (tip != null) involved.add(tip);
	const dimIf = (i: number) => (tip != null && !involved.has(i) ? 0.35 : 1);
	const makerInvolved = new Set(makerPairSlices.map((sl) => sl.i));
	if (tip != null) makerInvolved.add(tip);
	const dimIfM = (i: number) =>
		tip != null && !makerInvolved.has(i) ? 0.35 : 1;

	const barTrans = playing
		? { transition: "y 380ms ease-out, height 380ms ease-out" }
		: {};

	return (
		<div class="sf-lab" style={{ color: C.text }}>
			{/* chart panel */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderTop: "none",
					borderRadius: "0 0 8px 8px",
					padding: "6px 4px 2px",
					position: "relative",
				}}
			>
				<div
					style={{
						fontSize: 12,
						fontStyle: "italic",
						color: C.faint,
						textAlign: "center",
						margin: "0 10px",
						borderTop: `1px solid ${C.line}`,
						padding: "6px 12px 6px",
						lineHeight: 1.5,
					}}
				>
					Instructions: Drag a bar's outer edge to resize it, hover a bar for
					its fee or <span style={{ color: C.mark }}>M</span> for the walk, and
					double-click your half of a level to flip its side.
				</div>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "4px 24px",
						alignItems: "flex-start",
						margin: "0 10px",
					}}
				>
					<div
						style={{
							flex: "2 1 400px",
							minWidth: 300,
							display: "grid",
							gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
							gap: "10px 16px",
							padding: "10px 4px 4px",
						}}
					>
						<Param
							name="Typical demand · D"
							val={D}
							set={touch("D", D, setD)}
							min={1000}
							max={30000}
							stp={500}
							fmt={(v) => `$${Math.round(v).toLocaleString()}`}
							hint="Per side size for measuring M."
						/>
						<Param
							name="Inner Band · B"
							val={B}
							set={touch("B", B, setB)}
							min={1}
							max={10}
							stp={0.5}
							suffix="bps"
							hint="Width B, drawn M ± B/2."
						/>
						<Param
							name="Maker Zone · Z"
							val={Z}
							set={touch("Z", Z, setZ)}
							min={2}
							max={20}
							stp={0.5}
							suffix="bps"
							hint="Working radius past the band edge."
						/>
						<Param
							name="Fee Cap · F"
							val={F}
							set={touch("F", F, setF)}
							min={5}
							max={25}
							stp={0.5}
							suffix="bps"
							hint="The most any resting order pays."
						/>
						<Param
							name="Zone Slope · k₁"
							val={slope}
							set={touch("k", slope, setSlope)}
							min={0.25}
							max={3}
							stp={0.05}
							suffix="×"
							warn={slope >= 1}
							hint="Fee per bps inside the zone."
						/>
						<Param
							name="Far Slope · k₂"
							val={slope2}
							set={touch("k2", slope2, setSlope2)}
							min={0.25}
							max={3}
							stp={0.05}
							suffix="×"
							hint="Fee per bps beyond the zone."
						/>
					</div>
					<div
						style={{
							flex: "1 1 200px",
							minWidth: 190,
							display: "flex",
							flexDirection: "column",
							gap: 8,
							padding: "10px 0 4px",
						}}
					>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 3,
								background: C.inset,
								border: `1px solid ${C.line}`,
								borderRadius: 6,
								padding: "6px 10px",
							}}
						>
							<span style={{ ...label, fontSize: 9.5, letterSpacing: "0.1em" }}>
								Your Voice in M
							</span>
							<span style={{ fontFamily: mono, fontSize: 11.5, color: C.text }}>
								bid {yourShareBid.toFixed(0)}% · ask {yourShareAsk.toFixed(0)}%
							</span>
						</div>
					</div>
				</div>

				{/* the aggregate makers: their dials and book controls, one group */}
				<div
					style={{
						border: `1px solid ${C.line}`,
						borderRadius: 6,
						margin: "0 10px 6px",
						padding: "8px 12px 10px",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							flexWrap: "wrap",
							gap: "4px 10px",
							marginBottom: 6,
						}}
					>
						<span style={label}>Aggregate Makers</span>
						<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
							<button
								type="button"
								onClick={() => {
									setMakerSizes(randomMakers());
									setScenario(null);
									setPlaying(false);
								}}
								style={btn(false)}
							>
								Randomize
							</button>
							<button
								type="button"
								onClick={startStop}
								title="Play lets their book wander; watch M drift."
								style={btn(playing)}
							>
								{playing ? "❚❚ Pause" : "▶ Play"}
							</button>
						</div>
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
							gap: "10px 16px",
						}}
					>
						<Param
							name="Depth"
							val={depth}
							set={(v) => {
								touch("depth", depth, setDepth)(v);
								regenMakers(v, lean, spread);
							}}
							min={0}
							max={3}
							stp={0.1}
							suffix="×"
							hint="How much size they stand."
						/>
						<Param
							name="Lean"
							val={lean}
							set={(v) => {
								touch("lean", lean, setLean)(v);
								regenMakers(depth, v, spread);
							}}
							min={-90}
							max={90}
							stp={5}
							fmt={(v) => `${v > 0 ? "+" : ""}${v}%`}
							hint="Their bid/ask imbalance."
						/>
						<Param
							name="Spread"
							val={spread}
							set={(v) => {
								touch("spread", spread, setSpread)(v);
								regenMakers(depth, lean, v);
							}}
							min={1}
							max={6}
							stp={1}
							fmt={(v) => `${v} tick${v > 1 ? "s" : ""}`}
							hint="How far from mid their ladder starts."
						/>
					</div>
				</div>

				{/* visibility switches: either book can leave the auction; M and
				    every fee recompute without it, its bars staying as ghosts */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						alignItems: "center",
						gap: 20,
						margin: "10px 4px 2px",
					}}
				>
					<span
						style={{
							fontFamily: mono,
							fontSize: 11,
							letterSpacing: "0.08em",
							color: C.faint,
						}}
					>
						IN AUCTION
					</span>
					{(
						[
							["Your Book", showYou, setShowYou],
							["Aggregate Makers", showAgg, setShowAgg],
						] as const
					).map(([lbl, on, set]) => (
						<button
							key={lbl}
							type="button"
							role="switch"
							aria-checked={on}
							onClick={() => set((v) => !v)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								background: "none",
								border: "none",
								padding: 0,
								cursor: "pointer",
								color: on ? C.dim : C.faint,
								fontFamily: mono,
								fontSize: 12.5,
							}}
						>
							<span
								style={{
									width: 30,
									height: 17,
									borderRadius: 999,
									position: "relative",
									flexShrink: 0,
									background: on
										? "var(--lab-btn-active-bg)"
										: "var(--lab-inset)",
									border: `1px solid ${on ? "var(--lab-btn-active-bg)" : C.line}`,
									transition: "background 150ms, border-color 150ms",
								}}
							>
								<span
									style={{
										position: "absolute",
										top: 1.5,
										left: on ? 14.5 : 1.5,
										width: 12,
										height: 12,
										borderRadius: "50%",
										background: on ? C.panel2 : C.dim,
										transition: "left 150ms, background 150ms",
									}}
								/>
							</span>
							{lbl}
						</button>
					))}
				</div>

				<div style={{ position: "relative" }}>
					<svg
						ref={svgRef}
						viewBox={`0 0 ${W} ${H}`}
						style={{ width: "100%", display: "block", touchAction: "none" }}
						onPointerMove={(e) => {
							const r = svgRef.current?.getBoundingClientRect();
							if (!r) return;
							const sx = ((e.clientX - r.left) / r.width) * W;
							const sy = ((e.clientY - r.top) / r.height) * H;
							const inside =
								(feeHover != null || makerHover != null) &&
								!mHover &&
								sx >= W / 2 - 240 &&
								sx <= W / 2 + 240 &&
								sy >= tipY.current &&
								sy <= tipY.current + tipH.current;
							setUnderTip((v) => (v === inside ? v : inside));
						}}
						role="img"
						aria-label="Mirrored order book: your quotes grow up from the midline, the aggregate makers grow down, with the communal Mark spanning both"
					>
						<defs>
							<pattern
								id="sfm-hatch"
								width="6"
								height="6"
								patternUnits="userSpaceOnUse"
								patternTransform="rotate(45)"
							>
								<line
									x1="0"
									y1="0"
									x2="0"
									y2="6"
									strokeWidth="1.6"
									style={{ stroke: C.hatch }}
								/>
							</pattern>
						</defs>

						{/* fee gridlines, both halves */}
						{[5, 10, 15, 20, 25].map((v) => (
							<g key={v}>
								<line
									x1={PL}
									x2={PR}
									y1={yFeeUp(v)}
									y2={yFeeUp(v)}
									strokeWidth={1}
									style={{ stroke: C.grid }}
								/>
								<line
									x1={PL}
									x2={PR}
									y1={yFeeDn(v)}
									y2={yFeeDn(v)}
									strokeWidth={1}
									style={{ stroke: C.grid }}
								/>
								{(tipFeeY == null || Math.abs(yFeeUp(v) - tipFeeY) > 13) &&
									Math.abs(yFeeUp(v) - yFeeUp(F)) > 12 && (
										<text
											x={PL - 20}
											y={yFeeUp(v) + 4.5}
											textAnchor="end"
											fontSize={13}
											style={{ fill: C.faint, fontFamily: mono }}
										>
											{v.toFixed(0)}
										</text>
									)}
								{Math.abs(yFeeDn(v) - yFeeDn(F)) > 12 && (
									<text
										x={PL - 20}
										y={yFeeDn(v) + 4.5}
										textAnchor="end"
										fontSize={13}
										style={{ fill: C.faint, fontFamily: mono }}
									>
										{v.toFixed(0)}
									</text>
								)}
							</g>
						))}
						<text
							x={PL - 20}
							y={MID + 4.5}
							textAnchor="end"
							fontSize={13}
							style={{ fill: C.faint, fontFamily: mono }}
						>
							0
						</text>
						<text
							x={16}
							y={(PT + PB) / 2}
							fontSize={12}
							transform={`rotate(-90 16 ${(PT + PB) / 2})`}
							textAnchor="middle"
							letterSpacing="0.12em"
							style={{ fill: C.dim, fontFamily: mono }}
						>
							FEE · BPS
						</text>
						<text
							x={W - 10}
							y={(PT + PB) / 2}
							fontSize={12}
							transform={`rotate(90 ${W - 10} ${(PT + PB) / 2})`}
							textAnchor="middle"
							letterSpacing="0.12em"
							style={{ fill: C.dim, fontFamily: mono }}
						>
							DEPTH · $
						</text>
						{[10000, 20000, 30000, 40000].map((v) => (
							<g key={v}>
								<text
									x={PR + 18}
									y={yUp(v) + 4.5}
									fontSize={13}
									style={{ fill: C.faint, fontFamily: mono }}
								>
									{v / 1000}k
								</text>
								<text
									x={PR + 18}
									y={yDn(v) + 4.5}
									fontSize={13}
									style={{ fill: C.faint, fontFamily: mono }}
								>
									{v / 1000}k
								</text>
							</g>
						))}
						<text
							x={PR + 18}
							y={MID + 4.5}
							fontSize={13}
							style={{ fill: C.faint, fontFamily: mono }}
						>
							0k
						</text>

						{/* fee cap ticks on both half-axes */}
						<g pointerEvents="none" style={{ transition: "all 150ms" }}>
							<text
								x={PL - 20}
								y={yFeeUp(F) - 9}
								textAnchor="end"
								fontSize={9}
								letterSpacing="0.12em"
								style={{ fill: C.fee, fontFamily: mono }}
							>
								CAP
							</text>
							<text
								x={PL - 20}
								y={yFeeUp(F) + 4.5}
								textAnchor="end"
								fontSize={13}
								style={{ fill: C.fee, fontFamily: mono }}
							>
								{F.toFixed(2)}
							</text>
							<path
								d={`M${PL - 16},${yFeeUp(F) - 5} L${PL - 6},${yFeeUp(F)} L${PL - 16},${yFeeUp(F) + 5} Z`}
								style={{ fill: C.fee }}
							/>
							<text
								x={PL - 20}
								y={yFeeDn(F) + 4.5}
								textAnchor="end"
								fontSize={13}
								style={{ fill: C.fee, fontFamily: mono }}
							>
								{F.toFixed(2)}
							</text>
							<path
								d={`M${PL - 16},${yFeeDn(F) - 5} L${PL - 6},${yFeeDn(F)} L${PL - 16},${yFeeDn(F) + 5} Z`}
								style={{ fill: C.fee }}
							/>
						</g>

						{/* band spans both halves */}
						<g
							style={{ transition: "transform 220ms ease" }}
							transform={`translate(${xOfPrice(mm.edgeBid)},0)`}
						>
							<rect
								x={0}
								y={PT}
								width={Math.max(0, xOfPrice(mm.edgeAsk) - xOfPrice(mm.edgeBid))}
								height={PB - PT}
								style={{ fill: C.band }}
							/>
						</g>
						<line
							x1={xOfPrice(mm.edgeBid)}
							x2={xOfPrice(mm.edgeBid)}
							y1={PT}
							y2={PB}
							strokeDasharray="3 4"
							style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
						/>
						<line
							x1={xOfPrice(mm.edgeAsk)}
							x2={xOfPrice(mm.edgeAsk)}
							y1={PT}
							y2={PB}
							strokeDasharray="3 4"
							style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
						/>
						{/* band-edge labels — hidden when the band is too narrow on screen */}
						{xOfPrice(mm.edgeAsk) - xOfPrice(mm.edgeBid) > 56 && (
							<>
								<text
									x={xOfPrice(mm.edgeBid)}
									y={PT - 6}
									textAnchor="middle"
									fontSize={12}
									style={{
										fill: C.mark,
										fontFamily: mono,
										transition: "all 220ms ease",
									}}
								>
									{fmtPx(mm.edgeBid)}
								</text>
								<text
									x={xOfPrice(mm.edgeAsk)}
									y={PT - 6}
									textAnchor="middle"
									fontSize={12}
									style={{
										fill: C.mark,
										fontFamily: mono,
										transition: "all 220ms ease",
									}}
								>
									{fmtPx(mm.edgeAsk)}
								</text>
							</>
						)}

						{/* zone edges: where the far slope takes over, either side */}
						{[mm.edgeBid - Z * BP, mm.edgeAsk + Z * BP].map((zp, side) => {
							const zx = xOfPrice(zp);
							if (zx < PL || zx > PR) return null;
							const bandX = xOfPrice(side === 0 ? mm.edgeBid : mm.edgeAsk);
							const labelFits = Math.abs(zx - bandX) > 58;
							return (
								<g key={zp} pointerEvents="none">
									<line
										x1={zx}
										x2={zx}
										y1={PT}
										y2={PB}
										strokeDasharray="3 4"
										strokeWidth={1}
										opacity={0.5}
										style={{ stroke: C.zone, transition: "all 220ms ease" }}
									/>
									<path
										d={`M${zx},${PT - 3} l -5,-8 l 10,0 z`}
										opacity={0.9}
										style={{ fill: C.zone, transition: "all 220ms ease" }}
									/>
									{labelFits && (
										<text
											x={zx}
											y={PT - 16}
											textAnchor="middle"
											fontSize={10.5}
											style={{
												fill: C.zone,
												fontFamily: mono,
												transition: "all 220ms ease",
											}}
										>
											Zone Edge
										</text>
									)}
								</g>
							);
						})}

						{/* the bid/ask boundary + depth midline */}
						<line
							x1={(xAt(CENTER) + xAt(CENTER + 1)) / 2}
							x2={(xAt(CENTER) + xAt(CENTER + 1)) / 2}
							y1={PT}
							y2={PB}
							strokeWidth={1}
							style={{ stroke: C.line }}
						/>
						<line
							x1={PL}
							x2={PR}
							y1={MID}
							y2={MID}
							strokeWidth={1.25}
							style={{ stroke: C.line }}
						/>

						{/* mirrored books */}
						{yourSizes.map((yv, i) => {
							if (!inView(i)) return null;
							const sideYou = yourSideOf(i);
							const sideAgg = sideAt(i);
							const av = makerSizes[i];
							const usedYou = mm.used.get("you")?.get(i) ?? 0;
							const usedAgg = mm.used.get("agg")?.get(i) ?? 0;
							const lv = feeLevels[i];
							return (
								<g key={priceAt(i)}>
									{/* bar body: hovering reads that half's fee, clicking pins yours */}
									{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hover surface; the fee dots are the accessible pin control */}
									<rect
										x={xAt(i) - step / 2}
										y={PT}
										width={step}
										height={PB - PT}
										fill="transparent"
										style={{ cursor: "default" }}
										onPointerMove={(e) => onBodyMove(e, i)}
										onPointerLeave={() => {
											setFeeHover(null);
											setMakerHover(null);
										}}
										onDblClick={(e) => {
											if (halfAt(e) === "you") flipLevel(i);
										}}
									/>
									{/* grab handles: hug each bar's outer edge, mostly outside it */}
									<rect
										x={xAt(i) - step / 2}
										y={yv > 0 ? Math.max(PT, yUp(yv) - 12) : MID - 14}
										width={step}
										height={yv > 0 ? 16 : 14}
										fill="transparent"
										style={{ cursor: "ns-resize" }}
										onPointerEnter={() =>
											setFeeHover(lv?.bk || makerFees.levels[i]?.bk ? i : null)
										}
										onPointerLeave={() => setFeeHover(null)}
										onPointerDown={(e) => onDown(e, i, "you")}
										onPointerMove={onMove}
										onPointerUp={onUp}
										onPointerCancel={() => {
											drag.current = null;
										}}
									/>
									<rect
										x={xAt(i) - step / 2}
										y={av > 0 ? Math.min(PB - 16, yDn(av) - 4) : MID + 1}
										width={step}
										height={av > 0 ? 16 : 14}
										fill="transparent"
										style={{ cursor: "ns-resize" }}
										onPointerEnter={() =>
											setMakerHover(
												makerFees.levels[i]?.bk || fees.levels[i]?.bk
													? i
													: null,
											)
										}
										onPointerLeave={() => setMakerHover(null)}
										onPointerDown={(e) => onDown(e, i, "makers")}
										onPointerMove={onMove}
										onPointerUp={onUp}
										onPointerCancel={() => {
											drag.current = null;
										}}
									/>
									{yv > 0 && (
										<rect
											x={xAt(i) - barW / 2}
											y={yUp(yv)}
											width={barW}
											height={MID - yUp(yv)}
											opacity={(showYou ? 0.85 : 0.18) * dimIf(i)}
											rx={2}
											pointerEvents="none"
											style={{
												fill: sideYou === "bid" ? C.bid : C.ask,
												...barTrans,
											}}
										/>
									)}
									{usedYou > 0 && (
										<rect
											x={xAt(i) - barW / 2}
											y={yUp(usedYou)}
											width={barW}
											height={Math.max(0, MID - yUp(usedYou))}
											strokeWidth={1.25}
											rx={2}
											opacity={dimIf(i)}
											pointerEvents="none"
											style={{ fill: C.markSlice, stroke: C.mark, ...barTrans }}
										/>
									)}
									{yv > 0 && lv?.bk && lv.bk.unpaired > 0 && (
										<rect
											x={xAt(i) - barW / 2}
											y={yUp(yv)}
											width={barW}
											height={Math.max(0, yUp(yv - lv.bk.unpaired) - yUp(yv))}
											fill="url(#sfm-hatch)"
											rx={2}
											opacity={dimIf(i)}
											pointerEvents="none"
										/>
									)}
									{av > 0 && (
										<rect
											x={xAt(i) - barW / 2}
											y={MID + 1}
											width={barW}
											height={Math.max(0, yDn(av) - MID - 1)}
											opacity={(showAgg ? 0.45 : 0.14) * dimIfM(i)}
											rx={2}
											pointerEvents="none"
											style={{
												fill: sideAgg === "bid" ? C.bid : C.ask,
												...barTrans,
											}}
										/>
									)}
									{usedAgg > 0 && (
										<rect
											x={xAt(i) - barW / 2}
											y={MID + 1}
											width={barW}
											height={Math.max(0, yDn(usedAgg) - MID - 1)}
											strokeWidth={1.25}
											rx={2}
											opacity={dimIfM(i)}
											pointerEvents="none"
											style={{ fill: C.markSlice, stroke: C.mark, ...barTrans }}
										/>
									)}
								</g>
							);
						})}

						{/* partner highlight within your book */}
						{pairSlices
							.filter((sl) => inView(sl.i))
							.map((sl) => (
								<rect
									key={sl.i}
									x={xAt(sl.i) - barW / 2}
									y={yUp(sl.to)}
									width={barW}
									height={Math.max(0, yUp(sl.from) - yUp(sl.to))}
									fill="none"
									strokeWidth={1.75}
									rx={1.5}
									pointerEvents="none"
									style={{ stroke: C.text }}
								/>
							))}

						{/* partner highlight within the makers' book */}
						{makerPairSlices
							.filter((sl) => inView(sl.i))
							.map((sl) => (
								<rect
									key={sl.i}
									x={xAt(sl.i) - barW / 2}
									y={yDn(sl.from)}
									width={barW}
									height={Math.max(0, yDn(sl.to) - yDn(sl.from))}
									fill="none"
									strokeWidth={1.75}
									rx={1.5}
									pointerEvents="none"
									style={{ stroke: C.text }}
								/>
							))}

						{/* hovered-bar outlines, above the walk overlays so they never
						    sink beneath the consumed-slice fill */}
						{showYou &&
							tip != null &&
							inView(tip) &&
							(yourSizes[tip] ?? 0) > 0 && (
								<rect
									x={xAt(tip) - barW / 2}
									y={yUp(yourSizes[tip])}
									width={barW}
									height={Math.max(0, MID - yUp(yourSizes[tip]))}
									fill="none"
									strokeWidth={1.75}
									rx={2}
									pointerEvents="none"
									style={{ stroke: C.text }}
								/>
							)}
						{showAgg &&
							tip != null &&
							inView(tip) &&
							(makerSizes[tip] ?? 0) > 0 && (
								<rect
									x={xAt(tip) - barW / 2}
									y={MID + 1}
									width={barW}
									height={Math.max(0, yDn(makerSizes[tip]) - MID - 1)}
									fill="none"
									strokeWidth={1.75}
									rx={2}
									pointerEvents="none"
									style={{ stroke: C.text }}
								/>
							)}

						{/* hovered/pinned-fee reference line, your half */}
						{tipLv && tipBk && (
							<g pointerEvents="none">
								<line
									x1={PL}
									x2={PR}
									y1={yFeeUp(tipBk.final)}
									y2={yFeeUp(tipBk.final)}
									strokeDasharray="5 5"
									strokeWidth={1}
									opacity={0.7}
									style={{ stroke: C.fee, transition: "all 150ms" }}
								/>
								{/* the CAP tick already prints the value when they coincide */}
								{Math.abs(yFeeUp(tipBk.final) - yFeeUp(F)) > 12 && (
									<text
										x={PL - 20}
										y={yFeeUp(tipBk.final) + 4.5}
										textAnchor="end"
										fontSize={13}
										style={{ fill: C.fee, fontFamily: mono }}
									>
										{tipBk.final.toFixed(2)}
									</text>
								)}
							</g>
						)}

						{/* hovered maker-fee reference line, lower half */}
						{makerTipBk && (
							<g pointerEvents="none">
								<line
									x1={PL}
									x2={PR}
									y1={yFeeDn(makerTipBk.final)}
									y2={yFeeDn(makerTipBk.final)}
									strokeDasharray="5 5"
									strokeWidth={1}
									opacity={0.7}
									style={{ stroke: C.fee, transition: "all 150ms" }}
								/>
								{Math.abs(yFeeDn(makerTipBk.final) - yFeeDn(F)) > 12 && (
									<text
										x={PL - 20}
										y={yFeeDn(makerTipBk.final) + 4.5}
										textAnchor="end"
										fontSize={13}
										style={{ fill: C.fee, fontFamily: mono }}
									>
										{makerTipBk.final.toFixed(2)}
									</text>
								)}
							</g>
						)}

						{/* makers' fee curve, mirrored */}
						{makerPts.length > 1 && (
							<path
								d={makerPath}
								fill="none"
								strokeWidth={1.75}
								strokeDasharray="5 4"
								opacity={0.75}
								pointerEvents="none"
								style={{ stroke: C.fee, transition: "d 120ms" }}
							/>
						)}
						{makerPts.map((l) => (
							<circle
								key={l.i}
								cx={xAt(l.i)}
								cy={yFeeDn(l.bk?.final ?? 0)}
								r={tip === l.i ? 4.5 : 3}
								strokeWidth={1.5}
								pointerEvents="none"
								style={{ fill: C.panel, stroke: C.fee }}
							/>
						))}

						{/* your fee curve */}
						{feePts.length > 1 && (
							<path
								d={feePath}
								fill="none"
								strokeWidth={2.75}
								pointerEvents="none"
								style={{ stroke: C.fee, transition: "d 120ms" }}
							/>
						)}
						{feePts.map((l) => (
							<circle
								key={l.i}
								cx={xAt(l.i)}
								cy={yFeeUp(l.bk?.final ?? 0)}
								r={tip === l.i ? 5.5 : 4}
								strokeWidth={1.5}
								pointerEvents="none"
								style={{ fill: C.fee, stroke: C.panel }}
							/>
						))}

						{/* price axis at the bottom */}
						<line x1={PL} x2={PR} y1={PB} y2={PB} style={{ stroke: C.line }} />
						{yourSizes.map((_, i) =>
							!inView(i) ? null : (
								<g key={priceAt(i)}>
									<line
										x1={xAt(i)}
										x2={xAt(i)}
										y1={PB}
										y2={PB + 4}
										style={{ stroke: C.faint }}
									/>
									{(i - CENTER) % labelStride === 0 && (
										<text
											x={xAt(i)}
											y={AXIS_Y + 15}
											textAnchor="middle"
											fontSize={12}
											style={{
												fill:
													i === CENTER || yourFlips.has(i)
														? yourSideOf(i) === "bid"
															? C.bid
															: C.ask
														: C.faint,
												fontFamily: mono,
											}}
										>
											{fmtPx(priceAt(i))}
										</text>
									)}
								</g>
							),
						)}

						{/* key — both rows centered on the plot's midline; each book's
						    entries dim while its switch holds it out of the auction */}
						<g pointerEvents="none" style={{ fontFamily: mono }}>
							<g opacity={showYou ? 1 : 0.4}>
								<rect
									x={220}
									y={PB + 40}
									width={14}
									height={14}
									rx={2}
									style={{ fill: C.bid }}
								/>
								<text
									x={241}
									y={PB + 53}
									fontSize={16}
									style={{ fill: C.dim, fontFamily: mono }}
								>
									Your Bids ↑
								</text>
								<rect
									x={383}
									y={PB + 40}
									width={14}
									height={14}
									rx={2}
									style={{ fill: C.ask }}
								/>
								<text
									x={404}
									y={PB + 53}
									fontSize={16}
									style={{ fill: C.dim, fontFamily: mono }}
								>
									Your Asks ↑
								</text>
								<circle
									cx={270}
									cy={PB + 72}
									r={6}
									strokeWidth={1}
									style={{ fill: C.fee, stroke: C.panel }}
								/>
								<text
									x={283}
									y={PB + 78}
									fontSize={16}
									style={{ fill: C.dim, fontFamily: mono }}
								>
									Your Fee if Filled
								</text>
							</g>
							<g opacity={showAgg ? 1 : 0.4}>
								<rect
									x={546}
									y={PB + 40}
									width={14}
									height={14}
									rx={2}
									opacity={0.45}
									style={{ fill: C.bid }}
								/>
								<rect
									x={553}
									y={PB + 40}
									width={14}
									height={14}
									rx={2}
									opacity={0.45}
									style={{ fill: C.ask }}
								/>
								<text
									x={574}
									y={PB + 53}
									fontSize={16}
									style={{ fill: C.dim, fontFamily: mono }}
								>
									Aggregate Makers ↓
								</text>
								<circle
									cx={498}
									cy={PB + 72}
									r={6}
									strokeWidth={1.5}
									style={{ fill: C.panel, stroke: C.fee }}
								/>
								<text
									x={511}
									y={PB + 78}
									fontSize={16}
									style={{ fill: C.dim, fontFamily: mono }}
								>
									Makers Fee if Filled
								</text>
							</g>
						</g>

						{/* zoom rides the key strip's left end as one segmented control
						    (⊖ | ±bps | ⊕), mirroring Clear on the right. View only —
						    the books and M never change. */}
						<rect
							x={26}
							y={PB + 50}
							width={138}
							height={32}
							rx={6}
							strokeWidth={1}
							style={{
								fill: "var(--lab-chartbtn-bg)",
								stroke: C.line,
								filter: "var(--lab-btn-drop)",
							}}
						/>
						<line
							x1={60}
							x2={60}
							y1={PB + 50}
							y2={PB + 82}
							strokeWidth={1}
							style={{ stroke: C.line }}
						/>
						<line
							x1={130}
							x2={130}
							y1={PB + 50}
							y2={PB + 82}
							strokeWidth={1}
							style={{ stroke: C.line }}
						/>
						<svg
							x={35}
							y={PB + 58}
							width={16}
							height={16}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.2}
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							opacity={zoom >= ZOOM_HALVES.length - 1 ? 0.35 : 1}
							style={{ color: C.dim }}
						>
							<circle cx="11" cy="11" r="7" />
							<line x1="20.5" y1="20.5" x2="16" y2="16" />
							<line x1="8" y1="11" x2="14" y2="11" />
						</svg>
						<text
							x={95}
							y={PB + 71}
							textAnchor="middle"
							fontSize={14}
							pointerEvents="none"
							style={{ fill: C.dim, fontFamily: mono }}
						>
							±{viewHalf % 2 ? (viewHalf / 2).toFixed(1) : viewHalf / 2}bps
						</text>
						<svg
							x={139}
							y={PB + 58}
							width={16}
							height={16}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.2}
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							opacity={zoom === 0 ? 0.35 : 1}
							style={{ color: C.dim }}
						>
							<circle cx="11" cy="11" r="7" />
							<line x1="20.5" y1="20.5" x2="16" y2="16" />
							<line x1="8" y1="11" x2="14" y2="11" />
							<line x1="11" y1="8" x2="11" y2="14" />
						</svg>
						{/* biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg> */}
						<rect
							x={26}
							y={PB + 50}
							width={34}
							height={32}
							fill="transparent"
							role="button"
							tabIndex={0}
							aria-label="Zoom out: show more of the book"
							onClick={() =>
								setZoom((z) => Math.min(ZOOM_HALVES.length - 1, z + 1))
							}
							onKeyDown={(e) => {
								if (e.key === "Enter")
									setZoom((z) => Math.min(ZOOM_HALVES.length - 1, z + 1));
							}}
							style={{
								cursor: zoom >= ZOOM_HALVES.length - 1 ? "default" : "pointer",
							}}
						/>
						{/* biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg> */}
						<rect
							x={130}
							y={PB + 50}
							width={34}
							height={32}
							fill="transparent"
							role="button"
							tabIndex={0}
							aria-label="Zoom in"
							onClick={() => setZoom((z) => Math.max(0, z - 1))}
							onKeyDown={(e) => {
								if (e.key === "Enter") setZoom((z) => Math.max(0, z - 1));
							}}
							style={{ cursor: zoom === 0 ? "default" : "pointer" }}
						/>

						{/* Clear rides the key strip, right-aligned: empties your book */}
						{/* biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg> */}
						<g
							role="button"
							tabIndex={0}
							aria-label="Clear your book"
							onClick={() => {
								setYourSizes(Array(N).fill(0));
								setYourFlips(new Set());
								setScenario(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									setYourSizes(Array(N).fill(0));
									setYourFlips(new Set());
									setScenario(null);
								}
							}}
							style={{ cursor: "pointer" }}
						>
							<rect
								x={858}
								y={PB + 50}
								width={76}
								height={32}
								rx={6}
								strokeWidth={1}
								style={{
									fill: "var(--lab-chartbtn-bg)",
									stroke: C.line,
									filter: "var(--lab-btn-drop)",
								}}
							/>
							<text
								x={896}
								y={PB + 71}
								textAnchor="middle"
								fontSize={15.5}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Clear
							</text>
						</g>

						{/* Mark carriage */}
						<g
							style={{ transition: "transform 220ms ease" }}
							transform={`translate(${xOfPrice(mm.M)},0)`}
						>
							<line
								x1={0}
								x2={0}
								y1={PT}
								y2={PB}
								strokeWidth={1}
								opacity={0.5}
								pointerEvents="none"
								style={{ stroke: C.mark }}
							/>
							<path
								d={`M0,${PT - 3} l -6,-10 l 12,0 z`}
								style={{ fill: C.mark }}
							/>
							<rect
								x={-58}
								y={16}
								width={116}
								height={22}
								rx={4}
								strokeWidth={0.75}
								style={{ fill: C.panel2, stroke: C.mark }}
							/>
							<text
								x={0}
								y={32}
								textAnchor="middle"
								fontSize={13.5}
								style={{ fill: C.mark, fontFamily: mono }}
							>
								M {fmtPx(mm.M)}
								{mm.state !== "fresh" ? " ❄" : ""}
							</text>
							<rect
								x={-58}
								y={14}
								width={116}
								height={PT - 15}
								fill="transparent"
								onPointerEnter={() => setMHover(true)}
								onPointerLeave={() => setMHover(false)}
								style={{ cursor: "help" }}
							/>
						</g>

						{/* M tooltip */}
						{mHover &&
							(() => {
								const xT = Math.min(
									Math.max(xOfPrice(mm.M), PL + 175),
									PR - 175,
								);
								const top = PT + 8;
								const rows =
									mm.state !== "fresh"
										? [
												{ t: "M Held: No Dominant Candidate Book", c: C.text },
												{
													t: `showing last computed M ${fmtPx(mm.M)}`,
													c: C.dim,
												},
											]
										: [
												{ t: "M: The Communal Mark", c: C.dim },
												{
													t: `Sell Walk → ${mm.iBid != null ? fmtPx(mm.iBid) : "–"} · You ${yourShareBid.toFixed(0)}%`,
													c: C.bid,
												},
												{
													t: `Buy Walk → ${mm.iAsk != null ? fmtPx(mm.iAsk) : "–"} · You ${yourShareAsk.toFixed(0)}%`,
													c: C.ask,
												},
												{ t: `M = Midpoint = ${fmtPx(mm.M)}`, c: C.mark },
												{
													t: `Impact Spread ${
														mm.impactSpread != null
															? (mm.impactSpread / BP).toFixed(1)
															: "–"
													}bps · B = ${B}bps`,
													c: C.faint,
												},
												{
													t: "only two-sided size near the touch votes",
													c: C.faint,
												},
											];
								const h = 16 + rows.length * 19;
								return (
									<g pointerEvents="none">
										<rect
											x={xT - 170}
											y={top}
											width={340}
											height={h}
											rx={6}
											strokeWidth={0.75}
											style={{ fill: C.panel2, stroke: C.mark }}
										/>
										{rows.map((r, kk) => (
											<text
												key={r.t}
												x={xT - 156}
												y={top + 24 + kk * 19}
												fontSize={13.5}
												style={{ fill: r.c, fontFamily: mono }}
											>
												{r.t}
											</text>
										))}
									</g>
								);
							})()}

						{/* fee contrast popup: your receipt and the makers', side by
					    side at the hovered price level, rendered in the half
					    opposite the hovered bar */}
						{(feeHover != null || makerHover != null) &&
							!mHover &&
							(() => {
								const hoveredHalf = feeHover != null ? "you" : "makers";
								const tipI = feeHover ?? makerHover;
								if (tipI == null) return null;
								const lvY = fees.levels[tipI];
								const lvM = makerFees.levels[tipI];
								const bY =
									lvY && lvY.size > 0 && lvY.side !== "mid" ? lvY.bk : null;
								const bM =
									lvM && lvM.size > 0 && lvM.side !== "mid" ? lvM.bk : null;
								if (!bY && !bM) return null;
								const price = (lvY ?? lvM)?.price ?? 0;
								const amt = (v: number) => `${v.toFixed(2)}bps`;
								const cap = (s: string) => (s === "bid" ? "Bid" : "Ask");
								const surLines = (
									b: NonNullable<typeof bY>,
								): { a: string; why: string; c: string }[] => {
									const out: { a: string; why: string; c: string }[] = [];
									const atOrInside = b.pairs
										.filter((pr) => pr.baseFee <= b.own)
										.reduce((s, pr) => s + pr.paired, 0);
									if (atOrInside > 0)
										out.push({
											a: "+0.00",
											why: `${Math.round((atOrInside / b.q) * 100)}% ≤ base`,
											c: C.tipDim,
										});
									for (const pr of b.pairs) {
										const extra = Math.max(0, pr.baseFee - b.own);
										if (extra <= 0) continue;
										out.push({
											a: `+${((pr.paired / b.q) * extra).toFixed(2)}`,
											why: `${Math.round((pr.paired / b.q) * 100)}% @ +${extra.toFixed(2)}`,
											c: C.tipText,
										});
									}
									if (b.unpaired > 0)
										out.push({
											a: `+${((b.unpaired / b.q) * (F - b.own)).toFixed(2)}`,
											why: `${Math.round((b.unpaired / b.q) * 100)}% → Cap`,
											c: C.ask,
										});
									if (!out.length)
										out.push({ a: "+0.00", why: "", c: C.tipDim });
									return out;
								};
								const sY = bY ? surLines(bY) : [];
								const sM = bM ? surLines(bM) : [];
								const nSur = Math.max(sY.length, sM.length, 1);
								interface Trip {
									l?: string;
									lc?: string;
									c?: string;
									cc?: string;
									r?: string;
									rc?: string;
									/* aligned value rows: amount columns hug the center label,
								    right-aligned on both sides so decimals stack; the
								    parenthetical context sits in the outer column */
									lA?: string;
									lW?: string;
									rA?: string;
									rW?: string;
									span?: string;
									spanC?: string;
									spanParts?: { t: string; c: string }[];
									s?: number;
									gap?: number;
									rule?: boolean;
								}
								const rows: Trip[] = [];
								rows.push({
									l: bY ? `Your ${cap(lvY?.side ?? "")}` : "—",
									lc: C.tipDim,
									c: fmtPx(price),
									cc: C.tipText,
									r: bM ? `Makers' ${cap(lvM?.side ?? "")}` : "—",
									rc: C.tipDim,
								});
								rows.push({ rule: true, gap: 6 });
								rows.push({
									lA: bY ? amt(bY.own) : "—",
									lc: bY ? C.tipText : C.tipFaint,
									c: "BASE FEE",
									rA: bM ? amt(bM.own) : "—",
									rc: bM ? C.tipText : C.tipFaint,
									gap: 4,
								});
								for (let k = 0; k < nSur; k++)
									rows.push({
										lA: sY[k] ? `${sY[k].a}bps` : k === 0 && !bY ? "—" : "",
										lW: sY[k]?.why ? `(${sY[k].why})` : "",
										lc: sY[k]?.c ?? C.tipFaint,
										c: k === 0 ? "SURCHARGES" : "",
										rA: sM[k] ? `${sM[k].a}bps` : k === 0 && !bM ? "—" : "",
										rW: sM[k]?.why ? `(${sM[k].why})` : "",
										rc: sM[k]?.c ?? C.tipFaint,
									});
								rows.push({
									lA: bY ? amt(bY.final) : "—",
									lc: bY ? C.fee : C.tipFaint,
									c: "TOTAL FEE",
									rA: bM ? amt(bM.final) : "—",
									rc: bM ? C.fee : C.tipFaint,
									gap: 4,
								});
								rows.push({ rule: true, gap: 8 });
								if (bY && bM) {
									const diff = bY.final - bM.final;
									if (Math.abs(diff) < 0.005) {
										rows.push({
											span: "You and the makers pay the same in fees at this level.",
											spanC: C.tipDim,
											s: 12.5,
											gap: 2,
										});
									} else {
										rows.push({
											spanParts: [
												{ t: "You pay ", c: C.tipText },
												{
													t: `${Math.abs(diff).toFixed(2)}bps ${diff > 0 ? "more" : "less"}`,
													c: diff > 0 ? C.fee : C.bid,
												},
												{
													t: " in fees than the makers at this level.",
													c: C.tipText,
												},
											],
											s: 12.5,
											gap: 2,
										});
									}
								} else {
									rows.push({
										span: bY
											? showAgg
												? "The makers have no size at this level."
												: "The makers' book is toggled off."
											: showYou
												? "You have no size at this level."
												: "Your book is toggled off.",
										spanC: C.tipFaint,
										s: 12.5,
										gap: 2,
									});
								}
								let yAcc = 24;
								const placed = rows.map((r) => {
									yAcc += r.gap ?? 0;
									const y = yAcc;
									yAcc += 19;
									return { ...r, y };
								});
								const h = yAcc - 2;
								const xT = W / 2;
								const yT = hoveredHalf === "you" ? PB - h - 10 : PT + 8;
								tipH.current = h;
								tipY.current = yT;
								return (
									<g
										pointerEvents="none"
										opacity={underTip ? 0.65 : 0.88}
										style={{ transition: "opacity 120ms" }}
									>
										<rect
											x={xT - 240}
											y={yT}
											width={480}
											height={h}
											rx={6}
											strokeWidth={0.75}
											style={{ fill: C.panel2, stroke: C.fee }}
										/>
										{placed.map((r) =>
											r.rule ? (
												<line
													key={`rule${r.y}`}
													x1={xT - 228}
													x2={xT + 228}
													y1={yT + r.y - 11}
													y2={yT + r.y - 11}
													style={{ stroke: C.line }}
												/>
											) : r.span || r.spanParts ? (
												<text
													key={`s${r.y}`}
													x={xT}
													y={yT + r.y}
													textAnchor="middle"
													fontSize={r.s ?? 13}
													style={{ fill: r.spanC, fontFamily: mono }}
												>
													{r.spanParts
														? r.spanParts.map((p) => (
																<tspan key={p.t} style={{ fill: p.c }}>
																	{p.t}
																</tspan>
															))
														: r.span}
												</text>
											) : (
												<g key={`r${r.y}`}>
													{r.l ? (
														<text
															x={xT - 56}
															y={yT + r.y}
															textAnchor="end"
															fontSize={13}
															style={{ fill: r.lc, fontFamily: mono }}
														>
															{r.l}
														</text>
													) : null}
													{r.lA ? (
														<text
															x={xT - 56}
															y={yT + r.y}
															textAnchor="end"
															fontSize={13}
															style={{ fill: r.lc, fontFamily: mono }}
														>
															{r.lA}
														</text>
													) : null}
													{r.lW ? (
														<text
															x={xT - 140}
															y={yT + r.y}
															textAnchor="end"
															fontSize={11}
															style={{ fill: C.tipFaint, fontFamily: mono }}
														>
															{r.lW}
														</text>
													) : null}
													{r.c ? (
														<text
															x={xT}
															y={yT + r.y}
															textAnchor="middle"
															fontSize={12}
															letterSpacing="0.06em"
															style={{
																fill: r.cc ?? C.tipFaint,
																fontFamily: mono,
															}}
														>
															{r.c}
														</text>
													) : null}
													{r.r ? (
														<text
															x={xT + 56}
															y={yT + r.y}
															textAnchor="start"
															fontSize={13}
															style={{ fill: r.rc, fontFamily: mono }}
														>
															{r.r}
														</text>
													) : null}
													{r.rA ? (
														<text
															x={xT + 124}
															y={yT + r.y}
															textAnchor="end"
															fontSize={13}
															style={{ fill: r.rc, fontFamily: mono }}
														>
															{r.rA}
														</text>
													) : null}
													{r.rW ? (
														<text
															x={xT + 132}
															y={yT + r.y}
															textAnchor="start"
															fontSize={11}
															style={{ fill: C.tipFaint, fontFamily: mono }}
														>
															{r.rW}
														</text>
													) : null}
												</g>
											),
										)}
									</g>
								);
							})()}
					</svg>
				</div>

				{/* scenarios — a footer band of the frame */}
				<div class="sf-scenarios">
					{SCENARIOS.map((sc) => (
						<button
							key={sc.key}
							type="button"
							onClick={() => applyScenario(sc)}
							style={{ ...btn(scenario === sc.key), flex: "1 1 auto" }}
						>
							{sc.title}
						</button>
					))}
					<button
						type="button"
						onClick={() => {
							if (scenario !== null && customSnap) {
								setYourSizes(customSnap.yourSizes);
								setYourFlips(customSnap.yourFlips);
								setDepth(customSnap.depth);
								setLean(customSnap.lean);
								setSpread(customSnap.spread);
								setMakerSizes(customSnap.makerSizes);
								setB(customSnap.B);
								setD(customSnap.D);
								setF(customSnap.F);
								setZ(customSnap.Z);
								setSlope(customSnap.slope);
								setSlope2(customSnap.slope2);
								setPlaying(false);
								setScenario(null);
							}
						}}
						title="Return to your last custom market"
						style={{
							...btn(scenario === null),
							flex: "1 1 auto",
							...(scenario !== null && !customSnap
								? { opacity: 0.45, cursor: "default" }
								: {}),
						}}
					>
						Custom
					</button>
				</div>
				<div class="sf-caption">
					{scenario
						? SCENARIOS.find((sc) => sc.key === scenario)?.blurb
						: "Custom setup. Drag bars and dials freely. Picking a scenario keeps this market in memory, and the Custom button brings it back."}
				</div>
			</div>
		</div>
	);
}
