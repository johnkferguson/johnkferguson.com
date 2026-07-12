import { useEffect, useMemo, useRef, useState } from "react";
import {
	type BookLevel,
	BP,
	computeModel,
	type Side,
} from "../../lib/snapshot-fees/engine";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — single-maker laboratory
// Levels: 100.00 ± 0.005 steps. 1bp = $0.01 (price ≈ $100 reference).
// Bid side left of center, ask side right. Mark M floats; center is fixed.
// Mechanism lives in src/lib/snapshot-fees/engine.ts — this file only renders.
// ————————————————————————————————————————————————————————————————

const N = 41; // levels
const CENTER = 20; // index of 100.00
// zoom steps: ticks visible either side of 100.00 (view only, never the book)
const ZOOM_HALVES = [10, 15, 20];
const TICK = 0.005; // $ per level
const MAX_DEPTH = 25000; // $ per level
const STEP_DOLLARS = 250;
// Window W: the Mark's absolute working radius, bps — eligibility range,
// walk truncation, and boundary-fill price. Fixed for now; a dial (with k₂)
// belongs to the advanced set.
const WINDOW_BPS = 8;

const priceAt = (i: number) => +(100 + (i - CENTER) * TICK).toFixed(3);
// 100.000 (i = CENTER) is a quotable bid; asks start one tick above.
const sideAt = (i: number): Side => (i <= CENTER ? "bid" : "ask");

interface Scenario {
	key: string;
	title: string;
	blurb: string;
	book: () => number[];
}

const bookOf = (fill: Record<number, number>): number[] => {
	const a = Array(N).fill(0);
	for (const [i, v] of Object.entries(fill)) a[+i] = v;
	return a;
};

// The guided tour: each scenario is a market condition with a caption that
// says what to notice. Tweak freely — titles, blurbs, and books are data.
const SCENARIOS: Scenario[] = [
	{
		key: "balanced",
		title: "Balanced Maker",
		blurb:
			"A mirrored ladder across every price level. Everything is matched, so each level pays only its placement: fees sit at zero near M and rise gently with distance. Even the farthest quote pays a small fraction of the taker rate. Using every price level stays cheap.",
		book: () => {
			const a = Array(N).fill(0);
			const ladder = [
				5000, 6500, 8000, 9500, 11000, 12500, 14000, 15500, 17500, 20000,
			];
			ladder.forEach((v, k) => {
				a[CENTER - 1 - k] = v;
				a[CENTER + 1 + k] = v;
			});
			return a;
		},
	},
	{
		key: "taker",
		title: "Directional Maker",
		blurb:
			"The same bid ladder, but the asks thin out toward the edge. The inner book is unchanged, so M stays put and near quotes still trade free. But the missing ask depth strands the outermost bids: whatever has no match behind it pays like a taker, and the farthest bid hits F in full. Directional size is priced as the taker it is, level by level.",
		book: () => {
			const a = Array(N).fill(0);
			const bids = [
				5000, 6500, 8000, 9500, 11000, 12500, 14000, 15500, 17500, 20000,
			];
			const asks = [
				5000, 6500, 8000, 8500, 9000, 9500, 10000, 10500, 11000, 12000,
			];
			bids.forEach((v, k) => {
				a[CENTER - 1 - k] = v;
			});
			asks.forEach((v, k) => {
				a[CENTER + 1 + k] = v;
			});
			return a;
		},
	},
	{
		key: "thin",
		title: "Thin Side, Moving Mark",
		blurb:
			"Ask depth sits far from the mid while the bids crowd it, so the measuring walk pays up to reach it: M slides toward the heavy side and the band follows, leaving every bid a touch below the new standard. Even in-band asks pay a faint echo of their partners' stamps: placement is judged against the Mark this snapshot produces, not the mid you quoted around.",
		book: () => {
			const a = Array(N).fill(0);
			const bids = [
				1500, 2000, 4000, 5500, 6200, 7000, 8000, 9700, 12000, 13200,
			];
			const asks = [
				1500, 1700, 1500, 1700, 2200, 3200, 5200, 14000, 17000, 21100,
			];
			bids.forEach((v, k) => {
				a[CENTER - 10 + k] = v;
			});
			asks.forEach((v, k) => {
				a[CENTER + 1 + k] = v;
			});
			return a;
		},
	},
	{
		key: "half",
		title: "Half-Covered",
		blurb:
			"A $10,000 bid against $5,000 of asks: half the bid is matched, half is directional, so its fee lands halfway to F. The small side is fully matched and still trades free.",
		book: () => bookOf({ [CENTER - 1]: 10000, [CENTER + 1]: 5000 }),
	},
	{
		key: "wide",
		title: "Quoting Wide",
		blurb:
			"Two-sided and fully matched, but placed outside the band, so the only charge is the stamp for imprecision. Widen S and watch the band swallow the quotes and the fees fall away.",
		book: () =>
			bookOf({
				[CENTER - 9]: 8000,
				[CENTER - 7]: 6000,
				[CENTER + 7]: 6000,
				[CENTER + 9]: 8000,
			}),
	},
	{
		key: "spill",
		title: "Spillover",
		blurb:
			"Three equal bids share one ask. The best bid claims coverage first and trades free; the middle one gets half; the last gets nothing and pays like a taker. Coverage is consumed, never reused. Hover the dots to watch it drain.",
		book: () =>
			bookOf({
				[CENTER - 1]: 6000,
				[CENTER - 2]: 6000,
				[CENTER - 3]: 6000,
				[CENTER + 1]: 9000,
			}),
	},
];

// Theme roles — resolved per light/dark mode in snapshot-fees-lab.css
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
	onAccent: "var(--lab-on-accent)",
};

const mono = "var(--lab-mono)";

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
		up: "Bigger measuring trade: it takes more size near the touch to move M.",
		down: "Smaller measuring trade: less size near the touch moves M.",
	},
	k: {
		up: "Steeper: each bps outside the band costs more; full fee arrives closer to M.",
		down: "Gentler: width is taxed less; full fee moves further out.",
	},
};

const fmt$ = (v: number) => `$${Math.round(v).toLocaleString()}`;
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
	warn,
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
					style={{
						width: 84,
						accentColor: warn ? C.danger : "var(--lab-slider)",
					}}
				/>
				<span
					style={{
						fontFamily: mono,
						fontSize: 12,
						color: warn ? C.danger : C.text,
						whiteSpace: "nowrap",
					}}
				>
					{suffix === "$" ? fmt$(val) : val + (suffix || "")}
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

export default function SnapshotFeesLab() {
	// —— market standard ——
	const [S, setS] = useState(2); // spread standard, bps
	const [T, setT] = useState(20000); // typical trade size, $
	// —— fee schedule ——
	const [F, setF] = useState(10); // cap / taker rate, bps
	const [slope, setSlope] = useState(0.8); // k: stamp bps per bp beyond edge
	const expo = 1; // stamp curvature — pinned linear; superlinear kills net edge mid-book
	const [comp, setComp] = useState(0); // inside compensation max, bps (parked module)

	const [sizes, setSizes] = useState<number[]>(() => SCENARIOS[0].book());
	const [showFormula, setShowFormula] = useState(false);
	const [scenario, setScenario] = useState<string | null>(SCENARIOS[0].key);
	const [effect, setEffect] = useState<{ t: string; warn: boolean } | null>(
		null,
	);
	const [centerSide, setCenterSide] = useState<"bid" | "ask">("bid");
	const [mHover, setMHover] = useState(false);
	const [feeHover, setFeeHover] = useState<number | null>(null);
	const [feePinned, setFeePinned] = useState<number | null>(null);
	const [zoom, setZoom] = useState(0);
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);

	const sideOf = (i: number): Side => (i === CENTER ? centerSide : sideAt(i));
	const model = useMemo(() => {
		const book: BookLevel[] = sizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideOf(i),
			size,
		}));
		return computeModel(
			book,
			{ S, T, F, W: WINDOW_BPS, slope, expo, comp },
			lastM.current,
		);
	}, [sizes, S, T, F, slope, expo, comp, sideOf]);

	useEffect(() => {
		if (!model.frozen) lastM.current = model.M;
	}, [model.M, model.frozen]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFeePinned(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// —— chart geometry ——
	// Top strip (y 0…PT) holds the Mark carriage and band-edge labels; below
	// the price axis, a key strip and instructions close the frame.
	const W = 960;
	const H = 520;
	const PL = 84;
	const PR = 884;
	const PT = 58;
	const PB = 418; // plot box
	const AXIS_Y = PB + 4;
	// inner padding keeps the outermost bars clear of both axis gutters
	const PAD = 16;
	const viewHalf = ZOOM_HALVES[zoom];
	const loI = CENTER - viewHalf;
	const inView = (i: number) => i >= loI && i <= CENTER + viewHalf;
	const labelStride = [2, 3, 4][zoom];
	const step = (PR - PL - 2 * PAD) / (viewHalf * 2);
	const xAt = (i: number) => PL + PAD + (i - loI) * step;
	const xOfPrice = (p: number) => PL + PAD + ((p - priceAt(loI)) / TICK) * step;
	const barW = step * 0.6;
	const depthTop = PT; // depth scale spans the full plot: $25k = top gridline
	const yDepth = (v: number) => PB - (v / MAX_DEPTH) * (PB - depthTop);
	const feeMin = comp > 0 ? -Math.max(0.6, comp * 1.25) : 0;
	// Fixed scale: rescaling with F made unchanged fees look like they moved.
	const feeMax = 25;
	const yFee = (v: number) =>
		PB - ((v - feeMin) / (feeMax - feeMin)) * (PB - PT);

	// —— drag / select ——
	const onDown = (e: PointerEvent, i: number) => {
		(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
		drag.current = { i, y0: e.clientY, v0: sizes[i], moved: false };
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
			Math.min(MAX_DEPTH, Math.round(v / STEP_DOLLARS) * STEP_DOLLARS),
		);
		setSizes((s) => (s[d.i] === v ? s : s.map((x, k) => (k === d.i ? v : x))));
	};
	// Selecting a scenario resets the dials so its caption stays true;
	// touching any dial (or dragging a bar) drops you into Custom.
	const applyScenario = (sc: Scenario) => {
		setSizes(sc.book());
		setCenterSide("bid");
		setEffect(null);
		setS(2);
		setT(20000);
		setF(10);
		setSlope(0.8);
		setComp(0);
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

	const togglePin = (i: number) => {
		if (!model.levels[i]?.bk) return;
		setFeePinned((p) => (p === i ? null : i));
	};

	const onUp = (_e: PointerEvent, i: number) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved) togglePin(i);
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

	// —— partner highlighting: the exact dollars matched with the hovered
	// level, located inside each partner bar via the spillover order ——
	const tip = feeHover ?? feePinned;
	const tipLv = tip != null ? model.levels[tip] : null;
	const tipBk = tipLv?.bk ?? null;
	const tipFeeY = tipBk ? yFee(tipBk.final) : null;
	let matchSlices: { i: number; from: number; to: number }[] = [];
	if (tipLv && tipBk && tipLv.side !== "mid") {
		const offset = new Map<number, number>();
		const sameSide = model.levels
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
			const partner = model.levels.find(
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

	const feePts = model.levels.filter(
		(l) => l.size > 0 && l.side !== "mid" && inView(l.i),
	);
	const feePath = feePts
		.map((l, k) => `${k ? "L" : "M"}${xAt(l.i)},${yFee(l.bk?.final ?? 0)}`)
		.join(" ");

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
						Liquidity Standard · single-maker lab
					</div>
					<div
						style={{
							fontFamily: mono,
							fontSize: 20,
							fontWeight: 600,
							marginTop: 2,
						}}
					>
						Snapshot Fees
					</div>
				</div>
				<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
					<button
						type="button"
						onClick={() => setShowFormula((v) => !v)}
						style={btn(showFormula)}
					>
						{showFormula ? "Hide the math" : "Show the math"}
					</button>
				</div>
			</div>

			{/* formulas — the full pipeline, on demand */}
			{showFormula &&
				(() => {
					const half = (S / 2).toFixed(2);
					const stampEx = (d: number) => Math.min(F, slope * d ** expo);
					const dCap = (F / slope) ** (1 / expo);
					const dMax = Math.max(6, Math.ceil(dCap) + 2);
					const pts = Array.from({ length: 41 }, (_, k) => {
						const d = (dMax * k) / 40;
						return `${10 + (d / dMax) * 150},${60 - (Math.min(F, slope * d ** expo) / F) * 48}`;
					}).join(" ");
					const row = { marginBottom: 10 };
					const eyebrow = { ...label, color: C.fee, marginRight: 10 };
					const note = {
						fontFamily: "inherit",
						fontSize: 12,
						color: C.faint,
						lineHeight: 1.5,
					};
					return (
						<div
							style={{
								background: C.panel,
								border: `1px solid ${C.line}`,
								borderRadius: 8,
								padding: "12px 16px",
								marginBottom: 12,
								fontFamily: mono,
								fontSize: 12.5,
								lineHeight: 1.6,
								overflowX: "auto",
							}}
						>
							<div style={{ ...label, marginBottom: 8 }}>
								The pipeline: general form, with your settings substituted
							</div>

							<div style={row}>
								<span style={eyebrow}>1 · Mark</span>M = (impactBid(T) +
								impactAsk(T)) / 2
								<div style={note}>
									impact price = volume-weighted price of trading $
									{T.toLocaleString()} into that side, best levels first · only
									matched size (min of your bid and ask dollars) within {W}bps
									of the touch votes; missing depth is priced at the window edge
								</div>
								{model.iBid != null && model.iAsk != null && (
									<div style={{ color: C.mark }}>
										right now: M = ({fmtPx(model.iBid)} + {fmtPx(model.iAsk)}) /
										2 = {fmtPx(model.M)}
									</div>
								)}
							</div>

							<div style={row}>
								<span style={eyebrow}>2 · Band</span>edges = M ± S/2 = M ±{" "}
								{half}bps → {fmtPx(model.edgeBid)} … {fmtPx(model.edgeAsk)}
								<div style={note}>
									the declared free zone. Placement inside it stamps at zero
								</div>
							</div>

							<div
								style={{
									...row,
									display: "flex",
									gap: 18,
									flexWrap: "wrap",
									alignItems: "flex-start",
								}}
							>
								<div style={{ flex: "1 1 320px" }}>
									<span style={eyebrow}>3 · Stamp</span>stamp(d) = min(F, slope
									× d) = min({F}, {slope} × d)
									<div style={note}>
										d = bps of placement beyond your side's edge (0 if inside).
										Slope is the price of every bps of imprecision.
									</div>
									<div style={{ color: C.text }}>
										d=1 → {fmtBp(stampEx(1))} · d=2 → {fmtBp(stampEx(2))} · d=4
										→ {fmtBp(stampEx(4))} · hits the cap at d ={" "}
										{dCap.toFixed(1)}bps
									</div>
								</div>
								<svg
									width={172}
									height={78}
									style={{ flex: "0 0 auto" }}
									role="img"
									aria-label={`Stamp curve: fee rises from 0 to the ${F}bps cap over ${dCap.toFixed(1)}bps of distance`}
								>
									<line
										x1={10}
										y1={60}
										x2={162}
										y2={60}
										style={{ stroke: C.line }}
									/>
									<line
										x1={10}
										y1={12}
										x2={10}
										y2={60}
										style={{ stroke: C.line }}
									/>
									<line
										x1={10}
										y1={12}
										x2={162}
										y2={12}
										strokeDasharray="3 3"
										style={{ stroke: C.faint }}
									/>
									<polyline
										points={pts}
										fill="none"
										strokeWidth={2}
										style={{ stroke: C.fee }}
									/>
									<text
										x={14}
										y={11}
										fontSize={9}
										style={{ fill: C.faint, fontFamily: mono }}
									>
										cap F = {F}bps
									</text>
									<text
										x={162}
										y={72}
										fontSize={9}
										textAnchor="end"
										style={{ fill: C.faint, fontFamily: mono }}
									>
										d (bps beyond edge) → {dMax}
									</text>
									<text
										x={10}
										y={72}
										fontSize={9}
										style={{ fill: C.dim, fontFamily: mono }}
									>
										stamp(d)
									</text>
								</svg>
							</div>

							<div style={row}>
								<span style={eyebrow}>4 · Pairing</span>backing = your own
								opposite side, consumed inside-first
								<div style={note}>
									better-priced bars claim it before this one (spillover).
									Whatever finds no match is directional.
								</div>
							</div>

							<div style={row}>
								<span style={eyebrow}>5 · Fee</span>fee = (Σ matched × max(own
								stamp, partner stamp) + unbacked × F) / size
								<div style={note}>
									each matched dollar pays its worse leg (a round trip is as
									good as its worse leg) and unbacked dollars pay F. Width
									pressure = slope; the full taker rate is reached{" "}
									{(S / 2 + F / slope).toFixed(1)}bps from M, and past that
									point backing no longer matters in either direction.
								</div>
							</div>

							<div style={{ marginBottom: 0 }}>
								<span style={eyebrow}>6 · Dollars</span>fee$ = rate × size ÷
								10,000
								{comp > 0 && (
									<span>
										{" "}
										− insideComp × max(0, 1 − dist/(S/2)) × size ÷ 10,000
									</span>
								)}
							</div>
						</div>
					);
				})()}

			{/* chart */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "6px 4px 2px",
					position: "relative",
				}}
			>
				{/* title, then every dial in one place — no advanced split */}
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
					SINGLE MARKET MAKER BATCH AUCTION FEES
				</div>
				{/* zoom: view only — the book and M never change */}
				<div
					style={{
						position: "absolute",
						top: 10,
						right: 12,
						display: "flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<button
						type="button"
						disabled={zoom >= ZOOM_HALVES.length - 1}
						onClick={() =>
							setZoom((z) => Math.min(ZOOM_HALVES.length - 1, z + 1))
						}
						title="Zoom out: show more of the book"
						style={{
							...btn(false),
							padding: "1px 8px",
							fontSize: 13,
							opacity: zoom >= ZOOM_HALVES.length - 1 ? 0.35 : 1,
							cursor: zoom >= ZOOM_HALVES.length - 1 ? "default" : "pointer",
						}}
					>
						−
					</button>
					<span style={{ fontFamily: mono, fontSize: 10.5, color: C.faint }}>
						±{viewHalf % 2 ? (viewHalf / 2).toFixed(1) : viewHalf / 2}bps
					</span>
					<button
						type="button"
						disabled={zoom === 0}
						onClick={() => setZoom((z) => Math.max(0, z - 1))}
						title="Zoom in"
						style={{
							...btn(false),
							padding: "1px 8px",
							fontSize: 13,
							opacity: zoom === 0 ? 0.35 : 1,
							cursor: zoom === 0 ? "default" : "pointer",
						}}
					>
						+
					</button>
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
						suffix="$"
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
						warn={slope >= 1}
						hint="Fee per bps outside the band."
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
						<span style={label}>Full fee reached</span>
						<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
							{(S / 2 + F / slope).toFixed(1)}bps from M
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
					aria-label="Order-book depth chart: drag bars to reshape your quotes; the violet curve shows each level's fee"
				>
					<defs>
						<pattern
							id="sf-hatch"
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
					{Array.from(
						{ length: 6 },
						(_, k) => feeMin + ((feeMax - feeMin) * k) / 5,
					).map((v) => (
						<g key={v}>
							<line
								x1={PL}
								x2={PR}
								y1={yFee(v)}
								y2={yFee(v)}
								strokeWidth={1}
								style={{ stroke: C.grid }}
							/>
							{(tipFeeY == null || Math.abs(yFee(v) - tipFeeY) > 13) &&
								Math.abs(yFee(v) - yFee(F)) > 12 && (
									<text
										x={PL - 20}
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
					{[0, 5000, 10000, 15000, 20000, 25000].map((v) => (
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
					{comp > 0 && (
						<line
							x1={PL}
							x2={PR}
							y1={yFee(0)}
							y2={yFee(0)}
							strokeDasharray="4 4"
							style={{ stroke: C.faint }}
						/>
					)}
					{/* fee cap: a red-marked tick on the axis, riding with F */}
					<g pointerEvents="none" style={{ transition: "all 150ms" }}>
						<text
							x={PL - 20}
							y={yFee(F) - 9}
							textAnchor="end"
							fontSize={9}
							letterSpacing="0.12em"
							style={{ fill: C.fee, fontFamily: mono }}
						>
							CAP
						</text>
						<text
							x={PL - 20}
							y={yFee(F) + 4.5}
							textAnchor="end"
							fontSize={13}
							style={{ fill: C.fee, fontFamily: mono }}
						>
							{F.toFixed(2)}
						</text>
						<path
							d={`M${PL - 16},${yFee(F) - 5} L${PL - 6},${yFee(F)} L${PL - 16},${yFee(F) + 5} Z`}
							style={{ fill: C.fee }}
						/>
					</g>

					{/* band (slides with M) */}
					<g
						style={{ transition: "transform 220ms ease" }}
						transform={`translate(${xOfPrice(model.edgeBid)},0)`}
					>
						<rect
							x={0}
							y={PT}
							width={Math.max(
								0,
								xOfPrice(model.edgeAsk) - xOfPrice(model.edgeBid),
							)}
							height={PB - PT}
							style={{ fill: C.band }}
						/>
					</g>
					<line
						x1={xOfPrice(model.edgeBid)}
						x2={xOfPrice(model.edgeBid)}
						y1={PT}
						y2={PB}
						strokeDasharray="3 4"
						style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
					/>
					<line
						x1={xOfPrice(model.edgeAsk)}
						x2={xOfPrice(model.edgeAsk)}
						y1={PT}
						y2={PB}
						strokeDasharray="3 4"
						style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
					/>
					{/* band-edge labels — centered on their lines */}
					<text
						x={xOfPrice(model.edgeBid)}
						y={PT - 6}
						textAnchor="middle"
						fontSize={12}
						style={{
							fill: C.mark,
							fontFamily: mono,
							transition: "all 220ms ease",
						}}
					>
						{fmtPx(model.edgeBid)}
					</text>
					<text
						x={xOfPrice(model.edgeAsk)}
						y={PT - 6}
						textAnchor="middle"
						fontSize={12}
						style={{
							fill: C.mark,
							fontFamily: mono,
							transition: "all 220ms ease",
						}}
					>
						{fmtPx(model.edgeAsk)}
					</text>

					{/* the bid/ask boundary, between 100.000 and 100.005 */}
					<line
						x1={(xAt(CENTER) + xAt(CENTER + 1)) / 2}
						x2={(xAt(CENTER) + xAt(CENTER + 1)) / 2}
						y1={PT}
						y2={PB}
						strokeWidth={1}
						style={{ stroke: C.line }}
					/>

					{/* bars + hit zones */}
					{model.levels.map((lv) =>
						lv.side === "mid" || !inView(lv.i) ? null : (
							<g key={lv.i}>
								{/* bar body: hovering reads the level's fee, clicking pins it */}
								{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hover surface; the fee dots are the accessible pin control */}
								<rect
									x={xAt(lv.i) - step / 2}
									y={PT}
									width={step}
									height={PB - PT}
									fill="transparent"
									style={{ cursor: lv.bk ? "pointer" : "default" }}
									onPointerEnter={() => setFeeHover(lv.bk ? lv.i : null)}
									onPointerLeave={() => setFeeHover(null)}
									onClick={() => togglePin(lv.i)}
									onDblClick={() => {
										if (lv.i === CENTER)
											setCenterSide((cs) => (cs === "bid" ? "ask" : "bid"));
									}}
								/>
								{/* grab handle: hugs the bar's top edge, mostly outside it */}
								<rect
									x={xAt(lv.i) - step / 2}
									y={lv.size > 0 ? Math.max(PT, yDepth(lv.size) - 12) : PB - 14}
									width={step}
									height={lv.size > 0 ? 16 : 14}
									fill="transparent"
									style={{ cursor: "ns-resize" }}
									onPointerEnter={() => setFeeHover(lv.bk ? lv.i : null)}
									onPointerLeave={() => setFeeHover(null)}
									onPointerDown={(e) => onDown(e, lv.i)}
									onPointerMove={onMove}
									onPointerUp={(e) => onUp(e, lv.i)}
									onPointerCancel={() => {
										drag.current = null;
									}}
								/>
								{lv.size > 0 && (
									<rect
										x={xAt(lv.i) - barW / 2}
										y={yDepth(lv.size)}
										width={barW}
										height={PB - yDepth(lv.size)}
										opacity={0.85 * dimIf(lv.i)}
										rx={2}
										pointerEvents="none"
										strokeWidth={tip === lv.i ? 1.5 : 0}
										style={{
											fill: lv.side === "bid" ? C.bid : C.ask,
											stroke: tip === lv.i ? C.text : "none",
										}}
									/>
								)}
								{lv.size > 0 && (model.markUsed.get(lv.i) || 0) > 0 && (
									<rect
										x={xAt(lv.i) - barW / 2}
										y={yDepth(model.markUsed.get(lv.i) ?? 0)}
										width={barW}
										height={Math.max(
											0,
											PB - yDepth(model.markUsed.get(lv.i) ?? 0),
										)}
										strokeWidth={1.25}
										rx={2}
										opacity={dimIf(lv.i)}
										pointerEvents="none"
										style={{ fill: C.markSlice, stroke: C.mark }}
									/>
								)}
								{lv.size > 0 && lv.bk && lv.bk.unpaired > 0 && (
									<rect
										x={xAt(lv.i) - barW / 2}
										y={yDepth(lv.size)}
										width={barW}
										height={Math.max(
											0,
											yDepth(lv.size - lv.bk.unpaired) - yDepth(lv.size),
										)}
										fill="url(#sf-hatch)"
										rx={2}
										opacity={dimIf(lv.i)}
										pointerEvents="none"
									/>
								)}
								{lv.size === 0 && (
									<line
										x1={xAt(lv.i) - barW / 2}
										x2={xAt(lv.i) + barW / 2}
										y1={PB}
										y2={PB}
										strokeWidth={2}
										pointerEvents="none"
										opacity={0.45}
										style={{ stroke: lv.side === "bid" ? C.bid : C.ask }}
									/>
								)}
							</g>
						),
					)}

					{/* partner highlight — the dollars matched with the hovered level */}
					{matchSlices
						.filter((sl) => inView(sl.i))
						.map((sl) => (
							<rect
								key={sl.i}
								x={xAt(sl.i) - barW / 2}
								y={yDepth(sl.to)}
								width={barW}
								height={Math.max(0, yDepth(sl.from) - yDepth(sl.to))}
								fill="none"
								strokeWidth={1.75}
								rx={1.5}
								pointerEvents="none"
								style={{ stroke: C.text }}
							/>
						))}

					{/* hovered/pinned-fee reference line across the whole plot */}
					{tipLv && tipBk && (
						<g pointerEvents="none">
							<line
								x1={PL}
								x2={PR}
								y1={yFee(tipBk.final)}
								y2={yFee(tipBk.final)}
								strokeDasharray="5 5"
								strokeWidth={1}
								opacity={0.7}
								style={{ stroke: C.fee, transition: "all 150ms" }}
							/>
							{/* the CAP tick already prints the value when they coincide */}
							{Math.abs(yFee(tipBk.final) - yFee(F)) > 12 && (
								<text
									x={PL - 18}
									y={yFee(tipBk.final) + 4.5}
									textAnchor="end"
									fontSize={13}
									style={{ fill: C.fee, fontFamily: mono }}
								>
									{tipBk.final.toFixed(2)}
								</text>
							)}
						</g>
					)}

					{/* fee curve */}
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
							r={feeHover === l.i || feePinned === l.i ? 5.5 : 4}
							strokeWidth={1.5}
							pointerEvents="none"
							style={{ fill: C.fee, stroke: C.panel }}
						/>
					))}
					{/* fee hit zones — hover a dot for its breakdown */}
					{feePts.map((l) => (
						// biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg>
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
							onClick={() => togglePin(l.i)}
							onKeyDown={(e) => {
								if (e.key === "Enter") togglePin(l.i);
							}}
							style={{ cursor: "pointer" }}
						/>
					))}

					{/* price axis */}
					<line x1={PL} x2={PR} y1={PB} y2={PB} style={{ stroke: C.line }} />
					{model.levels.map((lv) =>
						!inView(lv.i) ? null : (
							<g key={lv.i}>
								<line
									x1={xAt(lv.i)}
									x2={xAt(lv.i)}
									y1={PB}
									y2={PB + 4}
									style={{ stroke: C.faint }}
								/>
								{(lv.i - CENTER) % labelStride === 0 && (
									<text
										x={xAt(lv.i)}
										y={AXIS_Y + 15}
										textAnchor="middle"
										fontSize={12}
										style={{
											fill:
												lv.i === CENTER
													? centerSide === "bid"
														? C.bid
														: C.ask
													: C.faint,
											fontFamily: mono,
										}}
									>
										{fmtPx(lv.price)}
									</text>
								)}
							</g>
						),
					)}

					{/* key — its own strip below the price axis */}
					<g pointerEvents="none" style={{ fontFamily: mono }}>
						<rect
							x={212}
							y={PB + 46}
							width={14}
							height={14}
							rx={2}
							style={{ fill: C.bid }}
						/>
						<text
							x={233}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Bids
						</text>
						<rect
							x={301}
							y={PB + 46}
							width={14}
							height={14}
							rx={2}
							style={{ fill: C.ask }}
						/>
						<text
							x={322}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Asks
						</text>
						<rect
							x={390}
							y={PB + 46}
							width={14}
							height={14}
							fill="url(#sf-hatch)"
							strokeWidth={0.5}
							style={{ stroke: C.dim }}
						/>
						<text
							x={411}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Directional
						</text>
						<circle
							cx={553}
							cy={PB + 53}
							r={6}
							strokeWidth={1}
							style={{ fill: C.fee, stroke: C.panel }}
						/>
						<text
							x={566}
							y={PB + 59}
							fontSize={16}
							style={{ fill: C.dim, fontFamily: mono }}
						>
							Fee if Fully Filled
						</text>
						<text
							x={W / 2}
							y={PB + 90}
							textAnchor="middle"
							fontSize={12.5}
							style={{ fill: C.faint, fontFamily: mono, fontStyle: "italic" }}
						>
							Instructions: Drag a bar's top edge to resize it. Hover a bar for
							its fee, <tspan style={{ fill: C.mark }}>M</tspan> for its math.
							Double-click 100.000 to flip its side.
						</text>
					</g>

					{/* Mark carriage — the signature. Rides the top strip; hover for
					    the walk that produced it. */}
					<g
						style={{ transition: "transform 220ms ease" }}
						transform={`translate(${xOfPrice(model.M)},0)`}
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
							M {fmtPx(model.M)}
							{model.frozen ? " ❄" : ""}
						</text>
						{/* hover hit zone: the label box and arrow only, not the line */}
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

					{/* Mark tooltip — the walk that produced M, side by side */}
					{mHover &&
						(() => {
							const xT = Math.min(
								Math.max(xOfPrice(model.M), PL + 190),
								PR - 190,
							);
							const top = PT + 8;
							if (model.frozen) {
								const rows = [
									{ t: "M frozen: no matched two-sided size", c: C.text },
									{ t: "nothing is eligible to walk;", c: C.dim },
									{ t: `showing last computed M ${fmtPx(model.M)}`, c: C.dim },
								];
								return (
									<g pointerEvents="none">
										<rect
											x={xT - 165}
											y={top}
											width={330}
											height={16 + rows.length * 19}
											rx={6}
											strokeWidth={0.75}
											style={{ fill: C.panel2, stroke: C.mark }}
										/>
										{rows.map((r, k) => (
											<text
												key={r.t}
												x={xT - 151}
												y={top + 22 + k * 19}
												fontSize={14}
												style={{ fill: r.c, fontFamily: mono }}
											>
												{r.t}
											</text>
										))}
									</g>
								);
							}
							const walk = (side: Side) =>
								model.levels
									.filter(
										(l) =>
											l.side === side && (model.markUsed.get(l.i) ?? 0) > 0,
									)
									.sort((a, b) =>
										side === "bid" ? b.price - a.price : a.price - b.price,
									)
									.map((l) => ({
										t: `${fmtPx(l.price)} · ${fmt$(model.markUsed.get(l.i) ?? 0)}`,
										c: C.text,
									}));
							const colOf = (side: Side) => {
								const rows = walk(side);
								const short = side === "bid" ? model.shortBid : model.shortAsk;
								if (short)
									rows.push({
										t: `${fmt$(short.missing)} @ ${fmtPx(short.price)}`,
										c: C.faint,
									});
								return rows;
							};
							const anyShort = model.shortBid != null || model.shortAsk != null;
							const L = colOf("bid");
							const R = colOf("ask");
							const nRows = Math.max(L.length, R.length, 1);
							const headY = top + 44;
							const rowY = (k: number) => top + 64 + k * 17;
							const resY = rowY(nRows - 1) + 21;
							const footY = resY + 23;
							const noteY = footY + 18;
							const h = noteY + 10 - top;
							const colL = xT - 168;
							const colR = xT + 16;
							return (
								<g pointerEvents="none" style={{ fontFamily: mono }}>
									<rect
										x={xT - 180}
										y={top}
										width={360}
										height={h}
										rx={6}
										strokeWidth={0.75}
										style={{ fill: C.panel2, stroke: C.mark }}
									/>
									<text
										x={xT}
										y={top + 22}
										textAnchor="middle"
										fontSize={14}
										style={{ fill: C.dim, fontFamily: mono }}
									>
										M: the mark price of this snapshot
									</text>
									<line
										x1={xT}
										x2={xT}
										y1={top + 32}
										y2={resY + 4}
										style={{ stroke: C.line }}
									/>
									<text
										x={colL}
										y={headY}
										fontSize={13.5}
										style={{ fill: C.bid, fontFamily: mono }}
									>
										sell {fmt$(T)} → bids
									</text>
									<text
										x={colR}
										y={headY}
										fontSize={13.5}
										style={{ fill: C.ask, fontFamily: mono }}
									>
										buy {fmt$(T)} → asks
									</text>
									{L.map((r, k) => (
										<text
											key={r.t}
											x={colL}
											y={rowY(k)}
											fontSize={13.5}
											style={{ fill: r.c, fontFamily: mono }}
										>
											{r.t}
										</text>
									))}
									{R.map((r, k) => (
										<text
											key={r.t}
											x={colR}
											y={rowY(k)}
											fontSize={13.5}
											style={{ fill: r.c, fontFamily: mono }}
										>
											{r.t}
										</text>
									))}
									<text
										x={colL}
										y={resY}
										fontSize={14}
										style={{ fill: C.bid, fontFamily: mono }}
									>
										gets → {model.iBid != null ? fmtPx(model.iBid) : "–"}
									</text>
									<text
										x={colR}
										y={resY}
										fontSize={14}
										style={{ fill: C.ask, fontFamily: mono }}
									>
										pays → {model.iAsk != null ? fmtPx(model.iAsk) : "–"}
									</text>
									<text
										x={xT}
										y={footY}
										textAnchor="middle"
										fontSize={14}
										style={{ fill: C.mark, fontFamily: mono }}
									>
										M = ({model.iBid != null ? fmtPx(model.iBid) : "–"} +{" "}
										{model.iAsk != null ? fmtPx(model.iAsk) : "–"}) / 2 ={" "}
										{fmtPx(model.M)}
									</text>
									<text
										x={xT}
										y={noteY}
										textAnchor="middle"
										fontSize={12}
										style={{ fill: C.faint, fontFamily: mono }}
									>
										{anyShort
											? "faint rows: missing depth, priced at the window edge"
											: "purple slices = the depth each walk consumed"}
									</text>
								</g>
							);
						})()}

					{/* fee tooltip — itemized receipt in the fixed top-center slot
					    (shares it with the M tooltip, which takes precedence) */}
					{(feeHover ?? feePinned) != null &&
						!mHover &&
						(() => {
							const tipI = feeHover ?? feePinned;
							if (tipI == null) return null;
							const lv = model.levels[tipI];
							const b = lv?.bk;
							if (!lv || !b || lv.side === "mid") return null;
							const d = Math.max(
								0,
								(lv.side === "bid"
									? model.edgeBid - lv.price
									: lv.price - model.edgeAsk) / BP,
							);
							const dist = Math.abs(lv.price - model.M) / BP;
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
							// matches at-or-inside the base fee collapse into one line
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
							items.forEach((it, k) => {
								rows.push({
									label: k === 0 ? "SURCHARGES" : "",
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
								// starts under the equation's right-hand side, whose terms
								// it defines: 12 mono chars (" +0.92bps = ") at 14px ≈ 101
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

			{/* scenarios — the guided tour */}
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
				<button
					type="button"
					onClick={() => {
						setSizes(Array(N).fill(0));
						setScenario(null);
					}}
					style={{ ...btn(false), background: "transparent", color: C.faint }}
				>
					Clear
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
