import { Fragment, useMemo, useRef, useState } from "react";
import {
	type DemandParams,
	type EpochResult,
	runEpochs,
	type WindowGroup,
} from "../../lib/snapshot-fees/demand";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — the Typical Demand laboratory. Ten days of taker flow;
// D rebases at each close from two accumulators (S1, S2) and the reading
// S2/S1. Every guardrail is a dial: the machine's shape is a parameter
// choice, not a constant of the design.
// Mechanism lives in src/lib/snapshot-fees/demand.ts — this file renders.
// ————————————————————————————————————————————————————————————————

const NDAYS = 10;
const FLOW_MIN = 1000;
const FLOW_MAX = 200000;
const FLOW_STEP = 1000;

// dial defaults (scenario clicks reset to these)
const SEED_DEFAULT = 10000;
const FLOOR_DEFAULT = 5000;
const MIN_SAMPLE_DEFAULT = 25;
const ALPHA_DEFAULT = 0.5;
const LIMIT_DEFAULT = 4;

type DayType = "normal" | "whale" | "dust" | "quiet";
interface Day {
	flow: number;
	type: DayType;
}

const TYPE_ORDER: DayType[] = ["normal", "whale", "dust", "quiet"];
const TYPE_META: Record<DayType, { glyph: string; hint: string }> = {
	normal: { glyph: "N", hint: "500 windows at the dragged clip size" },
	whale: {
		glyph: "W",
		hint: "a normal day plus one giant window, 250× the clip",
	},
	dust: {
		glyph: "D",
		hint: "a normal day plus 5,000 windows of $100",
	},
	quiet: { glyph: "Q", hint: "8 windows at half the clip" },
};

/** A day's windows: [count, $ per window] groups fed to the machine. */
const windowsOf = (d: Day): WindowGroup[] => {
	if (d.type === "quiet") return [[8, d.flow * 0.5]];
	const base: WindowGroup[] = [[500, d.flow]];
	if (d.type === "whale") base.push([1, 250 * d.flow]);
	if (d.type === "dust") base.push([5000, 100]);
	return base;
};

const windowCountOf = (d: Day): number => {
	if (d.type === "quiet") return 8;
	if (d.type === "whale") return 501;
	if (d.type === "dust") return 5500;
	return 500;
};

interface DemandScenario {
	key: string;
	title: string;
	blurb: string;
	days: () => Day[];
	sel: number;
}

const daysOf = (flows: number[], type?: (i: number) => DayType): Day[] =>
	flows.map((k, i) => ({ flow: k * 1000, type: type ? type(i) : "normal" }));

const SCENARIOS: DemandScenario[] = [
	{
		key: "growth",
		title: "Growth",
		blurb:
			"Demand grows tenfold across the run. D chases at half the remaining log-gap per day, so the early doublings close fast and the last few percent barely move it. Nobody declares the regime change; the fills report it, and the ledger shows each day's step shrinking as D catches up.",
		days: () => daysOf([10, 13, 17, 22, 28, 36, 46, 60, 78, 100]),
		sel: 3,
	},
	{
		key: "surge",
		title: "Surge & Decay",
		blurb:
			"Two days of twenty-times demand in the middle of a normal run. D steps up while the surge lasts and back down as soon as it stops: the yardstick follows what actually trades, in both directions.",
		days: () => daysOf([10, 10, 10, 200, 200, 10, 10, 10, 10, 10]),
		sel: 4,
	},
	{
		key: "whale",
		title: "Whale Window",
		blurb:
			"A normal week, except day five contains one window 250 times the clip. The reading spikes, and the daily limit does its one job: however strange a single day, it moves D by at most L×. The derivation panel shows the raw step the limit cut down.",
		days: () =>
			daysOf(Array(NDAYS).fill(10), (i) => (i === 4 ? "whale" : "normal")),
		sel: 4,
	},
	{
		key: "dust",
		title: "Dust Storm",
		blurb:
			"Days four through seven each add five thousand windows of $100. The reading barely moves, because a window's weight in the average is its own dollars, and $100 windows carry almost none. The derivation shows the per-window mean for comparison, which those same windows would have collapsed.",
		days: () =>
			daysOf(Array(NDAYS).fill(10), (i) =>
				i >= 3 && i <= 6 ? "dust" : "normal",
			),
		sel: 4,
	},
	{
		key: "quiet",
		title: "Quiet Spell",
		blurb:
			"Days four through eight carry too little flow to clear the minimum sample, m × D, so D freezes: no update and no decay (the ❄ days in the ledger). A statistic needs a sample, and a dead afternoon is not one. Activity resumes, and so does the measurement.",
		days: () =>
			daysOf(Array(NDAYS).fill(10), (i) =>
				i >= 3 && i <= 7 ? "quiet" : "normal",
			),
		sel: 5,
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
	mark: "var(--lab-mark)",
	zone: "var(--lab-zone)",
	danger: "var(--lab-danger)",
	hint: "var(--lab-hint)",
};

const mono = "var(--lab-mono)";

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
	if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
	if (v >= 1000) return `$${(v / 1000).toFixed(v >= 99500 ? 0 : 1)}k`;
	return `$${Math.round(v)}`;
};
const fmt$ = (v: number) => `$${Math.round(v).toLocaleString()}`;

interface ParamProps {
	name: string;
	val: number;
	set: (v: number) => void;
	min: number;
	max: number;
	stp: number;
	fmt?: (v: number) => string;
	hint?: string;
}

function Param({ name, val, set, min, max, stp, fmt, hint }: ParamProps) {
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
					{fmt ? fmt(val) : val}
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
	y0: number;
	v0: number;
	moved: boolean;
}

export default function DemandLab() {
	const [days, setDays] = useState<Day[]>(SCENARIOS[0].days());
	const [seed, setSeed] = useState(SEED_DEFAULT);
	const [floor, setFloor] = useState(FLOOR_DEFAULT);
	const [minSample, setMinSample] = useState(MIN_SAMPLE_DEFAULT);
	const [alpha, setAlpha] = useState(ALPHA_DEFAULT);
	const [limit, setLimit] = useState(LIMIT_DEFAULT);
	const [sel, setSel] = useState(SCENARIOS[0].sel);
	const drag = useRef<DragState | null>(null);

	const params: DemandParams = useMemo(
		() => ({ seed, floor, minSample, alpha, limit }),
		[seed, floor, minSample, alpha, limit],
	);
	const rows: EpochResult[] = useMemo(
		() => runEpochs(days.map(windowsOf), params),
		[days, params],
	);
	const dFinal = rows[NDAYS - 1].dClose;

	const dialsDefault =
		seed === SEED_DEFAULT &&
		floor === FLOOR_DEFAULT &&
		minSample === MIN_SAMPLE_DEFAULT &&
		alpha === ALPHA_DEFAULT &&
		limit === LIMIT_DEFAULT;
	const activeScenario = dialsDefault
		? SCENARIOS.find((sc) => JSON.stringify(sc.days()) === JSON.stringify(days))
		: undefined;

	const applyScenario = (sc: DemandScenario) => {
		setDays(sc.days());
		setSel(sc.sel);
		setSeed(SEED_DEFAULT);
		setFloor(FLOOR_DEFAULT);
		setMinSample(MIN_SAMPLE_DEFAULT);
		setAlpha(ALPHA_DEFAULT);
		setLimit(LIMIT_DEFAULT);
	};

	// ——— chart geometry ———
	const VBW = 680;
	const VBH = 356;
	const PL = 56;
	const PR = 664;
	const PT = 16;
	const PB = 274;
	const slot = (PR - PL) / NDAYS;
	const xMid = (i: number) => PL + slot * (i + 0.5);
	const yMax = useMemo(() => {
		const vals = rows.flatMap((r, i) => [
			days[i].flow,
			r.dOpen,
			r.dClose,
			r.reading ?? 0,
		]);
		return Math.max(20000, ...vals) * 1.12;
	}, [rows, days]);
	const y = (v: number) => PB - (v / yMax) * (PB - PT);

	const stair = () => {
		let dstr = "";
		rows.forEach((r, i) => {
			const x0 = PL + slot * i;
			const x1 = x0 + slot;
			dstr += `${i ? "L" : "M"}${x0},${y(r.dOpen)} L${x1},${y(r.dOpen)} L${x1},${y(r.dClose)} `;
		});
		return dstr;
	};

	// ——— bar drag ———
	const onDown = (e: PointerEvent, i: number) => {
		(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
		drag.current = { i, y0: e.clientY, v0: days[i].flow, moved: false };
	};
	const onMove = (e: PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dy = d.y0 - e.clientY;
		if (Math.abs(dy) > 4) d.moved = true;
		if (!d.moved) return;
		const perPx = yMax / (PB - PT);
		const v = Math.max(
			FLOW_MIN,
			Math.min(
				FLOW_MAX,
				Math.round((d.v0 + dy * perPx) / FLOW_STEP) * FLOW_STEP,
			),
		);
		setDays((ds) =>
			ds[d.i].flow === v
				? ds
				: ds.map((x, k) => (k === d.i ? { ...x, flow: v } : x)),
		);
	};
	const onUp = (i: number) => {
		const d = drag.current;
		drag.current = null;
		setSel(d?.moved ? d.i : i);
	};
	const cycleType = (i: number) =>
		setDays((ds) =>
			ds.map((x, k) =>
				k === i
					? {
							...x,
							type: TYPE_ORDER[(TYPE_ORDER.indexOf(x.type) + 1) % 4],
						}
					: x,
			),
		);

	const typeColor = (t: DayType) =>
		t === "whale" ? C.hint : t === "dust" ? C.faint : C.zone;

	const r = rows[sel];
	const day = days[sel];

	return (
		<div class="sf-lab" style={{ color: C.text }}>
			{/* dials — every guardrail is a parameter */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "10px 14px",
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
					gap: "10px 18px",
					marginBottom: 10,
				}}
			>
				<Param
					name="Seed D₀"
					val={seed}
					set={setSeed}
					min={5000}
					max={50000}
					stp={5000}
					fmt={fmtK}
					hint="The launch value; constrains nothing afterward."
				/>
				<Param
					name="Floor"
					val={floor}
					set={setFloor}
					min={1000}
					max={20000}
					stp={1000}
					fmt={fmtK}
					hint="D never falls below it: keeps the walk's depth meaningful."
				/>
				<Param
					name="Min Sample · m"
					val={minSample}
					set={setMinSample}
					min={5}
					max={100}
					stp={5}
					fmt={(v) => `${v}×D`}
					hint="A day below m × D of flow freezes D."
				/>
				<Param
					name="Chase · α"
					val={alpha}
					set={setAlpha}
					min={0.1}
					max={1}
					stp={0.05}
					fmt={(v) => v.toFixed(2)}
					hint="Step = (reading/D)^α; 0.50 closes half the doublings."
				/>
				<Param
					name="Daily Limit · L"
					val={limit}
					set={setLimit}
					min={1.5}
					max={10}
					stp={0.5}
					fmt={(v) => `${v}×`}
					hint="One day moves D at most L× either way."
				/>
				<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
					<span style={{ ...label, fontSize: 9.5, letterSpacing: "0.1em" }}>
						Downstream
					</span>
					<span style={{ fontFamily: mono, fontSize: 12.5, color: C.mark }}>
						walk depth = D = {fmtK(dFinal)}
					</span>
					<span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.35 }}>
						The mark measures each side at the run's closing D.
					</span>
				</div>
			</div>

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
					viewBox={`0 0 ${VBW} ${VBH}`}
					style={{ width: "100%", display: "block", touchAction: "none" }}
					role="img"
					aria-label="Ten days of taker flow and the Typical Demand staircase"
				>
					{[0.25, 0.5, 0.75, 1].map((f) => (
						<g key={f}>
							<line
								x1={PL}
								x2={PR}
								y1={y((yMax * f) / 1.12)}
								y2={y((yMax * f) / 1.12)}
								stroke={C.grid}
							/>
							<text
								x={PL - 6}
								y={y((yMax * f) / 1.12) + 3.5}
								textAnchor="end"
								fontFamily={mono}
								fontSize={9.5}
								fill={C.faint}
							>
								{fmtK((yMax * f) / 1.12)}
							</text>
						</g>
					))}
					{rows.map((rr, i) => (
						<g key={days[i].flow * 7 + i}>
							<rect
								x={PL + slot * i}
								y={PT}
								width={slot}
								height={PB - PT}
								fill="transparent"
								style={{ cursor: "ns-resize" }}
								onPointerDown={(e) => onDown(e as unknown as PointerEvent, i)}
								onPointerMove={(e) => onMove(e as unknown as PointerEvent)}
								onPointerUp={() => onUp(i)}
								onPointerCancel={() => {
									drag.current = null;
								}}
							/>
							<rect
								x={xMid(i) - slot * 0.28}
								y={y(days[i].flow)}
								width={slot * 0.56}
								height={PB - y(days[i].flow)}
								fill={typeColor(days[i].type)}
								opacity={days[i].type === "quiet" ? 0.3 : 0.55}
								rx={2}
								pointerEvents="none"
								stroke={sel === i ? C.text : "none"}
								strokeWidth={sel === i ? 1.2 : 0}
							/>
							{rr.reading != null && (
								<path
									d={`M${xMid(i)},${y(rr.reading) - 5} l5,5 l-5,5 l-5,-5 z`}
									fill={C.text}
									opacity={0.9}
									pointerEvents="none"
								/>
							)}
							{(!rr.sampled || rr.limited || rr.floored) && (
								<text
									x={xMid(i)}
									y={Math.max(
										PT + 10,
										Math.min(y(Math.max(days[i].flow, rr.dOpen)), PB - 8) - 10,
									)}
									textAnchor="middle"
									fontSize={11}
									pointerEvents="none"
									fill={!rr.sampled ? C.dim : rr.floored ? C.bid : C.hint}
								>
									{!rr.sampled ? "❄" : rr.floored ? "⚓" : "⚠"}
								</text>
							)}
						</g>
					))}
					<path
						d={stair()}
						fill="none"
						stroke={C.mark}
						strokeWidth={2.2}
						pointerEvents="none"
					/>
					<text
						x={PR - 4}
						y={y(dFinal) - 7}
						fontFamily={mono}
						fontSize={10}
						fill={C.mark}
						textAnchor="end"
					>
						D {fmtK(dFinal)}
					</text>
					<line x1={PL} x2={PR} y1={PB} y2={PB} stroke={C.line} />
					{rows.map((_, i) => (
						// biome-ignore lint/a11y/useSemanticElements: SVG hit area, a real <button> cannot exist inside <svg>
						<g
							key={`g${days[i].type}${i}`}
							role="button"
							tabIndex={0}
							aria-label={`Day ${i + 1}: ${days[i].type}. Change the day's composition`}
							style={{ cursor: "pointer" }}
							onClick={() => cycleType(i)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") cycleType(i);
							}}
						>
							<text
								x={xMid(i)}
								y={PB + 15}
								textAnchor="middle"
								fontFamily={mono}
								fontSize={10}
								fill={C.dim}
							>
								d{i + 1}
							</text>
							<rect
								x={xMid(i) - 9}
								y={PB + 22}
								width={18}
								height={16}
								rx={3}
								fill={C.panel2}
								stroke={typeColor(days[i].type)}
								strokeWidth={0.8}
							/>
							<text
								x={xMid(i)}
								y={PB + 34}
								textAnchor="middle"
								fontFamily={mono}
								fontSize={10}
								fill={typeColor(days[i].type)}
							>
								{TYPE_META[days[i].type].glyph}
							</text>
						</g>
					))}
				</svg>
				<p
					style={{
						margin: "6px 10px 8px",
						fontSize: 11.5,
						lineHeight: 1.55,
						color: C.faint,
					}}
				>
					Each bar is one day's typical per-window demand: drag it to resize the
					day, click the letter beneath to change the day's composition, click a
					bar to inspect its derivation. The staircase is D itself, rebased at
					each close; diamonds mark each day's reading. ❄ below the minimum
					sample (D frozen) · ⚠ step limited · ⚓ held at the floor.
				</p>
			</div>

			{/* rebase ledger */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "10px 12px",
					marginTop: 10,
					fontFamily: mono,
					fontSize: 11.5,
				}}
			>
				<div style={{ ...label, marginBottom: 6 }}>Rebase Ledger</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "30px 1fr 34px 1fr 56px 1fr",
						gap: "3px 8px",
						color: C.dim,
					}}
				>
					<span>day</span>
					<span>flow S1</span>
					<span>sample</span>
					<span>reading</span>
					<span>step</span>
					<span>D after</span>
					{rows.map((rr, i) => (
						<Fragment key={`l${i * 2}`}>
							<button
								type="button"
								onClick={() => setSel(i)}
								style={{
									all: "unset",
									color: sel === i ? C.mark : C.text,
									cursor: "pointer",
									fontFamily: mono,
								}}
							>
								d{i + 1}
							</button>
							<span style={{ color: C.faint }}>{fmtK(rr.s1)}</span>
							<span style={{ color: rr.sampled ? C.bid : C.dim }}>
								{rr.sampled ? "✓" : "❄"}
							</span>
							<span style={{ color: C.text }}>
								{rr.reading != null ? fmtK(rr.reading) : "—"}
							</span>
							<span style={{ color: rr.limited ? C.hint : C.text }}>
								{rr.sampled ? `×${rr.step.toFixed(2)}` : "—"}
							</span>
							<span style={{ color: C.mark }}>
								{fmtK(rr.dClose)}
								{rr.floored ? " ⚓" : ""}
								{rr.limited ? " ⚠" : ""}
							</span>
						</Fragment>
					))}
				</div>
			</div>

			{/* selected-day derivation */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderRadius: 8,
					padding: "12px 14px",
					marginTop: 10,
					fontFamily: mono,
					fontSize: 12,
					lineHeight: 1.7,
				}}
			>
				<div style={{ ...label, marginBottom: 6 }}>
					Day {sel + 1} Derivation ·{" "}
					<span style={{ color: typeColor(day.type), textTransform: "none" }}>
						{day.type}
					</span>{" "}
					<span style={{ textTransform: "none" }}>
						· {TYPE_META[day.type].hint}
					</span>
				</div>
				<div>
					<span style={{ color: C.dim }}>1 · accumulate</span> — S1 = Σ v ={" "}
					{fmt$(r.s1)} · S2 = Σ v²
				</div>
				<div>
					<span style={{ color: C.dim }}>2 · minimum sample</span> — S1{" "}
					{r.sampled ? "≥" : "<"} {minSample} × D = {fmt$(minSample * r.dOpen)}{" "}
					→{" "}
					{r.sampled ? (
						<span style={{ color: C.bid }}>update</span>
					) : (
						<span style={{ color: C.dim }}>
							frozen — D holds at {fmt$(r.dOpen)}, no decay
						</span>
					)}
				</div>
				{r.sampled && r.reading != null && r.rawStep != null && (
					<>
						<div>
							<span style={{ color: C.dim }}>3 · reading</span> — S2/S1 ={" "}
							<span style={{ color: C.text }}>{fmt$(r.reading)}</span>
							{day.type === "dust" && (
								<span style={{ color: C.faint }}>
									{" "}
									· 5,000 dust windows barely move it — a per-window mean would
									read {fmtK(r.s1 / windowCountOf(day))}
								</span>
							)}
						</div>
						<div>
							<span style={{ color: C.dim }}>4 · rebase</span> — D ← D ×
							(reading/D)^{alpha.toFixed(2)} = {fmtK(r.dOpen)} × (
							{fmtK(r.reading)}/{fmtK(r.dOpen)})^{alpha.toFixed(2)} = ×
							{r.rawStep.toFixed(3)}
							{r.limited && (
								<span style={{ color: C.hint }}>
									{" "}
									→ limited to ×{r.step.toFixed(2)}
								</span>
							)}
						</div>
						<div
							style={{
								borderTop: `1px solid ${C.line}`,
								marginTop: 5,
								paddingTop: 5,
							}}
						>
							<span style={{ color: C.mark, fontWeight: 700 }}>
								D: {fmt$(r.dOpen)} → {fmt$(r.dClose)}
							</span>
							{r.floored && (
								<span style={{ color: C.bid }}> · ⚓ held at the floor</span>
							)}
						</div>
					</>
				)}
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
					? activeScenario.blurb
					: "Custom demand history, yours to shape. Drag the bars and dials freely; pick a scenario to return to a defined state."}
			</div>
		</div>
	);
}
