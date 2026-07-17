import { useMemo, useRef, useState } from "react";
import {
	type DemandParams,
	type EpochResult,
	runEpochs,
	type WindowGroup,
} from "../../lib/snapshot-fees/demand";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — the Typical Demand laboratory. Ten days of demand and
// three D staircases chasing them at α = 1/2, 2/3, 3/4. Layout and
// interaction grammar follow BaseFeeLab: dials above the chart, a live
// table on the right, one hover state driving crosshair, popup, and row.
// Mechanism lives in src/lib/snapshot-fees/demand.ts — this file renders.
// ————————————————————————————————————————————————————————————————

const NDAYS = 10;
// Each day is modeled as this many equal windows at the dragged demand:
// enough that the minimum sample never binds at chart scale. The freeze
// behavior is prose material; this lab shows the chase, limit, and floor.
const WINDOWS_PER_DAY = 5000;
const FLOW_MIN = 10_000;
const FLOW_MAX = 1_000_000;
const FLOW_STEP = 10_000;
const YMAX = 1_000_000; // fixed dollar scale — the chart never rescales

// dial defaults (scenario clicks reset to these)
const L_DEFAULT = 4;
const SEED_DEFAULT = 100_000;
const FLOOR_DEFAULT = 50_000;
// The minimum sample is fixed and, at 5000 windows/day, never binds within
// the chart's range: its units have no visible referent here.
const M_FIXED = 25;

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
	mark: "var(--lab-mark)",
	zone: "var(--lab-zone)",
	inset: "var(--lab-inset)",
	danger: "var(--lab-danger)",
	fee: "var(--lab-fee)",
	hint: "var(--lab-hint)",
};

const mono = "var(--lab-mono)";

// the three chases, slowest to fastest — red / yellow / green for contrast
const CHASES = [
	{ alpha: 1 / 2, name: "α = 1/2", color: C.fee },
	{ alpha: 2 / 3, name: "α = 2/3", color: C.hint },
	{ alpha: 3 / 4, name: "α = 3/4", color: C.bid },
];

const label = {
	fontFamily: mono,
	fontSize: 10,
	letterSpacing: "0.14em",
	color: C.dim,
	textTransform: "uppercase",
	whiteSpace: "nowrap",
} as const;

const btn = (active: boolean) => ({
	background: active ? C.text : C.panel2,
	border: `1px solid ${active ? C.text : C.line}`,
	color: active ? C.panel2 : C.dim,
	fontSize: 11,
	padding: "4px 10px",
	borderRadius: 5,
	cursor: "pointer",
});

const fmtK = (v: number) => {
	if (v >= 1e6) {
		const m = v / 1e6;
		return `$${Number.isInteger(m) ? m : m.toFixed(2)}M`;
	}
	if (v >= 1000) {
		const k = v / 1000;
		return `$${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
	}
	return `$${Math.round(v)}`;
};

interface DemandScenario {
	key: string;
	title: string;
	blurb: string;
	flows: () => number[];
	sel: number;
}

const K = 1000;
const SCENARIOS: DemandScenario[] = [
	{
		key: "growth",
		title: "Growth",
		blurb:
			"Demand climbs tenfold across the run. The three chases follow at their own speeds: α = 3/4 closes the gap in the fewest days, α = 1/2 trails furthest behind but moves the least on any one reading. The spread between the lines is the whole trade-off the exponent controls.",
		flows: () => [100, 130, 170, 220, 280, 360, 460, 600, 780, 1000],
		sel: 4,
	},
	{
		key: "step",
		title: "Step Change",
		blurb:
			"Demand jumps fivefold on day two and holds at the new level. How long D takes to settle there is what the chase speed means in days: within one percent of the new level, α = 3/4 is in force by day six, α = 2/3 by day seven, and α = 1/2 not until day ten. Each day closes the same fraction of the remaining gap, so the first days do most of the work and the last percent takes the longest.",
		flows: () => [100, 500, 500, 500, 500, 500, 500, 500, 500, 500],
		sel: 3,
	},
	{
		key: "surge",
		title: "Surge & Decay",
		blurb:
			"Two days of eightfold demand in the middle of a normal run. Every line climbs while the surge lasts and comes back down when it ends; the faster the chase, the further it follows the spike and the more it has to give back. Nothing needs to declare the surge over: the fills stop reporting it.",
		flows: () => [100, 100, 100, 800, 800, 100, 100, 100, 100, 100],
		sel: 4,
	},
	{
		key: "loud",
		title: "One Loud Day",
		blurb:
			"A single day of demand ten times the rest. The raw steps for the two faster chases exceed the daily limit and are held to L×, while the slowest stays inside it, which is why the yellow and green lines enter the next day at the same value. Lower L and all three flatten toward the same bounded step; the days after walk everything back down.",
		flows: () => [100, 100, 100, 100, 1000, 100, 100, 100, 100, 100],
		sel: 4,
	},
	{
		key: "drain",
		title: "Draining Away",
		blurb:
			"Demand shrinks through the whole run. The lines follow it down until they reach the floor, D_min, and stop: the walk's depth never falls below what the mark needs to stay meaningful, however small the market gets. Raise the floor and the lines level off sooner; lower it and they chase the decline further.",
		flows: () => [100, 80, 60, 45, 35, 25, 20, 15, 10, 10],
		sel: 7,
	},
];

interface DragState {
	i: number;
	moved: boolean;
}

export default function DemandLab() {
	const [flows, setFlows] = useState<number[]>(SCENARIOS[0].flows());
	const [L, setL] = useState(L_DEFAULT);
	const [seed, setSeed] = useState(SEED_DEFAULT);
	const [floor, setFloor] = useState(FLOOR_DEFAULT);
	const [hover, setHover] = useState<number | null>(null);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const drag = useRef<DragState | null>(null);

	const days: WindowGroup[][] = useMemo(
		() => flows.map((f) => [[WINDOWS_PER_DAY, f * K] as WindowGroup]),
		[flows],
	);
	const runs: EpochResult[][] = useMemo(
		() =>
			CHASES.map((ch) => {
				const p: DemandParams = {
					seed,
					floor,
					minSample: M_FIXED,
					alpha: ch.alpha,
					limit: L,
				};
				return runEpochs(days, p);
			}),
		[days, seed, floor, L],
	);

	// active scenario is derived, never stored
	const dialsDefault =
		L === L_DEFAULT && seed === SEED_DEFAULT && floor === FLOOR_DEFAULT;
	const activeScenario = dialsDefault
		? SCENARIOS.find(
				(sc) => JSON.stringify(sc.flows()) === JSON.stringify(flows),
			)
		: undefined;
	const applyScenario = (sc: DemandScenario) => {
		setFlows(sc.flows());
		setL(L_DEFAULT);
		setSeed(SEED_DEFAULT);
		setFloor(FLOOR_DEFAULT);
		setHover(sc.sel);
	};

	// blurb markup: [[Title]] or [[Title|shown text]] selects that scenario
	const renderBlurb = (text: string) => {
		const parts = text.split(/\[\[([^\]]+)\]\]/g);
		return parts.map((part, i) => {
			if (i % 2 === 0) return part;
			const [ref, shown] = part.split("|");
			const target = SCENARIOS.find((sc) => sc.title === ref.trim());
			const labelText = (shown ?? ref).trim();
			if (!target) return labelText;
			return (
				<button
					key={i}
					type="button"
					onClick={() => applyScenario(target)}
					style={{
						background: "none",
						border: "none",
						padding: 0,
						font: "inherit",
						color: C.text,
						textDecoration: "underline",
						textDecorationStyle: "dotted",
						textUnderlineOffset: 3,
						cursor: "pointer",
					}}
				>
					{labelText}
				</button>
			);
		});
	};

	// geometry — viewBox sized for the two-thirds slot, like the base fee lab
	const VBW = 580;
	const VBH = 380;
	const PL = 78;
	const PR = 550;
	const PT = 30;
	const PB = 308;
	const slot = (PR - PL) / NDAYS;
	const xMid = (i: number) => PL + slot * (i + 0.5);
	const y = (v: number) => PB - (v / YMAX) * (PB - PT);

	const stairOf = (rr: EpochResult[]) => {
		let d = `M${PL},${y(rr[0].dOpen)} `;
		rr.forEach((r, i) => {
			const x1 = PL + slot * (i + 1);
			d += `L${x1},${y(r.dOpen)} L${x1},${y(r.dClose)} `;
		});
		return d;
	};

	// ——— bar drag: pointer y maps straight onto the fixed dollar scale ———
	const flowFromClientY = (clientY: number) => {
		const r = svgRef.current?.getBoundingClientRect();
		if (!r) return FLOW_MIN;
		const sy = ((clientY - r.top) / r.height) * VBH;
		const v = ((PB - sy) / (PB - PT)) * YMAX;
		return Math.max(
			FLOW_MIN,
			Math.min(FLOW_MAX, Math.round(v / FLOW_STEP) * FLOW_STEP),
		);
	};
	const onBarDown = (e: PointerEvent, i: number) => {
		(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
		drag.current = { i, moved: false };
		setHover(i);
	};
	const onBarMove = (e: PointerEvent, i: number) => {
		setHover(i);
		const d = drag.current;
		if (!d || d.i !== i) return;
		d.moved = true;
		const v = flowFromClientY(e.clientY) / K;
		setFlows((fs) => (fs[i] === v ? fs : fs.map((x, k) => (k === i ? v : x))));
	};
	const onBarUp = () => {
		drag.current = null;
	};

	return (
		<div class="sf-lab" style={{ color: C.text }}>
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "6px 4px 2px",
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
					TYPICAL DEMAND: THE DAILY REBASE
				</div>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "4px 16px",
						alignItems: "stretch",
						margin: "0 10px",
						borderTop: `1px solid ${C.line}`,
					}}
				>
					{/* —— left two-thirds: dials above, the chart below —— */}
					<div style={{ flex: "2 1 400px", minWidth: 300 }}>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
								gap: "10px 16px",
								padding: "10px 12px 8px 4px",
							}}
						>
							<Param
								name="Seed · D₀"
								val={seed}
								set={setSeed}
								min={50_000}
								max={500_000}
								stp={50_000}
								fmt={fmtK}
								hint="Where every line starts on day one."
							/>
							<Param
								name="Floor · D_min"
								val={floor}
								set={setFloor}
								min={25_000}
								max={250_000}
								stp={25_000}
								fmt={fmtK}
								hint="D never falls below it, whatever demand does."
							/>
							<Param
								name="Daily Limit · L"
								val={L}
								set={setL}
								min={1.5}
								max={10}
								stp={0.5}
								suffix="×"
								hint="One day moves D at most L× either way."
							/>
						</div>

						<svg
							ref={svgRef}
							viewBox={`0 0 ${VBW} ${VBH}`}
							style={{ width: "100%", display: "block", touchAction: "none" }}
							role="img"
							aria-label="Ten days of demand as draggable bars, with three D staircases chasing them at different speeds"
						>
							{/* fixed dollar gridlines */}
							{[250_000, 500_000, 750_000, 1_000_000].map((v) => (
								<g key={v}>
									<line
										x1={PL}
										x2={PR}
										y1={y(v)}
										y2={y(v)}
										strokeWidth={1}
										style={{ stroke: C.grid }}
									/>
									<text
										x={PL - 8}
										y={y(v) + 4.5}
										textAnchor="end"
										fontSize={12}
										style={{ fill: C.faint, fontFamily: mono }}
									>
										{fmtK(v)}
									</text>
								</g>
							))}
							<text
								x={PL - 8}
								y={y(0) + 4.5}
								textAnchor="end"
								fontSize={12}
								style={{ fill: C.faint, fontFamily: mono }}
							>
								0
							</text>
							<text
								x={13}
								y={(PT + PB) / 2}
								fontSize={11}
								transform={`rotate(-90 13 ${(PT + PB) / 2})`}
								textAnchor="middle"
								letterSpacing="0.12em"
								style={{ fill: C.dim, fontFamily: mono }}
							>
								DEMAND · $
							</text>

							{/* the day bars */}
							{flows.map((f, i) => (
								<g key={`b${i * 7}`}>
									<rect
										x={xMid(i) - slot * 0.3}
										y={y(f * K)}
										width={slot * 0.6}
										height={PB - y(f * K)}
										rx={2}
										fill={C.faint}
										opacity={hover === i ? 0.55 : 0.35}
										pointerEvents="none"
									/>
									{hover === i && (
										<line
											x1={xMid(i)}
											x2={xMid(i)}
											y1={PT}
											y2={PB}
											strokeWidth={1}
											strokeDasharray="2 4"
											opacity={0.7}
											style={{ stroke: C.text }}
											pointerEvents="none"
										/>
									)}
								</g>
							))}

							{/* the three chases */}
							{CHASES.map((ch, k) => (
								<path
									key={ch.name}
									d={stairOf(runs[k])}
									fill="none"
									strokeWidth={2}
									pointerEvents="none"
									style={{ stroke: ch.color, transition: "all 120ms" }}
								/>
							))}

							{/* hover popup: the day's demand, then one row per chase with
							    its close, the day's move, and the move in percent */}
							{hover != null &&
								(() => {
									const i = hover;
									const rows = CHASES.map((ch, k) => ({
										ch,
										r: runs[k][i],
									}));
									const demand = flows[i] * K;
									const fmtD = (v: number) =>
										`${v >= 0 ? "+" : "−"}${fmtK(Math.abs(v)).slice(1)}`;
									const fmtP = (v: number) => {
										const p = (v / demand) * 100;
										return `${p >= 0 ? "+" : "−"}${Math.abs(p) >= 100 ? Math.round(Math.abs(p)) : Math.abs(p).toFixed(1)}%`;
									};
									const bw = 252;
									const bh = 118;
									const bx =
										xMid(i) + 12 + bw > PR ? xMid(i) - 12 - bw : xMid(i) + 12;
									const by = PT + 4;
									// column centers; headers and cells share them, centered
									const cols = [30, 80, 152, 220];
									return (
										<g pointerEvents="none">
											<rect
												x={bx}
												y={by}
												width={bw}
												height={bh}
												rx={5}
												strokeWidth={0.75}
												style={{ fill: C.panel2, stroke: C.line }}
											/>
											<text
												x={bx + 12}
												y={by + 20}
												fontSize={13}
												style={{ fill: C.text, fontFamily: mono }}
											>
												Day {i + 1} · {fmtK(flows[i] * K)} Demand
											</text>
											{["α", "D", "vs Demand", "%"].map((h, k) => (
												<text
													key={h}
													x={bx + cols[k]}
													y={by + 40}
													textAnchor="middle"
													fontSize={10.5}
													style={{ fill: C.faint, fontFamily: mono }}
												>
													{h}
												</text>
											))}
											{rows.map(({ ch, r }, k) => (
												<g key={ch.name}>
													{[
														ch.name.replace("α = ", ""),
														fmtK(r.dOpen),
														fmtD(r.dOpen - demand),
														fmtP(r.dOpen - demand),
													].map((cell, c) => (
														<text
															key={`${ch.name}c${c}`}
															x={bx + cols[c]}
															y={by + 60 + k * 19}
															textAnchor="middle"
															fontSize={12.5}
															style={{ fill: ch.color, fontFamily: mono }}
														>
															{cell}
														</text>
													))}
												</g>
											))}
										</g>
									);
								})()}

							{/* per-day drag strips */}
							{flows.map((_, i) => (
								<rect
									key={`s${i * 3}`}
									x={PL + slot * i}
									y={PT}
									width={slot}
									height={PB - PT}
									fill="transparent"
									style={{ cursor: "ns-resize" }}
									onPointerDown={(e) =>
										onBarDown(e as unknown as PointerEvent, i)
									}
									onPointerMove={(e) =>
										onBarMove(e as unknown as PointerEvent, i)
									}
									onPointerUp={onBarUp}
									onPointerCancel={onBarUp}
									onPointerLeave={() =>
										setHover((h) => (h === i && !drag.current ? null : h))
									}
								/>
							))}

							{/* day axis */}
							<line
								x1={PL}
								x2={PR}
								y1={PB}
								y2={PB}
								style={{ stroke: C.line }}
							/>
							{flows.map((_, i) => (
								<text
									key={`d${i * 5}`}
									x={xMid(i)}
									y={PB + 18}
									textAnchor="middle"
									fontSize={11}
									style={{ fill: C.faint, fontFamily: mono }}
								>
									d{i + 1}
								</text>
							))}
							<text
								x={(PL + PR) / 2}
								y={PB + 40}
								textAnchor="middle"
								fontSize={11}
								letterSpacing="0.12em"
								style={{ fill: C.dim, fontFamily: mono }}
							>
								TEN DAYS OF TRADING
							</text>
						</svg>
						<div
							style={{
								fontSize: 12,
								fontStyle: "italic",
								color: C.faint,
								textAlign: "center",
								padding: "4px 8px 8px",
								lineHeight: 1.5,
							}}
						>
							Instructions: Drag a day's bar to set its demand. Hover a day, or
							a table row, to read all three chases. Dials apply to every line.
						</div>
					</div>

					{/* —— right third: the run, live —— */}
					<div
						style={{
							flex: "1 1 210px",
							minWidth: 200,
							padding: "8px 0 8px",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							style={{
								border: `1px solid ${C.line}`,
								borderRadius: 6,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "30px 1fr 1fr 1fr 1fr",
									background: C.inset,
									padding: "8px 6px 6px",
									borderBottom: `1px solid ${C.line}`,
								}}
							>
								<span
									style={{
										...label,
										fontSize: 9,
										letterSpacing: "0.06em",
										textAlign: "center",
									}}
								>
									Day
								</span>
								<span
									style={{
										...label,
										fontSize: 9,
										letterSpacing: "0.06em",
										textAlign: "center",
									}}
								>
									Demand
								</span>
								{CHASES.map((ch) => (
									<span
										key={ch.name}
										style={{
											...label,
											fontSize: 9,
											letterSpacing: "0.06em",
											textAlign: "center",
											color: ch.color,
										}}
									>
										{ch.name.replace("α = ", "")}
									</span>
								))}
							</div>
							{flows.map((f, i) => {
								const isHover = hover === i;
								return (
									<div
										key={`r${i * 11}`}
										onPointerEnter={() => setHover(i)}
										onPointerLeave={() => setHover(null)}
										style={{
											display: "grid",
											gridTemplateColumns: "30px 1fr 1fr 1fr 1fr",
											padding: "3px 6px",
											cursor: "crosshair",
											borderLeft: `2px solid ${isHover ? C.text : "transparent"}`,
											background: isHover ? "var(--lab-band)" : "transparent",
											fontFamily: mono,
											fontSize: 11,
											lineHeight: 1.6,
										}}
									>
										<span style={{ textAlign: "center", color: C.dim }}>
											d{i + 1}
										</span>
										<span style={{ textAlign: "center", color: C.text }}>
											{fmtK(f * K)}
										</span>
										{CHASES.map((ch, k) => (
											<span
												key={ch.name}
												style={{ textAlign: "center", color: ch.color }}
											>
												{fmtK(runs[k][i].dOpen)}
											</span>
										))}
									</div>
								);
							})}
							{/* where each line finishes after the last day's close */}
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "30px 1fr 1fr 1fr 1fr",
									padding: "3px 6px",
									borderTop: `1px solid ${C.line}`,
									fontFamily: mono,
									fontSize: 11,
									lineHeight: 1.6,
								}}
							>
								<span style={{ textAlign: "center", color: C.faint }}>end</span>
								<span style={{ textAlign: "center", color: C.faint }}>—</span>
								{CHASES.map((ch, k) => (
									<span
										key={ch.name}
										style={{ textAlign: "center", color: ch.color }}
									>
										{fmtK(runs[k][NDAYS - 1].dClose)}
									</span>
								))}
							</div>
						</div>
						<div
							style={{
								fontSize: 11,
								color: C.faint,
								padding: "6px 2px 0",
								lineHeight: 1.45,
							}}
						>
							D in force on each day, set at the prior day's close; the end row
							is where the run finishes. Hover a row to read each line's gap to
							that day's demand.
						</div>
					</div>
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
						style={{ ...btn(activeScenario?.key === sc.key), flex: "1 1 auto" }}
					>
						{sc.title}
					</button>
				))}
				<button
					type="button"
					style={{ ...btn(!activeScenario), flex: "1 1 auto" }}
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
				{activeScenario
					? renderBlurb(activeScenario.blurb)
					: "Custom demand history, yours to shape. Drag the bars and dials freely; pick a scenario to return to a defined state."}
			</div>
		</div>
	);
}

interface ParamProps {
	name: string;
	val: number;
	set: (v: number) => void;
	min: number;
	max: number;
	stp: number;
	suffix?: string;
	fmt?: (v: number) => string;
	hint?: string;
}

function Param({
	name,
	val,
	set,
	min,
	max,
	stp,
	suffix,
	fmt,
	hint,
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
						accentColor: "var(--lab-slider)",
					}}
				/>
				<span
					style={{
						fontFamily: mono,
						fontSize: 11.5,
						color: C.text,
						whiteSpace: "nowrap",
						width: "6ch",
						textAlign: "right",
						flexShrink: 0,
					}}
				>
					{fmt ? fmt(val) : `${val}${suffix ?? ""}`}
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
