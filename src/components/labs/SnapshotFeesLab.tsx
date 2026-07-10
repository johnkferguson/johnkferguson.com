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

const N = 21; // levels
const CENTER = 10; // index of 100.00
const TICK = 0.005; // $ per level
const MAX_DEPTH = 25000; // $ per level
const STEP_DOLLARS = 250;

const priceAt = (i: number) => +(100 + (i - CENTER) * TICK).toFixed(3);
const sideAt = (i: number): Side =>
	i < CENTER ? "bid" : i > CENTER ? "ask" : "mid";

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
			"A mirrored ladder across every price level. Everything is matched, so each level pays only its placement: fees sit at zero near M and rise gently with distance — even the farthest quote pays a small fraction of the taker rate. Using every price level stays cheap.",
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
			"The same bid ladder, but the asks thin out toward the edge. The inner book is unchanged — M stays put and near quotes still trade free — but the missing ask depth strands the outermost bids: whatever has no match behind it pays like a taker, and the farthest bid hits F in full. Directional size is priced as the taker it is, level by level.",
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
			"Ask depth sits far from the mid while the bids crowd it, so the measuring walk pays up to reach it — M slides toward the heavy side and the band follows, leaving every bid a touch below the new standard. Even in-band asks pay a faint echo of their partners' stamps: placement is judged against the Mark this snapshot produces, not the mid you quoted around.",
		book: () => {
			const a = Array(N).fill(0);
			const bids = [
				1500, 2000, 4000, 5500, 6200, 7000, 8000, 9700, 12000, 13200,
			];
			const asks = [
				1500, 1700, 1500, 1700, 2200, 3200, 5200, 14000, 17000, 21100,
			];
			bids.forEach((v, k) => {
				a[k] = v;
			});
			asks.forEach((v, k) => {
				a[11 + k] = v;
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
			"Two-sided and fully matched — but placed outside the band, so the only charge is the stamp for imprecision. Widen S and watch the band swallow the quotes and the fees fall away.",
		book: () => bookOf({ 1: 8000, 3: 6000, 17: 6000, 19: 8000 }),
	},
	{
		key: "spill",
		title: "Spillover",
		blurb:
			"Three equal bids share one ask. The best bid claims coverage first and trades free; the middle one gets half; the last gets nothing and pays like a taker. Coverage is consumed, never reused — hover the dots to watch it drain.",
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
	onAccent: "var(--lab-on-accent)",
};

const mono = "var(--lab-mono)";

const fmt$ = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtBp = (v: number, d = 2) => `${v.toFixed(d)}bp`;
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
}

function Param({ name, val, set, min, max, stp, suffix, hint }: ParamProps) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 128,
				maxWidth: 172,
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
	const [F, setF] = useState(15); // cap / taker rate, bps
	const [slope, setSlope] = useState(0.75); // k: stamp bps per bp beyond edge
	const expo = 1; // stamp curvature — pinned linear; superlinear kills net edge mid-book
	const [comp, setComp] = useState(0); // inside compensation max, bps (parked module)

	const [sizes, setSizes] = useState<number[]>(() => SCENARIOS[0].book());
	const [sel, setSel] = useState(CENTER - 1);
	const [showFormula, setShowFormula] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [scenario, setScenario] = useState<string | null>(SCENARIOS[0].key);
	const [pinned, setPinned] = useState<{ i: number; v: number }[] | null>(null);
	const [mHover, setMHover] = useState(false);
	const [feeHover, setFeeHover] = useState<number | null>(null);
	const [feePinned, setFeePinned] = useState<number | null>(null);
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);

	const model = useMemo(() => {
		const book: BookLevel[] = sizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideAt(i),
			size,
		}));
		return computeModel(book, { S, T, F, slope, expo, comp }, lastM.current);
	}, [sizes, S, T, F, slope, expo, comp]);

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
	// Top strip: title row (y 0…28), then the Mark carriage and band-edge
	// labels (y 28…PT). Below the price axis, a key strip closes the frame.
	const W = 960;
	const H = 546;
	const PL = 84;
	const PR = 884;
	const PT = 84;
	const PB = 444; // plot box
	const AXIS_Y = PB + 4;
	const step = (PR - PL) / (N - 1);
	const xAt = (i: number) => PL + i * step;
	const xOfPrice = (p: number) => PL + ((p - priceAt(0)) / TICK) * step;
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
		if (i === CENTER) return;
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
		setS(2);
		setT(20000);
		setF(15);
		setSlope(0.75);
		setComp(0);
		setScenario(sc.key);
	};
	const touch = (fn: (v: number) => void) => (v: number) => {
		fn(v);
		setScenario(null);
	};

	const onUp = (_e: PointerEvent, i: number) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved) setSel(i === CENTER ? sel : i);
		else if (d) setSel(d.i);
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

	const selLv = model.levels[sel];
	const bk = selLv?.bk;
	const selFeeY = bk ? yFee(bk.final) : null;

	const feePts = model.levels.filter((l) => l.size > 0 && l.side !== "mid");
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
								The pipeline — general form, with your settings substituted
							</div>

							<div style={row}>
								<span style={eyebrow}>1 · Mark</span>M = (impactBid(T) +
								impactAsk(T)) / 2
								<div style={note}>
									impact price = volume-weighted price of trading $
									{T.toLocaleString()} into that side, best levels first ·
									quotes more than {8 * S}bp behind a side's best are ignored
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
								{half}bp → {fmtPx(model.edgeBid)} … {fmtPx(model.edgeAsk)}
								<div style={note}>
									the declared free zone — placement inside it stamps at zero
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
										d = bp of placement beyond your side's edge (0 if inside).
										Slope is the price of every bp of imprecision.
									</div>
									<div style={{ color: C.text }}>
										d=1 → {fmtBp(stampEx(1))} · d=2 → {fmtBp(stampEx(2))} · d=4
										→ {fmtBp(stampEx(4))} · hits the cap at d ={" "}
										{dCap.toFixed(1)}bp
									</div>
								</div>
								<svg
									width={172}
									height={78}
									style={{ flex: "0 0 auto" }}
									role="img"
									aria-label={`Stamp curve: fee rises from 0 to the ${F}bp cap over ${dCap.toFixed(1)}bp of distance`}
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
										cap F = {F}bp
									</text>
									<text
										x={162}
										y={72}
										fontSize={9}
										textAnchor="end"
										style={{ fill: C.faint, fontFamily: mono }}
									>
										d (bp beyond edge) → {dMax}
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
									each matched dollar pays its worse leg — a round trip is as
									good as its worse leg — and unbacked dollars pay F. Width
									pressure = slope; the full taker rate is reached{" "}
									{(S / 2 + F / slope).toFixed(1)}bp from M, and past that point
									backing no longer matters in either direction.
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
				{/* the dials that shape the story — on top of the instrument */}
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "12px 26px",
						alignItems: "flex-start",
						borderBottom: `1px solid ${C.line}`,
						margin: "0 10px 4px",
						padding: "10px 4px 10px",
					}}
				>
					<Param
						name="Spread standard · S"
						val={S}
						set={touch(setS)}
						min={1}
						max={10}
						stp={0.5}
						suffix="bp"
						hint="The free band, M ± S/2."
					/>
					<Param
						name="Fee Cap / Taker Rate · F"
						val={F}
						set={touch(setF)}
						min={5}
						max={25}
						stp={0.5}
						suffix="bp"
						hint="The ceiling every fee runs toward."
					/>
					<Param
						name="Typical trade · T"
						val={T}
						set={touch(setT)}
						min={1000}
						max={30000}
						stp={500}
						suffix="$"
						hint="The measuring size for M's walk."
					/>
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<span style={label}>Compare</span>
						<button
							type="button"
							onClick={() =>
								setPinned(
									pinned
										? null
										: feePts.map((l) => ({ i: l.i, v: l.bk?.final ?? 0 })),
								)
							}
							style={btn(!!pinned)}
						>
							{pinned ? "Unpin ghost" : "Pin curve"}
						</button>
						<span
							style={{
								fontSize: 11,
								color: C.faint,
								lineHeight: 1.45,
								maxWidth: 160,
							}}
						>
							Freeze the fee curve, change anything, compare.
						</span>
					</div>
					<button
						type="button"
						class="sf-adv-toggle"
						onClick={() => setShowAdvanced((v) => !v)}
						style={btn(showAdvanced)}
					>
						{showAdvanced ? "Hide advanced" : "Show advanced"}
					</button>
				</div>
				<div class={`sf-adv${showAdvanced ? " open" : ""}`}>
					<div style={{ overflow: "hidden" }}>
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: "12px 26px",
								alignItems: "flex-start",
								borderBottom: `1px solid ${C.line}`,
								margin: "0 10px 4px",
								padding: "10px 4px 10px",
							}}
						>
							<Param
								name="Stamp slope"
								val={slope}
								set={touch(setSlope)}
								min={0.25}
								max={3}
								stp={0.05}
								suffix="×"
								hint="Stamp bps charged per bp of placement beyond the band edge."
							/>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 4,
									maxWidth: 172,
								}}
							>
								<span style={label}>Full fee reached</span>
								<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
									{(S / 2 + F / slope).toFixed(1)}bp from M
									<span style={{ color: C.dim }}>
										{" · "}
										{slope < 0.98
											? "gentle"
											: slope > 1.02
												? "leaning"
												: "full clawback"}
									</span>
								</span>
								<span
									style={{ fontSize: 11, color: C.faint, lineHeight: 1.45 }}
								>
									Past this point placement pays the full taker rate — and
									backing no longer matters: matched or not, it is priced as a
									taker.
								</span>
							</div>
						</div>
					</div>
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

					{/* fixed center */}
					<line
						x1={xAt(CENTER)}
						x2={xAt(CENTER)}
						y1={PT}
						y2={PB}
						strokeWidth={1}
						style={{ stroke: C.line }}
					/>

					{/* bars + hit zones */}
					{model.levels.map((lv) =>
						lv.side === "mid" ? null : (
							<g key={lv.i}>
								<rect
									x={xAt(lv.i) - step / 2}
									y={PT}
									width={step}
									height={PB - PT}
									fill="transparent"
									style={{ cursor: "ns-resize" }}
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
										opacity={0.85}
										rx={2}
										pointerEvents="none"
										strokeWidth={sel === lv.i ? 1.5 : 0}
										style={{
											fill: lv.side === "bid" ? C.bid : C.ask,
											stroke: sel === lv.i ? C.text : "none",
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

					{/* pinned ghost curve — freeze-frame for comparison */}
					{pinned && pinned.length > 1 && (
						<path
							d={pinned
								.map(
									(g, k) =>
										`${k ? "L" : "M"}${xAt(g.i)},${Math.max(PT, Math.min(PB, yFee(g.v)))}`,
								)
								.join(" ")}
							fill="none"
							strokeWidth={2}
							strokeDasharray="7 5"
							opacity={0.5}
							pointerEvents="none"
							style={{ stroke: C.fee }}
						/>
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
							r={sel === l.i || feeHover === l.i || feePinned === l.i ? 5.5 : 4}
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
					{model.levels.map((lv) => (
						<g key={lv.i}>
							<line
								x1={xAt(lv.i)}
								x2={xAt(lv.i)}
								y1={PB}
								y2={PB + 4}
								style={{ stroke: C.faint }}
							/>
							{lv.i % 2 === 0 && (
								<text
									x={xAt(lv.i)}
									y={AXIS_Y + 15}
									textAnchor="middle"
									fontSize={12}
									style={{
										fill: lv.i === CENTER ? C.text : C.faint,
										fontFamily: mono,
									}}
								>
									{fmtPx(lv.price)}
								</text>
							)}
						</g>
					))}

					{/* chart title — centered, in its own strip above the plot */}
					<text
						x={W / 2}
						y={22}
						textAnchor="middle"
						fontSize={16}
						letterSpacing="0.08em"
						style={{ fill: C.text, fontFamily: mono }}
					>
						SINGLE MARKET MAKER BATCH AUCTION FEES
					</text>

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
							Instructions: Drag each bar to adjust order book. Hover{" "}
							<tspan style={{ fill: C.fee }}>●</tspan> to view fee calculations.
							Hover <tspan style={{ fill: C.mark }}>M</tspan> to view its
							calculations.
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
							y={42}
							width={116}
							height={22}
							rx={4}
							strokeWidth={0.75}
							style={{ fill: C.panel2, stroke: C.mark }}
						/>
						<text
							x={0}
							y={58}
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
							y={40}
							width={116}
							height={PT - 41}
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
									{ t: "M frozen — a side is empty", c: C.text },
									{ t: "no two-sided walk possible;", c: C.dim },
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
								const tot = model.levels.reduce(
									(s, l) =>
										s + (l.side === side ? (model.markUsed.get(l.i) ?? 0) : 0),
									0,
								);
								if (tot < T - 0.5)
									rows.push({ t: `only ${fmt$(tot)} deep`, c: C.faint });
								return rows;
							};
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
										M — the mark price of this snapshot
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
										gets → {model.iBid != null ? fmtPx(model.iBid) : "—"}
									</text>
									<text
										x={colR}
										y={resY}
										fontSize={14}
										style={{ fill: C.ask, fontFamily: mono }}
									>
										pays → {model.iAsk != null ? fmtPx(model.iAsk) : "—"}
									</text>
									<text
										x={xT}
										y={footY}
										textAnchor="middle"
										fontSize={14}
										style={{ fill: C.mark, fontFamily: mono }}
									>
										M = ({model.iBid != null ? fmtPx(model.iBid) : "—"} +{" "}
										{model.iAsk != null ? fmtPx(model.iAsk) : "—"}) / 2 ={" "}
										{fmtPx(model.M)}
									</text>
									<text
										x={xT}
										y={noteY}
										textAnchor="middle"
										fontSize={12}
										style={{ fill: C.faint, fontFamily: mono }}
									>
										purple slices = the depth each walk consumed
									</text>
								</g>
							);
						})()}

					{/* fee tooltip — headline fee, the receipt, and the net vs M */}
					{(feeHover ?? feePinned) != null &&
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
							const cov = b.q - b.unpaired;
							const covPct = Math.round((cov / b.q) * 100);
							const avg =
								cov > 0
									? b.pairs.reduce((s, pr) => s + pr.matched * pr.stamp, 0) /
										cov
									: 0;
							const free = b.final < 0.05;
							const capped = b.combined >= F - 1e-9;
							const net = dist - b.final;
							const verdict =
								cov <= 0
									? [
											"Nothing stands behind this size:",
											"it pays the full taker rate.",
										]
									: capped
										? [
												"Its charges reach the cap —",
												"this fills at the taker rate.",
											]
										: b.unpaired > 0
											? [
													`${100 - covPct}% of this size is unbacked —`,
													"that part pays the taker rate.",
												]
											: free
												? [
														"Fully matched, inside the band:",
														"this trades free.",
													]
												: b.own >= avg
													? [
															"Fully matched — the charge is its own",
															"placement outside the band.",
														]
													: [
															"Fully matched — the charge comes from",
															"where its backing stands.",
														];
							interface TipRow {
								label?: string;
								t: string;
								c: string;
								s?: number;
								gap?: number;
							}
							const rows: TipRow[] = [
								{
									t: `${fmtBp(b.final)} fee @ full fill`,
									c: C.fee,
									s: 14,
								},
								{
									t: `${lv.side} @ ${fmtPx(lv.price)} · ${dist.toFixed(2)}bp from M`,
									c: C.dim,
									gap: 2,
								},
							];
							verdict.forEach((t, k) => {
								rows.push({ t, c: C.dim, gap: k === 0 ? 8 : 0 });
							});
							rows.push({
								label: "PLACEMENT",
								t:
									b.own > 0
										? `${d.toFixed(2)}bp outside the band → ${fmtBp(b.own)}`
										: "inside the band → free",
								c: C.text,
								gap: 9,
							});
							if (cov > 0)
								rows.push({
									label: "BACKING",
									t: `${covPct}% matched · partners at ${fmtBp(avg)}`,
									c: C.text,
								});
							if (b.unpaired > 0)
								rows.push({
									label: cov > 0 ? "" : "BACKING",
									t: `${100 - covPct}% unbacked → taker rate ${fmtBp(F)}`,
									c: C.ask,
								});
							if (b.claimedBefore > 0 && b.unpaired > 0)
								rows.push({
									label: "",
									t: "(better-priced bars claimed the backing first)",
									c: C.faint,
									s: 11.5,
								});
							if (!free)
								rows.push({
									t: capped
										? "every dollar pays its worse leg → the cap F"
										: `each dollar pays its worse leg = ${fmtBp(b.combined)}`,
									c: C.dim,
									gap: 9,
								});
							rows.push({
								label: "NET",
								t: `${dist.toFixed(2)}bp from M − ${fmtBp(b.final)} fee = ${net >= 0 ? "+" : ""}${net.toFixed(2)}bp`,
								c: C.text,
								s: 13,
								gap: 9,
							});
							if (feePinned === tipI && feeHover == null)
								rows.push({
									t: "pinned — click the dot again or press Esc",
									c: C.faint,
									s: 10.5,
									gap: 7,
								});
							let yAcc = 22;
							const placed = rows.map((r) => {
								yAcc += r.gap ?? 0;
								const y = yAcc;
								yAcc += 17;
								return { ...r, y };
							});
							const h = yAcc + 6;
							const xT = Math.min(Math.max(xAt(lv.i), PL + 205), PR - 205);
							const dotY = yFee(b.final);
							const yT = dotY - h - 14 > PT + 4 ? dotY - h - 14 : dotY + 14;
							return (
								<g
									pointerEvents={
										feePinned === tipI && feeHover == null ? "auto" : "none"
									}
									style={{ userSelect: "text" }}
								>
									<rect
										x={xT - 200}
										y={yT}
										width={400}
										height={h}
										rx={6}
										strokeWidth={0.75}
										style={{ fill: C.panel2, stroke: C.fee }}
									/>
									{placed.map((r) => (
										<g key={`${r.t}${r.y}`}>
											{r.label ? (
												<text
													x={xT - 188}
													y={yT + r.y}
													fontSize={10.5}
													letterSpacing="0.08em"
													style={{ fill: C.faint, fontFamily: mono }}
												>
													{r.label}
												</text>
											) : null}
											<text
												x={r.label !== undefined ? xT - 96 : xT - 188}
												y={yT + r.y}
												fontSize={r.s ?? 12.5}
												style={{ fill: r.c, fontFamily: mono }}
											>
												{r.t}
											</text>
										</g>
									))}
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
					: "Custom setup — yours to shape. Drag bars and dials freely; pick a scenario to reset."}
			</div>
		</div>
	);
}
