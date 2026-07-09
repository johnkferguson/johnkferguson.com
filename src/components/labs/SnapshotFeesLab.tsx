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
} as const;

const sw = (c: string) => ({
	display: "inline-block",
	width: 9,
	height: 9,
	background: c,
	borderRadius: 2,
	marginRight: 5,
	verticalAlign: "-1px",
});

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
					style={{ width: 84, accentColor: C.fee }}
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
	const [S, setS] = useState(3); // spread standard, bps
	const [T, setT] = useState(20000); // typical trade size, $
	// —— fee schedule ——
	const [F, setF] = useState(15); // cap / taker rate, bps
	const [slope, setSlope] = useState(0.5); // bps of stamp per bp beyond edge
	const [expo, setExpo] = useState(1); // stamp curvature
	const [lambda, setLambda] = useState(0.5); // D1 compounding: 1 = additive, 0 = worse-of
	const [comp, setComp] = useState(0); // inside compensation max, bps (parked module)

	const [sizes, setSizes] = useState<number[]>(() => {
		const a = Array(N).fill(0);
		a[CENTER - 1] = 9000;
		a[CENTER - 2] = 7000;
		a[CENTER - 4] = 8000; // bids
		a[CENTER + 1] = 9000;
		a[CENTER + 2] = 7000;
		a[CENTER + 4] = 8000; // asks
		return a;
	});
	const [sel, setSel] = useState(CENTER - 1);
	const [showHelp, setShowHelp] = useState(true);
	const [showFormula, setShowFormula] = useState(true);
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);

	const model = useMemo(() => {
		const book: BookLevel[] = sizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideAt(i),
			size,
		}));
		return computeModel(
			book,
			{ S, T, F, slope, expo, lambda, comp },
			lastM.current,
		);
	}, [sizes, S, T, F, slope, expo, lambda, comp]);

	useEffect(() => {
		if (!model.frozen) lastM.current = model.M;
	}, [model.M, model.frozen]);

	// —— chart geometry ——
	const W = 960;
	const H = 470;
	const PL = 62;
	const PR = 906;
	const PT = 26;
	const PB = 396; // plot box
	const AXIS_Y = PB + 4;
	const step = (PR - PL) / (N - 1);
	const xAt = (i: number) => PL + i * step;
	const xOfPrice = (p: number) => PL + ((p - priceAt(0)) / TICK) * step;
	const barW = step * 0.6;
	const depthTop = PT; // depth scale spans the full plot: $25k = top gridline
	const yDepth = (v: number) => PB - (v / MAX_DEPTH) * (PB - depthTop);
	const feeMin = comp > 0 ? -Math.max(0.6, comp * 1.25) : 0;
	const feeMax = F; // the cap is the ceiling — top gridline is reachable
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
		if (Math.abs(dy) > 4) d.moved = true;
		if (!d.moved) return;
		const perPx = MAX_DEPTH / (PB - depthTop);
		let v = d.v0 + dy * perPx;
		v = Math.max(
			0,
			Math.min(MAX_DEPTH, Math.round(v / STEP_DOLLARS) * STEP_DOLLARS),
		);
		setSizes((s) => (s[d.i] === v ? s : s.map((x, k) => (k === d.i ? v : x))));
	};
	const onUp = (_e: PointerEvent, i: number) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved) setSel(i === CENTER ? sel : i);
		else if (d) setSel(d.i);
	};

	const presets: Record<string, () => number[]> = {
		Balanced: () => {
			const a = Array(N).fill(0);
			a[CENTER - 1] = 9000;
			a[CENTER - 2] = 7000;
			a[CENTER - 4] = 8000;
			a[CENTER + 1] = 9000;
			a[CENTER + 2] = 7000;
			a[CENTER + 4] = 8000;
			return a;
		},
		"Ask-scarce": () => {
			const a = Array(N).fill(0);
			a[CENTER - 1] = 6000;
			a[CENTER - 2] = 6000;
			a[CENTER - 3] = 4000;
			a[CENTER + 3] = 1500;
			a[CENTER + 6] = 2500;
			return a;
		},
		"One-sided": () => {
			const a = Array(N).fill(0);
			a[CENTER - 1] = 6000;
			a[CENTER - 2] = 5000;
			a[CENTER - 3] = 4000;
			return a;
		},
	};

	const btn = (active: boolean) => ({
		background: active ? C.fee : C.panel2,
		border: `1px solid ${active ? C.fee : C.line}`,
		color: active ? C.onAccent : C.dim,
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
						onClick={() => setShowHelp((h) => !h)}
						style={btn(showHelp)}
					>
						{showHelp ? "Hide guide" : "How this works"}
					</button>
					<button
						type="button"
						onClick={() => setShowFormula((h) => !h)}
						style={btn(showFormula)}
					>
						{showFormula ? "Hide formulas" : "Formulas"}
					</button>
					{Object.keys(presets).map((k) => (
						<button
							type="button"
							key={k}
							onClick={() => setSizes(presets[k]())}
							style={btn(false)}
						>
							{k}
						</button>
					))}
					<button
						type="button"
						onClick={() => setSizes(Array(N).fill(0))}
						style={{ ...btn(false), background: "transparent", color: C.faint }}
					>
						Clear
					</button>
				</div>
			</div>

			{/* guide */}
			{showHelp && (
				<div
					style={{
						background: C.panel,
						border: `1px solid ${C.line}`,
						borderRadius: 8,
						padding: "12px 16px",
						marginBottom: 12,
						fontSize: 14,
						color: C.text,
						lineHeight: 1.65,
					}}
				>
					<div style={{ ...label, marginBottom: 6 }}>How this works</div>
					<p style={{ margin: "0 0 8px" }}>
						<b>You are the only market maker</b> in one batch-auction window.
						The bars are your resting quotes — bids (green) below the fixed
						100.00 center, asks (orange) above. Drag a bar to resize it; drag
						upward on an empty level to quote there. Prices step by 0.005, and
						at $100 one cent equals one basis point (bp).
					</p>
					<p style={{ margin: "0 0 8px" }}>
						<b>The Mark (M, gold arrow)</b> is fair value measured at real size:
						the average price a $T buy would actually pay walking up your asks,
						and a $T sell would receive walking down your bids — averaged. The
						gold-edged slice on each bar is the size that walk actually
						consumed; only that size has a voice in M. Thin out one side and M
						walks toward the scarcity. It is computed fresh from this snapshot;
						nothing about you is remembered.
					</p>
					<p style={{ margin: "0 0 8px" }}>
						<b>The band (shaded)</b> is M ± S/2 — the market's declared standard
						for acceptable quoting. Placement inside it is free. Each bp beyond
						the edge earns a <b>stamp</b> of slope × distance^curvature, capped
						at F. A stamp is a charge for imprecision: quoting wider than the
						standard.
					</p>
					<p style={{ margin: "0 0 8px" }}>
						<b>A bar's fee (violet dot)</b> answers one question: if the sweep
						reached this bar and it fully filled, what rate would it pay? Its
						dollars net against your own opposite side, best prices first — and
						that coverage is <b>consumed</b>: your better-priced bars claim it
						before this one does, so uncovered size spills outward. Covered
						dollars pay their partner's stamp; uncovered dollars (hatched) pay
						the full taker rate F — with nothing standing behind them, they are
						simply a directional trade.
					</p>
					<p style={{ margin: "0 0 8px" }}>
						<b>Two charges, one fee.</b> A filled bar's own stamp and its
						coverage charge merge as{" "}
						<span style={{ fontFamily: mono }}>
							min(F, bigger + λ × smaller)
						</span>{" "}
						— the λ slider is design decision D1. Width pressure = slope × (1 +
						λ), the fee's total charge per bp of double-sided width. In a
						uniform-price batch your quote is a participation threshold, not
						your execution price — wide quotes fill at the same clearing price
						as tight ones, just less often — so width earns far less than the
						CLOB's bp-for-bp. Settings below 1.0 are the deliberate{" "}
						<b>gentle</b> regime: the fee takes a cut of what width captures,
						never more, and the band works as an attractor rather than a wall.
					</p>
					<p style={{ margin: 0 }}>
						<b>The one-sentence version:</b> your fee is F × how directional
						your fill really was. A fully covered two-sided maker trades free; a
						one-sided fill pays what a taker pays.{" "}
						<i>Directionality is the price.</i>
					</p>
				</div>
			)}

			{/* params */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "10px 14px",
					display: "flex",
					flexWrap: "wrap",
					gap: "12px 22px",
					alignItems: "flex-start",
					marginBottom: 12,
				}}
			>
				<Param
					name="Spread standard · S"
					val={S}
					set={setS}
					min={1}
					max={10}
					stp={0.5}
					suffix="bp"
					hint="Width of the free band, M ± S/2. The market's declared quoting standard."
				/>
				<Param
					name="Typical trade · T"
					val={T}
					set={setT}
					min={1000}
					max={30000}
					stp={500}
					suffix="$"
					hint="Measuring size for M: where a $T trade would really execute on each side."
				/>
				<div style={{ width: 1, alignSelf: "stretch", background: C.line }} />
				<Param
					name="Cap / taker rate · F"
					val={F}
					set={setF}
					min={5}
					max={30}
					stp={0.5}
					suffix="bp"
					hint="The ceiling. Takers pay it in full; every fee runs 0 → F by directionality."
				/>
				<Param
					name="Stamp slope"
					val={slope}
					set={setSlope}
					min={0.25}
					max={3}
					stp={0.25}
					suffix="×"
					hint="Stamp bps charged per bp of placement beyond the band edge."
				/>
				<Param
					name="Curvature"
					val={expo}
					set={setExpo}
					min={1}
					max={2}
					stp={0.25}
					hint="1 = linear distance charge; 2 = far placement charged disproportionately."
				/>
				<Param
					name="Inside comp (parked)"
					val={comp}
					set={setComp}
					min={0}
					max={0.5}
					stp={0.05}
					suffix="bp"
					hint="Experimental reward near M, funded by taker fees — a separate channel; base fees never go below zero."
				/>
				<Param
					name="Compound λ · D1"
					val={lambda}
					set={setLambda}
					min={0}
					max={1}
					stp={0.05}
					hint="How a bar's two charges merge: 0 = worse of the two only, 1 = both added in full."
				/>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 4,
						maxWidth: 172,
					}}
				>
					<span style={label}>Width pressure</span>
					<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
						{(slope * (1 + lambda)).toFixed(2)}×
						<span style={{ color: C.dim }}>
							{" · "}
							{slope * (1 + lambda) < 0.98
								? "gentle"
								: slope * (1 + lambda) > 1.02
									? "leaning"
									: "full clawback"}
						</span>
					</span>
					<span style={{ fontSize: 11, color: C.faint, lineHeight: 1.45 }}>
						slope × (1 + λ): total charge per bp of double-sided width. Below
						1.0 = gentle — net still rises with width, just slower than gross.
						Above = the fee leans quotes toward the band.
					</span>
				</div>
			</div>

			{/* formulas */}
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
									× d^curv) = min({F}, {slope} × d^{expo})
									<div style={note}>
										d = bp of placement beyond your side's edge (0 if inside).
										Slope sets how fast the charge rises; curvature bends it.
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
								<span style={eyebrow}>4 · Pairing</span>pairing = (Σ coveredᵢ ×
								stampᵢ + uncovered × F) / size
								<div style={note}>
									coverage = your own opposite side, consumed inside-first —
									better-priced bars claim it before this one (spillover).
									Uncovered dollars are directional and pay F in full.
								</div>
							</div>

							<div style={row}>
								<span style={eyebrow}>5 · Combine</span>fee = min(F, max(own,
								pairing) + λ × min(own, pairing)) = min({F}, bigger +{" "}
								{lambda.toFixed(2)} × smaller)
								<div style={note}>
									D1 — width pressure = slope × (1 + λ) ={" "}
									{(slope * (1 + lambda)).toFixed(2)}× · below 1.0 = gentle
									(profit still rises with width, at reduced slope) · 1.0 = full
									clawback of CLOB-style width gains · above = leaning on the
									band
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
				}}
			>
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
									x={PL - 8}
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
							x={PR + 8}
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
								x={PL - 8}
								y={yFee(bk.final) + 4.5}
								textAnchor="end"
								fontSize={13}
								style={{ fill: C.fee, fontFamily: mono }}
							>
								{bk.final.toFixed(2)}
							</text>
						</g>
					)}

					{/* fee curve */}
					{feePts.length > 1 && (
						<path
							d={feePath}
							fill="none"
							strokeWidth={2}
							pointerEvents="none"
							style={{ stroke: C.fee, transition: "d 120ms" }}
						/>
					)}
					{feePts.map((l) => (
						<circle
							key={l.i}
							cx={xAt(l.i)}
							cy={yFee(l.bk?.final ?? 0)}
							r={sel === l.i ? 4.5 : 3}
							strokeWidth={1.5}
							pointerEvents="none"
							style={{ fill: C.fee, stroke: C.panel }}
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

					{/* Mark carriage — the signature */}
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
							style={{ stroke: C.mark }}
						/>
						<path
							d={`M0,${PB + 6} l -6,10 l 12,0 z`}
							style={{ fill: C.mark }}
						/>
						<rect
							x={-58}
							y={PB + 34}
							width={116}
							height={20}
							rx={4}
							strokeWidth={0.75}
							style={{ fill: C.panel2, stroke: C.mark }}
						/>
						<text
							x={0}
							y={PB + 49}
							textAnchor="middle"
							fontSize={13.5}
							style={{ fill: C.mark, fontFamily: mono }}
						>
							M {fmtPx(model.M)}
							{model.frozen ? " ❄" : ""}
						</text>
					</g>
				</svg>
			</div>

			{/* status chips */}
			<div
				style={{
					display: "flex",
					gap: 14,
					flexWrap: "wrap",
					margin: "10px 2px",
					fontFamily: mono,
					fontSize: 11.5,
				}}
			>
				<span style={{ color: C.mark }}>
					M {fmtPx(model.M)}
					{model.frozen && (
						<span style={{ color: C.danger }}> · frozen (side empty)</span>
					)}
				</span>
				<span style={{ color: C.bid }}>
					impact bid {model.iBid ? fmtPx(model.iBid) : "—"}
				</span>
				<span style={{ color: C.ask }}>
					impact ask {model.iAsk ? fmtPx(model.iAsk) : "—"}
				</span>
				<span style={{ color: C.fee }}>
					band {fmtPx(model.edgeBid)} – {fmtPx(model.edgeAsk)}
				</span>
				<span style={{ color: C.dim }}>
					hatched = unpaired after spillover → prices at F
				</span>
				<span style={{ color: C.faint }}>
					drag bars to reshape · click a bar for its derivation
				</span>
			</div>
			<div
				style={{
					display: "flex",
					gap: 16,
					flexWrap: "wrap",
					margin: "0 2px 10px",
					fontSize: 12,
					color: C.dim,
					alignItems: "center",
				}}
			>
				<span>
					<i style={sw(C.bid)} />
					your bids
				</span>
				<span>
					<i style={sw(C.ask)} />
					your asks
				</span>
				<span style={{ color: C.fee }}>
					● fee this bar pays if it fully fills
				</span>
				<span>
					<i
						style={{
							...sw("transparent"),
							border: `1px solid ${C.dim}`,
							backgroundImage: `repeating-linear-gradient(45deg, var(--lab-hatch) 0 1px, transparent 1px 4px)`,
						}}
					/>
					uncovered size → pays full F
				</span>
				<span style={{ color: C.mark }}>▲ Mark M — slides with the book</span>
				<span style={{ color: C.mark }}>
					▢ gold-edged slice — the size the Mark walk consumed (this is what
					sets M)
				</span>
				<span>▒ band — the free zone, stamps = 0</span>
			</div>

			{/* derivation ledger */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: 14,
					fontFamily: mono,
					fontSize: 12.5,
					lineHeight: 1.65,
					overflowX: "auto",
				}}
			>
				{!selLv || selLv.side === "mid" || !bk ? (
					<span style={{ color: C.faint }}>
						Select a bar with size to see its full fee derivation. Empty level?
						Drag upward to create liquidity there.
					</span>
				) : (
					<>
						<div style={{ ...label, marginBottom: 6 }}>
							Fee derivation —{" "}
							<span style={{ color: selLv.side === "bid" ? C.bid : C.ask }}>
								{selLv.side}
							</span>{" "}
							{fmt$(bk.q)} @ {fmtPx(selLv.price)} (hypothetical full fill)
						</div>
						<div>
							<span style={{ color: C.dim }}>1 · own stamp</span> — {selLv.side}{" "}
							edge {fmtPx(selLv.side === "bid" ? model.edgeBid : model.edgeAsk)}{" "}
							· d ={" "}
							{Math.max(
								0,
								(selLv.side === "bid"
									? model.edgeBid - selLv.price
									: selLv.price - model.edgeAsk) / BP,
							).toFixed(2)}
							bp → min({F}, {slope} × d^{expo}) ={" "}
							<span style={{ color: C.text }}>{fmtBp(bk.own)}</span>{" "}
							<span style={{ color: C.faint }}>
								· this order's own placement, measured from the band edge
							</span>
						</div>
						<div style={{ color: C.dim, marginTop: 4 }}>
							2 · pairing walk — against your{" "}
							{selLv.side === "bid" ? "asks" : "bids"}, inside-first with
							spillover:
						</div>
						{bk.claimedBefore > 0 && (
							<div style={{ paddingLeft: 16, color: C.faint }}>
								{fmt$(bk.claimedBefore)} of your{" "}
								{selLv.side === "bid" ? "ask" : "bid"} stock already claimed by
								your better-priced {selLv.side}s — this level pairs against what
								remains
							</div>
						)}
						{bk.pairs.length === 0 && (
							<div style={{ paddingLeft: 16, color: C.danger }}>
								nothing left to pair against
							</div>
						)}
						{bk.pairs.map((p) => (
							<div key={p.price} style={{ paddingLeft: 16 }}>
								{fmtPx(p.price)} · {fmt$(p.matched)} (
								{((p.matched / bk.q) * 100).toFixed(0)}%) · stamp{" "}
								{fmtBp(p.stamp)} → {fmtBp((p.matched / bk.q) * p.stamp, 3)}
							</div>
						))}
						{bk.unpaired > 0 && (
							<div style={{ paddingLeft: 16, color: C.ask }}>
								unpaired · {fmt$(bk.unpaired)} (
								{((bk.unpaired / bk.q) * 100).toFixed(0)}%) × F {fmtBp(F)} →{" "}
								{fmtBp((bk.unpaired / bk.q) * F, 3)}
							</div>
						)}
						<div>
							<span style={{ color: C.dim }}>3 · pairing rate</span> ={" "}
							<span style={{ color: C.text }}>{fmtBp(bk.pairing)}</span>{" "}
							<span style={{ color: C.faint }}>
								· size-weighted average of the coverage charges above
							</span>
						</div>
						<div>
							<span style={{ color: C.dim }}>
								4 · combine [λ = {lambda.toFixed(2)}]
							</span>{" "}
							— min(F, max({fmtBp(bk.own)}, {fmtBp(bk.pairing)}) +{" "}
							{lambda.toFixed(2)} × min({fmtBp(bk.own)}, {fmtBp(bk.pairing)})) ={" "}
							<span style={{ color: C.text }}>{fmtBp(bk.combined)}</span>
							{bk.raw > F && (
								<span style={{ color: C.faint }}> (cap binds)</span>
							)}
							<span style={{ color: C.faint }}>
								{" "}
								· D1: the bigger charge in full, the smaller at λ
							</span>
						</div>
						{bk.insideComp > 0 && (
							<div>
								<span style={{ color: C.dim }}>5 · inside comp</span> −{" "}
								{fmtBp(bk.insideComp)}{" "}
								<span style={{ color: C.faint }}>
									(parked module, reward channel)
								</span>
							</div>
						)}
						<div
							style={{
								marginTop: 6,
								borderTop: `1px solid ${C.line}`,
								paddingTop: 6,
							}}
						>
							<span style={{ color: C.fee, fontWeight: 700 }}>
								final {fmtBp(bk.final)}
							</span>
							<span style={{ color: C.dim }}>
								{" "}
								→ ${((bk.final / 10000) * bk.q).toFixed(2)} on this fill ·
								shortfall {((bk.final / F) * 100).toFixed(0)}% of a taker
							</span>
						</div>
					</>
				)}
			</div>

			<div
				style={{
					marginTop: 10,
					color: C.faint,
					fontSize: 12,
					lineHeight: 1.6,
				}}
			>
				M = midpoint of impact bid/ask: walk T dollars into each side,
				volume-weighted (quotes beyond 8×S of a side's best are invisible to the
				walk). Band = M ± S/2; in-band placement stamps at zero. A level's fee
				assumes the sweep reaches it: your better-priced same-side bars fill
				first and consume your opposite-side stock, so uncovered size spills
				outward — each level pairs against what remains. Directionality is the
				price.
			</div>
		</div>
	);
}
