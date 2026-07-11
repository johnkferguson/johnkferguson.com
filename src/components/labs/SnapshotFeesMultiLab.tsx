import { useEffect, useMemo, useRef, useState } from "react";
import {
	type BookLevel,
	BP,
	computeAccountFees,
	computeMultiMark,
	type Side,
} from "../../lib/snapshot-fees/engine";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — multi-maker laboratory: you and the Aggregate Makers.
// Your book sets your fees; the communal Mark sets the yardstick. Your
// voice in the Mark is the two-sided, near-the-touch size you stand.
// ————————————————————————————————————————————————————————————————

const N = 21;
const CENTER = 10;
const TICK = 0.005;
const MAX_DEPTH = 60000; // $ per level, you + aggregate stacked
const YOUR_MAX = 25000;
const STEP_DOLLARS = 250;

const priceAt = (i: number) => +(100 + (i - CENTER) * TICK).toFixed(3);
const sideAt = (i: number): Side =>
	i < CENTER ? "bid" : i > CENTER ? "ask" : "mid";

// Aggregate Makers ladder, outward from CENTER ± spread
const AGG_LADDER = [6000, 7000, 8000, 9000, 10000, 11000];
const aggSizesOf = (depth: number, leanPct: number, spread: number) => {
	const a = Array(N).fill(0);
	const lean = leanPct / 100;
	AGG_LADDER.forEach((v, k) => {
		const bi = CENTER - spread - k;
		const ai = CENTER + spread + k;
		if (bi >= 0)
			a[bi] =
				Math.round((v * depth * (1 + lean)) / STEP_DOLLARS) * STEP_DOLLARS;
		if (ai <= N - 1)
			a[ai] =
				Math.round((v * depth * (1 - lean)) / STEP_DOLLARS) * STEP_DOLLARS;
	});
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
			"You and the aggregate makers stand comparable size near the touch, so the walk consumes from both of you pro-rata and the Mark splits the difference. Check your share of each walk below.",
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
	S: {
		up: "Wider band: more placement counts as standard and trades free.",
		down: "Tighter band: precision is judged more strictly.",
	},
	F: {
		up: "Higher cap: directional fills pay more, and the cap line rises.",
		down: "Lower cap: even fully directional fills pay less.",
	},
	T: {
		up: "Bigger measuring trade: the walk reaches deeper, so more of the book gets a vote.",
		down: "Smaller measuring trade: only the nearest size votes on M.",
	},
	k: {
		up: "Steeper: each bps outside the band costs more; full fee arrives closer to M.",
		down: "Gentler: width is taxed less; full fee moves further out.",
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
}: ParamProps) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 128,
				maxWidth: 150,
			}}
		>
			<span style={label}>{name}</span>
			<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
				<input
					type="range"
					min={min}
					max={max}
					step={stp}
					value={val}
					onChange={(e) => set(+(e.currentTarget as HTMLInputElement).value)}
					style={{ width: 84, accentColor: "var(--lab-slider)" }}
				/>
				<span
					style={{
						fontFamily: mono,
						fontSize: 12,
						color: C.text,
						whiteSpace: "nowrap",
					}}
				>
					{fmt ? fmt(val) : val + (suffix || "")}
				</span>
			</div>
			{hint && (
				<span style={{ fontSize: 11, color: C.faint, lineHeight: 1.45 }}>
					{hint}
				</span>
			)}
		</div>
	);
}

interface DragState {
	i: number;
	y0: number;
	v0: number;
	moved: boolean;
}

export default function SnapshotFeesMultiLab() {
	const [S, setS] = useState(2);
	const [T, setT] = useState(20000);
	const [F, setF] = useState(15);
	const [slope, setSlope] = useState(0.8);
	const [depth, setDepth] = useState(SCENARIOS[0].depth);
	const [lean, setLean] = useState(SCENARIOS[0].lean);
	const [spread, setSpread] = useState(SCENARIOS[0].spread);
	const [yourSizes, setYourSizes] = useState<number[]>(() =>
		SCENARIOS[0].you(),
	);
	const [scenario, setScenario] = useState<string | null>(SCENARIOS[0].key);
	const [effect, setEffect] = useState<{ t: string; warn: boolean } | null>(
		null,
	);
	const [sel, setSel] = useState(CENTER - 1);
	const [mHover, setMHover] = useState(false);
	const [feeHover, setFeeHover] = useState<number | null>(null);
	const [feePinned, setFeePinned] = useState<number | null>(null);
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);

	const model = useMemo(() => {
		const yourBook: BookLevel[] = yourSizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideAt(i),
			size,
		}));
		const aggSizes = aggSizesOf(depth, lean, spread);
		const aggBook: BookLevel[] = aggSizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideAt(i),
			size,
		}));
		const mm = computeMultiMark(
			[
				{ id: "you", levels: yourBook },
				{ id: "agg", levels: aggBook },
			],
			{ S, T },
			lastM.current,
		);
		const fees = computeAccountFees(
			yourBook,
			{ S, T, F, slope, expo: 1, comp: 0 },
			mm.M,
		);
		return { yourBook, aggSizes, mm, fees };
	}, [yourSizes, depth, lean, spread, S, T, F, slope]);

	const { mm, fees, aggSizes } = model;

	useEffect(() => {
		if (!mm.frozen) lastM.current = mm.M;
	}, [mm.M, mm.frozen]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFeePinned(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// —— chart geometry ——
	const W = 960;
	const H = 520;
	const PL = 84;
	const PR = 884;
	const PT = 58;
	const PB = 418;
	const AXIS_Y = PB + 4;
	const step = (PR - PL) / (N - 1);
	const xAt = (i: number) => PL + i * step;
	const xOfPrice = (p: number) => PL + ((p - priceAt(0)) / TICK) * step;
	const barW = step * 0.6;
	const depthTop = PT;
	const yDepth = (v: number) =>
		Math.max(PT, PB - (v / MAX_DEPTH) * (PB - depthTop));
	const feeMax = 25;
	const yFee = (v: number) => PB - (v / feeMax) * (PB - PT);

	// —— drag / select on your book ——
	const onDown = (e: PointerEvent, i: number) => {
		if (i === CENTER) return;
		(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
		drag.current = { i, y0: e.clientY, v0: yourSizes[i], moved: false };
	};
	const onMove = (e: PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dy = d.y0 - e.clientY;
		if (Math.abs(dy) > 4 && !d.moved) {
			d.moved = true;
			setScenario(null);
		}
		if (!d.moved) return;
		const perPx = MAX_DEPTH / (PB - depthTop);
		let v = d.v0 + dy * perPx;
		v = Math.max(
			0,
			Math.min(YOUR_MAX, Math.round(v / STEP_DOLLARS) * STEP_DOLLARS),
		);
		setYourSizes((s) =>
			s[d.i] === v ? s : s.map((x, k) => (k === d.i ? v : x)),
		);
	};
	const onUp = (_e: PointerEvent, i: number) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved) setSel(i === CENTER ? sel : i);
		else if (d) setSel(d.i);
	};

	const applyScenario = (sc: Scenario) => {
		setYourSizes(sc.you());
		setDepth(sc.depth);
		setLean(sc.lean);
		setSpread(sc.spread);
		setS(2);
		setT(20000);
		setF(15);
		setSlope(0.8);
		setEffect(null);
		setScenario(sc.key);
	};
	const touch =
		(dial: keyof typeof DIAL_EFFECT, cur: number, fn: (v: number) => void) =>
		(v: number) => {
			fn(v);
			setScenario(null);
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
	const selLv = feeLevels[sel];
	const bk = selLv?.bk;
	const selFeeY = bk ? yFee(bk.final) : null;
	const feePts = feeLevels.filter((l) => l.size > 0 && l.side !== "mid");
	const feePath = feePts
		.map((l, k) => `${k ? "L" : "M"}${xAt(l.i)},${yFee(l.bk?.final ?? 0)}`)
		.join(" ");

	// walk consumption per level, both entities combined
	const usedTotal = new Map<number, number>();
	for (const id of ["you", "agg"]) {
		for (const [i, v] of mm.used.get(id) ?? []) {
			usedTotal.set(i, (usedTotal.get(i) ?? 0) + v);
		}
	}
	const yourShareBid = (mm.shareBid.get("you") ?? 0) * 100;
	const yourShareAsk = (mm.shareAsk.get("you") ?? 0) * 100;

	// —— partner highlighting within your book ——
	const tip = feeHover ?? feePinned;
	const tipLv = tip != null ? feeLevels[tip] : null;
	const tipBk = tipLv?.bk ?? null;
	let matchSlices: { i: number; from: number; to: number }[] = [];
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
				offset.set(pr.price, (offset.get(pr.price) ?? 0) + pr.matched);
		}
		matchSlices = tipBk.pairs.flatMap((pr) => {
			const partner = feeLevels.find(
				(l) =>
					l.side !== tipLv.side &&
					l.side !== "mid" &&
					Math.abs(l.price - pr.price) < 1e-9,
			);
			if (!partner) return [];
			const from = offset.get(pr.price) ?? 0;
			return [{ i: partner.i, from, to: from + pr.matched }];
		});
	}
	const involved = new Set(matchSlices.map((sl) => sl.i));
	if (tip != null) involved.add(tip);
	const dimIf = (i: number) => (tip != null && !involved.has(i) ? 0.35 : 1);

	return (
		<div class="sf-lab" style={{ color: C.text }}>
			{/* header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					flexWrap: "wrap",
					gap: 8,
					marginBottom: 10,
				}}
			>
				<div>
					<div style={{ ...label, color: C.fee }}>
						Liquidity Standard · multi-maker lab
					</div>
					<div
						style={{
							fontFamily: mono,
							fontSize: 20,
							fontWeight: 600,
							marginTop: 2,
						}}
					>
						The Communal Mark
					</div>
				</div>
			</div>

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
						display: "flex",
						flexWrap: "wrap",
						gap: "10px 14px",
						alignItems: "flex-start",
						justifyContent: "space-between",
						margin: "0 10px",
						padding: "8px 4px 6px",
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
						name="Spread standard · S"
						val={S}
						set={touch("S", S, setS)}
						min={1}
						max={10}
						stp={0.5}
						suffix="bps"
						hint="The free band, M ± S/2."
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
						name="Fee Slope · k"
						val={slope}
						set={touch("k", slope, setSlope)}
						min={0.25}
						max={3}
						stp={0.05}
						suffix="×"
						hint="Fee per bps outside the band."
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
						set={touch("depth", depth, setDepth)}
						min={0}
						max={3}
						stp={0.1}
						suffix="×"
						hint="How much size the aggregate makers stand."
					/>
					<Param
						name="Makers lean"
						val={lean}
						set={touch("lean", lean, setLean)}
						min={-90}
						max={90}
						stp={5}
						fmt={(v) => `${v > 0 ? "+" : ""}${v}%`}
						hint="Their bid/ask imbalance."
					/>
					<Param
						name="Makers spread"
						val={spread}
						set={touch("spread", spread, setSpread)}
						min={1}
						max={6}
						stp={1}
						fmt={(v) => `${v} tick${v > 1 ? "s" : ""}`}
						hint="How far from mid their ladder starts."
					/>
				</div>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "12px 34px",
						alignItems: "flex-start",
						background: C.inset,
						border: `1px solid ${C.line}`,
						borderRadius: 6,
						margin: "6px 10px 14px",
						padding: "11px 16px",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 3,
							flex: "0 0 auto",
						}}
					>
						<span style={label}>Your voice in M</span>
						<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
							bid walk {yourShareBid.toFixed(0)}% · ask walk{" "}
							{yourShareAsk.toFixed(0)}%
						</span>
					</div>
					{effect && (
						<div
							class="sf-effect"
							style={{
								display: "flex",
								gap: 8,
								alignItems: "flex-start",
								flex: "1 1 260px",
								minWidth: 220,
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

				<svg
					viewBox={`0 0 ${W} ${H}`}
					style={{ width: "100%", display: "block", touchAction: "none" }}
					role="img"
					aria-label="Stacked order book: your quotes plus the aggregate makers, with the communal Mark and your fee curve"
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

					{/* fee gridlines */}
					{[0, 5, 10, 15, 20, 25].map((v) => (
						<g key={v}>
							<line
								x1={PL}
								x2={PR}
								y1={yFee(v)}
								y2={yFee(v)}
								strokeWidth={1}
								style={{ stroke: C.grid }}
							/>
							{(selFeeY == null || Math.abs(yFee(v) - selFeeY) > 13) && (
								<text
									x={PL - 18}
									y={yFee(v) + 4.5}
									textAnchor="end"
									fontSize={13}
									style={{ fill: C.faint, fontFamily: mono }}
								>
									{v.toFixed(2)}
								</text>
							)}
						</g>
					))}
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
						y={(depthTop + PB) / 2}
						fontSize={12}
						transform={`rotate(90 ${W - 10} ${(depthTop + PB) / 2})`}
						textAnchor="middle"
						letterSpacing="0.12em"
						style={{ fill: C.dim, fontFamily: mono }}
					>
						DEPTH · $
					</text>
					{[0, 15000, 30000, 45000, 60000].map((v) => (
						<text
							key={v}
							x={PR + 18}
							y={yDepth(v) + 4.5}
							fontSize={13}
							style={{ fill: C.faint, fontFamily: mono }}
						>
							{v / 1000}k
						</text>
					))}
					{F < feeMax && (
						<g pointerEvents="none">
							<line
								x1={PL}
								x2={PR}
								y1={yFee(F)}
								y2={yFee(F)}
								strokeDasharray="4 4"
								opacity={0.45}
								style={{ stroke: C.fee }}
							/>
							<text
								x={PR - 5}
								y={yFee(F) - 5}
								textAnchor="end"
								fontSize={11.5}
								opacity={0.8}
								style={{ fill: C.fee, fontFamily: mono }}
							>
								cap F
							</text>
						</g>
					)}

					{/* band */}
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

					{/* fixed center */}
					<line
						x1={xAt(CENTER)}
						x2={xAt(CENTER)}
						y1={PT}
						y2={PB}
						strokeWidth={1}
						style={{ stroke: C.line }}
					/>

					{/* stacked bars: yours solid below, aggregate muted above */}
					{yourSizes.map((yv, i) => {
						const side = sideAt(i);
						if (side === "mid") return null;
						const av = aggSizes[i];
						const tot = yv + av;
						const consumed = usedTotal.get(i) ?? 0;
						const lv = feeLevels[i];
						return (
							<g key={priceAt(i)}>
								<rect
									x={xAt(i) - step / 2}
									y={PT}
									width={step}
									height={PB - PT}
									fill="transparent"
									style={{ cursor: "ns-resize" }}
									onPointerDown={(e) => onDown(e, i)}
									onPointerMove={onMove}
									onPointerUp={(e) => onUp(e, i)}
									onPointerCancel={() => {
										drag.current = null;
									}}
								/>
								{av > 0 && (
									<rect
										x={xAt(i) - barW / 2}
										y={yDepth(av)}
										width={barW}
										height={PB - yDepth(av)}
										opacity={0.3 * dimIf(i)}
										rx={2}
										pointerEvents="none"
										style={{ fill: side === "bid" ? C.bid : C.ask }}
									/>
								)}
								{yv > 0 && (
									<rect
										x={xAt(i) - barW / 2}
										y={yDepth(tot)}
										width={barW}
										height={Math.max(
											0,
											yDepth(av) - yDepth(tot) - (av > 0 ? 1 : 0),
										)}
										opacity={0.85 * dimIf(i)}
										rx={2}
										pointerEvents="none"
										strokeWidth={sel === i ? 1.5 : 0}
										style={{
											fill: side === "bid" ? C.bid : C.ask,
											stroke: sel === i ? C.text : "none",
										}}
									/>
								)}
								{consumed > 0 && (
									<rect
										x={xAt(i) - barW / 2}
										y={yDepth(consumed)}
										width={barW}
										height={Math.max(0, PB - yDepth(consumed))}
										strokeWidth={1.25}
										rx={2}
										opacity={dimIf(i)}
										pointerEvents="none"
										style={{ fill: C.markSlice, stroke: C.mark }}
									/>
								)}
								{yv > 0 && lv?.bk && lv.bk.unpaired > 0 && (
									<rect
										x={xAt(i) - barW / 2}
										y={yDepth(tot)}
										width={barW}
										height={Math.max(
											0,
											yDepth(tot - lv.bk.unpaired) - yDepth(tot),
										)}
										fill="url(#sfm-hatch)"
										rx={2}
										opacity={dimIf(i)}
										pointerEvents="none"
									/>
								)}
								{yv === 0 && av === 0 && (
									<line
										x1={xAt(i) - barW / 2}
										x2={xAt(i) + barW / 2}
										y1={PB}
										y2={PB}
										strokeWidth={2}
										pointerEvents="none"
										opacity={0.45}
										style={{ stroke: side === "bid" ? C.bid : C.ask }}
									/>
								)}
							</g>
						);
					})}

					{/* partner highlight within your book */}
					{matchSlices.map((sl) => (
						<rect
							key={sl.i}
							x={xAt(sl.i) - barW / 2}
							y={yDepth(sl.to + aggSizes[sl.i])}
							width={barW}
							height={Math.max(
								0,
								yDepth(sl.from + aggSizes[sl.i]) -
									yDepth(sl.to + aggSizes[sl.i]),
							)}
							fill="none"
							strokeWidth={1.75}
							rx={1.5}
							pointerEvents="none"
							style={{ stroke: C.text }}
						/>
					))}

					{/* selected-fee reference line */}
					{selLv && bk && (
						<g pointerEvents="none">
							<line
								x1={PL}
								x2={PR}
								y1={yFee(bk.final)}
								y2={yFee(bk.final)}
								strokeDasharray="5 5"
								strokeWidth={1}
								opacity={0.7}
								style={{ stroke: C.fee, transition: "all 150ms" }}
							/>
							<text
								x={PL - 18}
								y={yFee(bk.final) + 4.5}
								textAnchor="end"
								fontSize={13}
								style={{ fill: C.fee, fontFamily: mono }}
							>
								{bk.final.toFixed(2)}
							</text>
						</g>
					)}

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
							cy={yFee(l.bk?.final ?? 0)}
							r={sel === l.i || feeHover === l.i || feePinned === l.i ? 5.5 : 4}
							strokeWidth={1.5}
							pointerEvents="none"
							style={{ fill: C.fee, stroke: C.panel }}
						/>
					))}
					{/* fee hit zones */}
					{feePts.map((l) => (
						// biome-ignore lint/a11y/useSemanticElements: SVG hit area, a real <button> cannot exist inside <svg>
						<circle
							key={l.i}
							cx={xAt(l.i)}
							cy={yFee(l.bk?.final ?? 0)}
							r={13}
							fill="transparent"
							role="button"
							tabIndex={0}
							aria-label={`Pin fee details for ${fmtPx(l.price)}`}
							onPointerEnter={() => setFeeHover(l.i)}
							onPointerLeave={() => setFeeHover(null)}
							onClick={() => setFeePinned(feePinned === l.i ? null : l.i)}
							onKeyDown={(e) => {
								if (e.key === "Enter")
									setFeePinned(feePinned === l.i ? null : l.i);
							}}
							style={{ cursor: "pointer" }}
						/>
					))}

					{/* price axis */}
					<line x1={PL} x2={PR} y1={PB} y2={PB} style={{ stroke: C.line }} />
					{yourSizes.map((_, i) => (
						<g key={priceAt(i)}>
							<line
								x1={xAt(i)}
								x2={xAt(i)}
								y1={PB}
								y2={PB + 4}
								style={{ stroke: C.faint }}
							/>
							{i % 2 === 0 && (
								<text
									x={xAt(i)}
									y={AXIS_Y + 15}
									textAnchor="middle"
									fontSize={12}
									style={{
										fill: i === CENTER ? C.text : C.faint,
										fontFamily: mono,
									}}
								>
									{fmtPx(priceAt(i))}
								</text>
							)}
						</g>
					))}

					{/* key */}
					<g pointerEvents="none" style={{ fontFamily: mono }}>
						<rect
							x={160}
							y={PB + 46}
							width={14}
							height={14}
							rx={2}
							style={{ fill: C.bid }}
						/>
						<text
							x={181}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Your Bids
						</text>
						<rect
							x={295}
							y={PB + 46}
							width={14}
							height={14}
							rx={2}
							style={{ fill: C.ask }}
						/>
						<text
							x={316}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Your Asks
						</text>
						<rect
							x={430}
							y={PB + 46}
							width={14}
							height={14}
							rx={2}
							opacity={0.3}
							style={{ fill: C.bid }}
						/>
						<rect
							x={437}
							y={PB + 46}
							width={14}
							height={14}
							rx={2}
							opacity={0.3}
							style={{ fill: C.ask }}
						/>
						<text
							x={458}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Aggregate Makers
						</text>
						<circle
							cx={660}
							cy={PB + 53}
							r={6}
							strokeWidth={1}
							style={{ fill: C.fee, stroke: C.panel }}
						/>
						<text
							x={671}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Your Fee if Filled
						</text>
						<text
							x={W / 2}
							y={PB + 90}
							textAnchor="middle"
							fontSize={12.5}
							style={{ fill: C.faint, fontFamily: mono, fontStyle: "italic" }}
						>
							Instructions: Drag your bars. Dial the aggregate makers. Hover{" "}
							<tspan style={{ fill: C.fee }}>●</tspan> for your fees. Hover{" "}
							<tspan style={{ fill: C.mark }}>M</tspan> for the communal walk.
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

					{/* M tooltip: the communal walk, with your share */}
					{mHover &&
						(() => {
							const xT = Math.min(Math.max(xOfPrice(mm.M), PL + 175), PR - 175);
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

					{/* fee tooltip: itemized receipt, fixed top-center slot */}
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
								.reduce((sum, pr) => sum + pr.matched, 0);
							if (atOrInside > 0)
								items.push({
									amt: 0,
									t: `${amt$(0, "+")} · ${Math.round((atOrInside / b.q) * 100)}% ≤ Base Fee`,
									c: C.dim,
								});
							for (const pr of b.pairs) {
								const extra = Math.max(0, pr.stamp - b.own);
								if (extra <= 0) continue;
								const pct = Math.round((pr.matched / b.q) * 100);
								const amt = (pr.matched / b.q) * extra;
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
									t: "(better-priced bars claimed the matches first)",
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
							const yT = PT + 8;
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
						style={btn(scenario === sc.key)}
					>
						{sc.title}
					</button>
				))}
				<button
					type="button"
					onClick={() => setScenario(null)}
					style={btn(scenario === null)}
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
