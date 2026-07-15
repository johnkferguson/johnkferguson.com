import { useEffect, useMemo, useRef, useState } from "react";
import {
	type BookLevel,
	BP,
	computeAccountFees,
	computeMark,
	type Side,
} from "../../lib/snapshot-fees/engine";
import "./snapshot-fees-lab.css";

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
// range, walk truncation, boundary-fill price, and the stamp knee) and the
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
];

// What each dial does, narrated as you move it
const DIAL_EFFECT: Record<string, { up: string; down: string }> = {
	B: {
		up: "Wider inner band: more placement stamps at zero.",
		down: "Tighter inner band: precision is judged more strictly.",
	},
	F: {
		up: "Higher cap: directional fills pay more, and the cap tick rises.",
		down: "Lower cap: even fully directional fills pay less.",
	},
	T: {
		up: "Bigger measuring trade: the walk reaches deeper, so more of the book gets a vote.",
		down: "Smaller measuring trade: only the nearest size votes on M.",
	},
	Z: {
		up: "Wider zone: more of the book votes on M, and the gentle slope reaches further out.",
		down: "Tighter zone: only nearer size votes on M, and the far slope starts sooner.",
	},
	k: {
		up: "Steeper zone slope: each bps outside the band costs more; full fee arrives closer to M.",
		down: "Gentler zone slope: width is taxed less; full fee moves further out.",
	},
	k2: {
		up: "Steeper far slope: past the zone edge the fee runs to the cap faster.",
		down: "Gentler far slope: the cap arrives further out.",
	},
	depth: {
		up: "Deeper aggregate book: your dollars are a smaller share of the walk, so M listens to you less.",
		down: "Thinner aggregate book: your dollars carry more of the walk, so M listens to you more.",
	},
	lean: {
		up: "Makers lean to bids: their thin ask side walks farther, pulling M up and the band with it.",
		down: "Makers lean to asks: their thin bid side walks farther, pulling M down and the band with it.",
	},
	spread: {
		up: "Makers quote farther out: your near quotes feed the walk first and your voice grows.",
		down: "Makers quote tight to the mid: they eat the walk early and their vote dominates.",
	},
};

const C = {
	panel: "var(--lab-panel)",
	panel2: "var(--lab-panel2)",
	line: "var(--lab-line)",
	grid: "var(--lab-grid)",
	text: "var(--lab-text)",
	dim: "var(--lab-dim)",
	faint: "var(--lab-faint)",
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
const fmtBp = (v: number, d = 2) => `${v.toFixed(d)}bps`;
const fmtPx = (v: number) => v.toFixed(3);

const label = {
	fontFamily: mono,
	fontSize: 10,
	letterSpacing: "0.14em",
	color: C.dim,
	textTransform: "uppercase",
	whiteSpace: "nowrap",
} as const;

const avgFee = (
	levels: { size: number; bk: { final: number } | null }[],
): number | null => {
	let fee = 0;
	let q = 0;
	for (const l of levels) {
		if (!l.bk || l.size <= 0) continue;
		fee += l.bk.final * l.size;
		q += l.size;
	}
	return q > 0 ? fee / q : null;
};

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

function ZoomIcon({ plus }: { plus?: boolean }) {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ display: "block" }}
		>
			<circle cx="11" cy="11" r="7" />
			<line x1="20.5" y1="20.5" x2="16" y2="16" />
			<line x1="8" y1="11" x2="14" y2="11" />
			{plus && <line x1="11" y1="8" x2="11" y2="14" />}
		</svg>
	);
}

interface DragState {
	i: number;
	who: "you" | "makers";
	y0: number;
	v0: number;
	moved: boolean;
}

export default function SnapshotFeesMultiLab() {
	const [B, setB] = useState(2); // inner band width, bps
	const [T, setT] = useState(20000);
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
	const [effect, setEffect] = useState<{ t: string; warn: boolean } | null>(
		null,
	);
	const [centerSide, setCenterSide] = useState<"bid" | "ask">("bid");
	const [playing, setPlaying] = useState(false);
	const [mHover, setMHover] = useState(false);
	const [feeHover, setFeeHover] = useState<number | null>(null);
	const [makerHover, setMakerHover] = useState<number | null>(null);
	const [feePinned, setFeePinned] = useState<number | null>(null);
	const [zoom, setZoom] = useState(1); // default view: ±7.5bps
	const [mHist, setMHist] = useState<number[]>([]);
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);
	const playCenter = useRef(0); // makers' private fair value, in ticks off mid
	const playLean = useRef(0);
	const playDepth = useRef(1);
	const playShape = useRef(0.2); // book shape: +grows outward, −thick at the mid
	const playTilt = useRef(0); // shape opposition: bids vs asks bend opposite ways
	const centerSideRef = useRef<"bid" | "ask">("bid");

	const sideOf = (i: number): Side => (i === CENTER ? centerSide : sideAt(i));
	useEffect(() => {
		centerSideRef.current = centerSide;
	}, [centerSide]);
	const model = useMemo(() => {
		const yourBook: BookLevel[] = yourSizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideOf(i),
			size,
		}));
		const makerBook: BookLevel[] = makerSizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideOf(i),
			size,
		}));
		const mm = computeMark(
			[
				{ id: "you", levels: yourBook },
				{ id: "agg", levels: makerBook },
			],
			{ B, T, Z },
			lastM.current,
		);
		const p = { B, T, F, Z, slope, slope2, comp: 0 };
		const fees = computeAccountFees(yourBook, p, mm.M);
		const makerFees = computeAccountFees(makerBook, p, mm.M);
		return { mm, fees, makerFees };
	}, [yourSizes, makerSizes, B, T, F, Z, slope, slope2, sideOf]);

	const { mm, fees, makerFees } = model;

	useEffect(() => {
		if (!mm.frozen) lastM.current = mm.M;
	}, [mm.M, mm.frozen]);

	useEffect(() => {
		setMHist((h) => {
			if (h.length && Math.abs(h[h.length - 1] - mm.M) < 1e-9) return h;
			const nx = [...h, mm.M];
			return nx.length > 80 ? nx.slice(nx.length - 80) : nx;
		});
	}, [mm.M]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFeePinned(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

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
					const side = i === CENTER ? centerSideRef.current : sideAt(i);
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
	const H = 656;
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
	const togglePin = (i: number) => {
		if (!fees.levels[i]?.bk) return;
		setFeePinned((p) => (p === i ? null : i));
	};

	const onUp = (_e: PointerEvent, i: number) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved && d.who === "you") togglePin(i);
	};

	// hover on a bar body reads that half's fee; clicking pins yours
	const halfAt = (e: PointerEvent | MouseEvent) => {
		const el = e.currentTarget as SVGRectElement;
		const r = el.getBoundingClientRect();
		const viewY = PT + ((e.clientY - r.top) / r.height) * (PB - PT);
		return viewY < MID ? "you" : "makers";
	};
	const onBodyMove = (e: PointerEvent, i: number) => {
		if (halfAt(e) === "you") {
			setFeeHover(fees.levels[i]?.bk ? i : null);
			setMakerHover(null);
		} else {
			setMakerHover(makerFees.levels[i]?.bk ? i : null);
			setFeeHover(null);
		}
	};

	const regenMakers = (nd: number, nl: number, ns: number) => {
		setMakerSizes(aggSizesOf(nd, nl, ns));
	};
	const applyScenario = (sc: Scenario) => {
		setYourSizes(sc.you());
		setCenterSide("bid");
		setDepth(sc.depth);
		setLean(sc.lean);
		setSpread(sc.spread);
		regenMakers(sc.depth, sc.lean, sc.spread);
		setB(2);
		setT(20000);
		setF(10);
		setZ(Z_DEFAULT);
		setSlope(0.8);
		setSlope2(SLOPE2_DEFAULT);
		setEffect(null);
		setPlaying(false);
		setScenario(sc.key);
	};
	const touch =
		(dial: keyof typeof DIAL_EFFECT, cur: number, fn: (v: number) => void) =>
		(v: number) => {
			fn(v);
			setScenario(null);
			setPlaying(false);
			if (v === cur) return;
			if (dial === "k" && v >= 1)
				setEffect({
					t: "k ≥ 1×: width beyond the band no longer pays.",
					warn: true,
				});
			else
				setEffect({
					t: DIAL_EFFECT[dial][v > cur ? "up" : "down"],
					warn: false,
				});
		};

	const btn = (active: boolean) => ({
		background: active ? C.text : C.panel2,
		border: `1px solid ${active ? C.text : C.line}`,
		color: active ? C.panel2 : C.dim,
		fontSize: 11,
		padding: "4px 10px",
		borderRadius: 5,
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
	const yourAvg = avgFee(feeLevels);
	const makerAvg = avgFee(makerFees.levels);
	const prevM = mHist.length > 1 ? mHist[mHist.length - 2] : mm.M;
	const mArrow = mm.M > prevM + 1e-9 ? "↑" : mm.M < prevM - 1e-9 ? "↓" : "·";

	// —— partner highlighting: dollars paired within your book ——
	const tip = feeHover ?? feePinned;
	const tipLv = tip != null ? feeLevels[tip] : null;
	const tipBk = tipLv?.bk ?? null;
	const tipFeeY = tipBk ? yFeeUp(tipBk.final) : null;
	const makerTipBk =
		makerHover != null ? (makerFees.levels[makerHover]?.bk ?? null) : null;
	let pairSlices: { i: number; from: number; to: number }[] = [];
	if (tipLv && tipBk && tipLv.side !== "mid") {
		const offset = new Map<number, number>();
		const sameSide = feeLevels
			.filter((l) => l.side === tipLv.side && l.size > 0 && l.bk)
			.sort((a, b) =>
				tipLv.side === "bid" ? b.price - a.price : a.price - b.price,
			);
		for (const l of sameSide) {
			if (l.i === tipLv.i) break;
			for (const pr of l.bk?.pairs ?? [])
				offset.set(pr.price, (offset.get(pr.price) ?? 0) + pr.paired);
		}
		pairSlices = tipBk.pairs.flatMap((pr) => {
			const partner = feeLevels.find(
				(l) =>
					l.side !== tipLv.side &&
					l.side !== "mid" &&
					Math.abs(l.price - pr.price) < 1e-9,
			);
			if (!partner) return [];
			const from = offset.get(pr.price) ?? 0;
			return [{ i: partner.i, from, to: from + pr.paired }];
		});
	}
	const involved = new Set(pairSlices.map((sl) => sl.i));
	if (tip != null) involved.add(tip);
	const dimIf = (i: number) => (tip != null && !involved.has(i) ? 0.35 : 1);

	const barTrans = playing
		? { transition: "y 380ms ease-out, height 380ms ease-out" }
		: {};

	// M sparkline
	const sparkPts = (() => {
		if (mHist.length < 2) return "";
		const lo = Math.min(...mHist);
		const hi = Math.max(...mHist);
		const span = Math.max(hi - lo, 0.00001);
		return mHist
			.map(
				(v, k) =>
					`${(k / (mHist.length - 1)) * 110},${22 - ((v - lo) / span) * 20}`,
			)
			.join(" ");
	})();

	return (
		<div class="sf-lab" style={{ color: C.text }}>
			{/* chart panel */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "6px 4px 2px",
					position: "relative",
				}}
			>
				<div
					style={{
						textAlign: "center",
						fontFamily: mono,
						fontSize: 13.5,
						letterSpacing: "0.08em",
						color: C.text,
						padding: "10px 0 4px",
					}}
				>
					MULTI MAKER BATCH AUCTION FEES
				</div>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
						gap: "10px 16px",
						margin: "0 10px",
						padding: "10px 4px 8px",
						borderTop: `1px solid ${C.line}`,
					}}
				>
					<Param
						name="Typical trade · T"
						val={T}
						set={touch("T", T, setT)}
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
						hint="Taker rate. Every fee's ceiling."
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
						display: "flex",
						flexWrap: "wrap",
						gap: "10px 14px",
						alignItems: "flex-start",
						justifyContent: "space-between",
						margin: "0 10px",
						padding: "6px 4px 6px",
						borderTop: `1px solid ${C.line}`,
					}}
				>
					<Param
						name="Makers depth"
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
						name="Makers lean"
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
						name="Makers spread"
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
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 4,
							minWidth: 150,
						}}
					>
						<span style={label}>Makers book</span>
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
								onClick={() => {
									setMakerSizes(Array(N).fill(0));
									setYourSizes(Array(N).fill(0));
									setScenario(null);
									setPlaying(false);
								}}
								style={{
									...btn(false),
									background: "transparent",
									color: C.faint,
								}}
							>
								Clear
							</button>
							<button type="button" onClick={startStop} style={btn(playing)}>
								{playing ? "❚❚ Pause" : "▶ Play"}
							</button>
						</div>
						<span style={{ fontSize: 11, color: C.faint, lineHeight: 1.45 }}>
							Play lets their book wander; watch M drift.
						</span>
					</div>
				</div>

				{/* market readout */}
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "12px 30px",
						alignItems: "flex-start",
						background: C.inset,
						border: `1px solid ${C.line}`,
						borderRadius: 6,
						margin: "6px 10px 14px",
						padding: "11px 16px",
					}}
				>
					<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
						<span style={label}>Mark</span>
						<span style={{ fontFamily: mono, fontSize: 12, color: C.mark }}>
							M {fmtPx(mm.M)} {mArrow}
						</span>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
						<span style={label}>M drift</span>
						<svg width="110" height="24" aria-hidden="true">
							<title>Recent M history</title>
							{sparkPts && (
								<polyline
									points={sparkPts}
									fill="none"
									strokeWidth="1.5"
									style={{ stroke: C.mark }}
								/>
							)}
						</svg>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
						<span style={label}>Your voice in M</span>
						<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
							bid {yourShareBid.toFixed(0)}% · ask {yourShareAsk.toFixed(0)}%
						</span>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
						<span style={label}>Avg fee if swept</span>
						<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
							you {yourAvg != null ? fmtBp(yourAvg, 1) : "–"} · makers{" "}
							{makerAvg != null ? fmtBp(makerAvg, 1) : "–"}
						</span>
					</div>
					{effect && (
						<div
							class="sf-effect"
							style={{
								display: "flex",
								gap: 8,
								alignItems: "flex-start",
								flex: "1 1 240px",
								minWidth: 200,
							}}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
								style={{
									display: "inline",
									color: C.hint,
									flex: "0 0 auto",
									marginTop: 2,
								}}
							>
								<path d="M9 18h6" />
								<path d="M10 22h4" />
								<path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
							</svg>
							<span
								style={{
									fontSize: 12.5,
									color: effect.warn ? C.danger : C.text,
									lineHeight: 1.5,
								}}
							>
								{effect.t}
							</span>
						</div>
					)}
				</div>

				<div style={{ position: "relative" }}>
					{/* zoom control above the right axis: view only — the books and M never change */}
					<div
						style={{
							position: "absolute",
							top: 0,
							right: 6,
							display: "flex",
							alignItems: "center",
							gap: 4,
						}}
					>
						<button
							type="button"
							disabled={zoom >= ZOOM_HALVES.length - 1}
							onClick={() =>
								setZoom((z) => Math.min(ZOOM_HALVES.length - 1, z + 1))
							}
							title="Zoom out: show more of the book"
							aria-label="Zoom out"
							style={{
								...btn(false),
								padding: "4px 7px",
								opacity: zoom >= ZOOM_HALVES.length - 1 ? 0.35 : 1,
								cursor: zoom >= ZOOM_HALVES.length - 1 ? "default" : "pointer",
							}}
						>
							<ZoomIcon />
						</button>
						<span
							style={{
								fontFamily: mono,
								fontSize: 10.5,
								color: C.faint,
								width: 54,
								textAlign: "center",
							}}
						>
							±{viewHalf % 2 ? (viewHalf / 2).toFixed(1) : viewHalf / 2}bps
						</span>
						<button
							type="button"
							disabled={zoom === 0}
							onClick={() => setZoom((z) => Math.max(0, z - 1))}
							title="Zoom in"
							aria-label="Zoom in"
							style={{
								...btn(false),
								padding: "4px 7px",
								opacity: zoom === 0 ? 0.35 : 1,
								cursor: zoom === 0 ? "default" : "pointer",
							}}
						>
							<ZoomIcon plus />
						</button>
					</div>
					<svg
						viewBox={`0 0 ${W} ${H}`}
						style={{ width: "100%", display: "block", touchAction: "none" }}
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
							const side = sideOf(i);
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
										style={{ cursor: "pointer" }}
										onPointerMove={(e) => onBodyMove(e, i)}
										onPointerLeave={() => {
											setFeeHover(null);
											setMakerHover(null);
										}}
										onClick={(e) => {
											if (halfAt(e) === "you") togglePin(i);
										}}
										onDblClick={() => {
											if (i === CENTER)
												setCenterSide((cs) => (cs === "bid" ? "ask" : "bid"));
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
										onPointerEnter={() => setFeeHover(lv?.bk ? i : null)}
										onPointerLeave={() => setFeeHover(null)}
										onPointerDown={(e) => onDown(e, i, "you")}
										onPointerMove={onMove}
										onPointerUp={(e) => onUp(e, i)}
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
											setMakerHover(makerFees.levels[i]?.bk ? i : null)
										}
										onPointerLeave={() => setMakerHover(null)}
										onPointerDown={(e) => onDown(e, i, "makers")}
										onPointerMove={onMove}
										onPointerUp={(e) => onUp(e, i)}
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
											opacity={0.85 * dimIf(i)}
											rx={2}
											pointerEvents="none"
											strokeWidth={tip === i ? 1.5 : 0}
											style={{
												fill: side === "bid" ? C.bid : C.ask,
												stroke: tip === i ? C.text : "none",
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
											opacity={0.45}
											rx={2}
											pointerEvents="none"
											style={{
												fill: side === "bid" ? C.bid : C.ask,
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
								r={makerHover === l.i ? 4.5 : 3}
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
								r={feeHover === l.i || feePinned === l.i ? 5.5 : 4}
								strokeWidth={1.5}
								pointerEvents="none"
								style={{ fill: C.fee, stroke: C.panel }}
							/>
						))}
						{feePts.map((l) => (
							// biome-ignore lint/a11y/useSemanticElements: SVG hit area, a real <button> cannot exist inside <svg>
							<circle
								key={l.i}
								cx={xAt(l.i)}
								cy={yFeeUp(l.bk?.final ?? 0)}
								r={13}
								fill="transparent"
								role="button"
								tabIndex={0}
								aria-label={`Pin fee details for ${fmtPx(l.price)}`}
								onPointerEnter={() => setFeeHover(l.i)}
								onPointerLeave={() => setFeeHover(null)}
								onClick={() => togglePin(l.i)}
								onKeyDown={(e) => {
									if (e.key === "Enter") togglePin(l.i);
								}}
								style={{ cursor: "pointer" }}
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
													i === CENTER
														? centerSide === "bid"
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

						{/* key */}
						<g pointerEvents="none" style={{ fontFamily: mono }}>
							<rect
								x={150}
								y={PB + 40}
								width={14}
								height={14}
								rx={2}
								style={{ fill: C.bid }}
							/>
							<text
								x={171}
								y={PB + 53}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Your Bids ↑
							</text>
							<rect
								x={318}
								y={PB + 40}
								width={14}
								height={14}
								rx={2}
								style={{ fill: C.ask }}
							/>
							<text
								x={339}
								y={PB + 53}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Your Asks ↑
							</text>
							<rect
								x={486}
								y={PB + 40}
								width={14}
								height={14}
								rx={2}
								opacity={0.45}
								style={{ fill: C.bid }}
							/>
							<rect
								x={493}
								y={PB + 40}
								width={14}
								height={14}
								rx={2}
								opacity={0.45}
								style={{ fill: C.ask }}
							/>
							<text
								x={514}
								y={PB + 53}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Aggregate Makers ↓
							</text>
							<circle
								cx={157}
								cy={PB + 72}
								r={6}
								strokeWidth={1}
								style={{ fill: C.fee, stroke: C.panel }}
							/>
							<text
								x={170}
								y={PB + 78}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Your Fee if Filled
							</text>
							<circle
								cx={420}
								cy={PB + 72}
								r={6}
								strokeWidth={1.5}
								style={{ fill: C.panel, stroke: C.fee }}
							/>
							<text
								x={433}
								y={PB + 78}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Makers Fee if Filled
							</text>
							<text
								x={W / 2}
								y={PB + 104}
								textAnchor="middle"
								fontSize={12.5}
								style={{ fill: C.faint, fontFamily: mono, fontStyle: "italic" }}
							>
								Instructions: Drag a bar's outer edge to resize it. Hover a bar
								for its fee, <tspan style={{ fill: C.mark }}>M</tspan> for the
								walk. Double-click 100.000 to flip its side.
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
								{mm.frozen ? " ❄" : ""}
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
								const rows = mm.frozen
									? [
											{ t: "M frozen: no two-sided size to walk", c: C.text },
											{ t: `showing last computed M ${fmtPx(mm.M)}`, c: C.dim },
										]
									: [
											{ t: "M: the communal mark", c: C.dim },
											{
												t: `sell walk → ${mm.iBid != null ? fmtPx(mm.iBid) : "–"} · you ${yourShareBid.toFixed(0)}%`,
												c: C.bid,
											},
											{
												t: `buy walk → ${mm.iAsk != null ? fmtPx(mm.iAsk) : "–"} · you ${yourShareAsk.toFixed(0)}%`,
												c: C.ask,
											},
											{ t: `M = midpoint = ${fmtPx(mm.M)}`, c: C.mark },
											{
												t: `impact spread ${
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

						{/* fee receipt: rendered in the makers' half, opposite what
					    it inspects */}
						{(feeHover ?? feePinned) != null &&
							!mHover &&
							(() => {
								const tipI = feeHover ?? feePinned;
								if (tipI == null) return null;
								const lv = feeLevels[tipI];
								const b = lv?.bk;
								if (!lv || !b || lv.side === "mid") return null;
								const d = Math.max(
									0,
									(lv.side === "bid"
										? fees.edgeBid - lv.price
										: lv.price - fees.edgeAsk) / BP,
								);
								const dist = Math.abs(lv.price - mm.M) / BP;
								const net = dist - b.final;
								interface TipRow {
									label?: string;
									t?: string;
									c?: string;
									s?: number;
									gap?: number;
									indent?: number;
									rule?: boolean;
								}
								const rows: TipRow[] = [];
								const amt$ = (v: number, sign = "") =>
									`${(sign + v.toFixed(2)).padStart(6)}bps`;
								rows.push({
									label: "BASE FEE",
									t:
										b.own > 0
											? `${amt$(b.own)} · ${d.toFixed(2)}bps Outside the Band`
											: `${amt$(0)} · Inside the Band`,
									c: C.text,
								});
								const items: { amt: number; t: string; c: string }[] = [];
								const atOrInside = b.pairs
									.filter((pr) => pr.stamp <= b.own)
									.reduce((sum, pr) => sum + pr.paired, 0);
								if (atOrInside > 0)
									items.push({
										amt: 0,
										t: `${amt$(0, "+")} · ${Math.round((atOrInside / b.q) * 100)}% ≤ Base Fee`,
										c: C.dim,
									});
								for (const pr of b.pairs) {
									const extra = Math.max(0, pr.stamp - b.own);
									if (extra <= 0) continue;
									const pct = Math.round((pr.paired / b.q) * 100);
									const amt = (pr.paired / b.q) * extra;
									items.push({
										amt,
										t: `${amt$(amt, "+")} · ${pct}% @ ${extra.toFixed(2)}bps > Base Fee`,
										c: C.text,
									});
								}
								if (b.unpaired > 0) {
									const pct = Math.round((b.unpaired / b.q) * 100);
									const amt = (b.unpaired / b.q) * (F - b.own);
									items.push({
										amt,
										t: `${amt$(amt, "+")} · ${pct}% directional → taker rate`,
										c: C.ask,
									});
								}
								items.forEach((it, kk) => {
									rows.push({
										label: kk === 0 ? "SURCHARGES" : "",
										t: it.t,
										c: it.c,
									});
								});
								if (b.claimedBefore > 0 && b.unpaired > 0)
									rows.push({
										label: "",
										t: "(better-priced bars claimed the pairing first)",
										c: C.faint,
										s: 12.5,
									});
								rows.push({
									label: "TOTAL FEE",
									t: amt$(b.final),
									c: C.fee,
									gap: 6,
								});
								rows.push({ rule: true, gap: 8 });
								rows.push({
									label: "NET EDGE",
									t: `${amt$(Math.abs(net), net >= 0 ? "+" : "−")} = ${dist.toFixed(2)}bps − ${fmtBp(b.final)}`,
									c: C.text,
									gap: 2,
								});
								rows.push({
									label: "",
									indent: 101,
									t: "(M Distance − Total Fee)",
									c: C.faint,
									s: 12,
								});
								if (feePinned === tipI && feeHover == null)
									rows.push({
										t: "pinned. Click the dot again or press Esc",
										c: C.faint,
										s: 11.5,
										gap: 7,
									});
								let yAcc = 24;
								const placed = rows.map((r) => {
									yAcc += r.gap ?? 0;
									const y = yAcc;
									yAcc += 19;
									return { ...r, y };
								});
								const h = yAcc - 2;
								const xT = W / 2;
								const yT = PB - h - 10;
								return (
									<g
										pointerEvents={
											feePinned === tipI && feeHover == null ? "auto" : "none"
										}
										style={{ userSelect: "text" }}
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
											) : (
												<g key={`${r.t}${r.y}`}>
													{r.label ? (
														<text
															x={xT - 228}
															y={yT + r.y}
															fontSize={12}
															letterSpacing="0.08em"
															style={{ fill: C.faint, fontFamily: mono }}
														>
															{r.label}
														</text>
													) : null}
													<text
														x={
															(r.label !== undefined ? xT - 124 : xT - 228) +
															(r.indent ?? 0)
														}
														y={yT + r.y}
														fontSize={r.s ?? 14}
														style={{
															fill: r.c,
															fontFamily: mono,
															whiteSpace: "pre",
														}}
													>
														{r.t}
													</text>
												</g>
											),
										)}
									</g>
								);
							})()}
					</svg>
				</div>
			</div>

			{/* scenarios */}
			<div
				style={{
					display: "flex",
					gap: 6,
					flexWrap: "wrap",
					margin: "10px 2px 0",
				}}
			>
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
					onClick={() => setScenario(null)}
					style={{ ...btn(scenario === null), flex: "1 1 auto" }}
				>
					Custom
				</button>
			</div>
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "10px 14px",
					margin: "8px 0 0",
					fontSize: 14,
					lineHeight: 1.6,
					color: C.dim,
				}}
			>
				{scenario
					? SCENARIOS.find((sc) => sc.key === scenario)?.blurb
					: "Custom setup, yours to shape. Drag bars and dials freely; pick a scenario to reset."}
			</div>
		</div>
	);
}
