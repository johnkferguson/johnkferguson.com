import { useEffect, useRef, useState } from "react";
import { baseFeeBps, stampCapBps } from "../../lib/snapshot-fees/engine";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — base fee laboratory. The simplest piece of the
// mechanism: one order's placement against the declared standard.
// fee(d) = min(F, k₁ × min(d, Z) + k₂ × max(0, d − Z)) past the band.
// Left: dials + the curve (Band Edge, Zone Edge, and Cap are draggable).
// Right: the schedule, live, in 0.5bps rows with region separators.
// ————————————————————————————————————————————————————————————————

const C = {
	panel: "var(--lab-panel)",
	panel2: "var(--lab-panel2)",
	line: "var(--lab-line)",
	grid: "var(--lab-grid)",
	text: "var(--lab-text)",
	dim: "var(--lab-dim)",
	faint: "var(--lab-faint)",
	fee: "var(--lab-fee)",
	mark: "var(--lab-mark)",
	band: "var(--lab-band)",
	bandEdge: "var(--lab-band-edge)",
	zone: "var(--lab-zone)",
	zoneSoft: "var(--lab-zone-soft)",
	danger: "var(--lab-danger)",
	inset: "var(--lab-inset)",
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
						width: "7ch",
						textAlign: "right",
						flexShrink: 0,
					}}
				>
					{val}
					{suffix || ""}
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

const snap = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, v));

interface FeeScenario {
	key: string;
	title: string;
	blurb: string;
	params: { B: number; Z: number; F: number; slope: number; slope2: number };
}

// Calibration tour: each scenario is a full dial setting with a caption that
// says what to notice. Selection is derived by matching the current dials, so
// dialing back to a defined state re-highlights its button.
const FEE_SCENARIOS: FeeScenario[] = [
	{
		key: "default",
		title: "Default",
		blurb: `The Inner Band is set to 2bps, giving a 1bps region on each side of M where the base fee is zero.

The Maker Zone extends 4bps beyond the band's edge. Within it, the fee rises 0.8bps for every 1bps of additional distance, so a maker's net edge still grows by 0.2bps per bps while pricing further out.

The Far Slope raises the fee 0.95bps per 1bps of distance beyond the zone. Net edge still inches upward, 0.05bps per bps, until the Fee Cap is reached at 12.2bps from M.

The Fee Cap is set to 10bps: past the full-fee point, resting far costs the same as a market order, never more.`,
		params: { B: 2, Z: 4, F: 10, slope: 0.8, slope2: 0.95 },
	},
	{
		key: "flat",
		title: "Flat Slopes",
		blurb: `Both slopes are cut to 0.25bps of fee per 1bps of distance, the dials' floor. The band, zone, and cap stay at their [[Default]] settings.

With so gentle a climb, the full fee is not reached until roughly 41bps from M, far off the chart (see the Full Fee readout). Between 2bps and 20bps out, the fee moves only about 4.5bps.

The consequence: tight and wide placement pay nearly the same, so the schedule stops rewarding tight quotes. This is close to today's flat maker fee, expressed in this mechanism's terms.`,
		params: { B: 2, Z: 4, F: 10, slope: 0.25, slope2: 0.25 },
	},
	{
		key: "steep",
		title: "Steep Slopes",
		blurb: `Both slopes are raised above 1, to 1.1.

Each 1bps of additional distance now adds 1.1bps of fee, so net edge falls by 0.1bps per bps as placement widens; the Net Edge curve slopes downward everywhere outside the band. Quoting wider is a net loss at every distance.

The Fee Cap is reached at 10.1bps from M. The schedule taxes width instead of discounting it, pinning makers to the band's edge and making depth beyond it irrational.`,
		params: { B: 2, Z: 4, F: 10, slope: 1.1, slope2: 1.1 },
	},
	{
		key: "cliff",
		title: "Cliff at the Zone Edge",
		blurb: `The Zone Slope is cut to 0.3 while the Far Slope jumps to 2.5.

Inside the zone, width is nearly free: the fee grows just 0.3bps per 1bps of distance, net edge grows 0.7bps per bps, and the entire 4bps zone costs only 1.2bps. Past the zone edge the fee sprints upward, reaching the cap at 8.5bps from M.

The knee becomes a policy lever: the market discounts the working width it wants makers to use, and punishes parking liquidity beyond it.`,
		params: { B: 2, Z: 4, F: 10, slope: 0.3, slope2: 2.5 },
	},
	{
		key: "earlycap",
		title: "Early Cap",
		blurb: `The Fee Cap is lowered to 5bps and the Maker Zone widened to 8bps; both slopes stay at their defaults.

The fee now reaches the cap at 7.3bps from M, inside the zone itself, so the Far Slope never engages. Every placement past the full-fee point prices identically: the schedule can no longer tell 8bps out from 20bps out.

Set too low, the cap erases the distance signal the mechanism runs on. F protects resting orders from paying more than takers, but it has to be tuned together with the slopes and the zone.`,
		params: { B: 2, Z: 8, F: 5, slope: 0.8, slope2: 0.95 },
	},
];

const btn = (active: boolean) => ({
	background: active ? C.text : C.panel2,
	border: `1px solid ${active ? C.text : C.line}`,
	color: active ? C.panel2 : C.dim,
	fontSize: 11,
	padding: "4px 10px",
	borderRadius: 5,
	cursor: "pointer",
});

type EdgeDrag = "band" | "zone" | "cap" | null;

export default function BaseFeeLab() {
	const [B, setB] = useState(2); // inner band width, bps
	const [Z, setZ] = useState(4); // Maker Zone width, bps beyond the band edge
	const [F, setF] = useState(10);
	const [slope, setSlope] = useState(0.8); // k₁, inside the zone
	const [slope2, setSlope2] = useState(0.95); // k₂, beyond the zone edge
	const [hover, setHover] = useState<number | null>(null);
	const tableRef = useRef<HTMLDivElement | null>(null);
	const activeRowRef = useRef<HTMLDivElement | null>(null);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const edgeDrag = useRef<EdgeDrag>(null);
	const [grabHover, setGrabHover] = useState<EdgeDrag>(null);

	// active scenario is derived, never stored: any dial state that exactly
	// matches a defined calibration lights its button, custom otherwise
	const dials = { B, Z, F, slope, slope2 };
	const activeScenario = FEE_SCENARIOS.find((sc) =>
		(Object.keys(sc.params) as (keyof FeeScenario["params"])[]).every(
			(k) => Math.abs(sc.params[k] - dials[k]) < 1e-9,
		),
	);
	const applyScenario = (sc: FeeScenario) => {
		setB(sc.params.B);
		setZ(sc.params.Z);
		setF(sc.params.F);
		setSlope(sc.params.slope);
		setSlope2(sc.params.slope2);
	};

	// blurb markup: [[Title]] or [[Title|shown text]] renders as an inline
	// link that selects that scenario
	const renderBlurb = (text: string) => {
		const parts = text.split(/\[\[([^\]]+)\]\]/g);
		return parts.map((part, i) => {
			if (i % 2 === 0) return part;
			const [ref, shown] = part.split("|");
			const target = FEE_SCENARIOS.find((sc) => sc.title === ref.trim());
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

	// the engine's curve, rendered (never re-implemented here)
	const feeAt = (d: number) => baseFeeBps(d, { B, F, Z, slope, slope2 });
	const netAt = (d: number) => d - feeAt(d);
	const dFull = B / 2 + stampCapBps({ F, Z, slope, slope2 });
	const dKnee = B / 2 + Z;

	// geometry — viewBox sized for the two-thirds slot so text stays legible
	const W = 580;
	const H = 390;
	const PL = 78;
	const PR = 545;
	const PT = 42;
	const PB = 320;
	const DMAX = 30;
	const xAt = (d: number) => PL + (d / DMAX) * (PR - PL);
	const yAt = (v: number) => PB - (v / 25) * (PB - PT);

	const pathOf = (fn: (d: number) => number) => {
		const pts: string[] = [];
		for (let d = 0; d <= DMAX + 0.001; d += 0.25) {
			pts.push(`${xAt(d)},${yAt(fn(d))}`);
		}
		return pts.join(" ");
	};
	const curve = pathOf(feeAt);
	const netCurve = pathOf(netAt);

	const dAt = (e: PointerEvent) => {
		const el = e.currentTarget as SVGRectElement;
		const r = el.getBoundingClientRect();
		const frac = (e.clientX - r.left) / r.width;
		const d = Math.max(0, Math.min(DMAX, frac * DMAX));
		return Math.round(d * 10) / 10;
	};

	// map client coordinates through the scaled viewBox for the edge drags
	const dFromClientX = (clientX: number) => {
		const r = svgRef.current?.getBoundingClientRect();
		if (!r) return 0;
		const sx = ((clientX - r.left) / r.width) * W;
		return clamp(((sx - PL) / (PR - PL)) * DMAX, 0, DMAX);
	};
	const feeFromClientY = (clientY: number) => {
		const r = svgRef.current?.getBoundingClientRect();
		if (!r) return 0;
		const sy = ((clientY - r.top) / r.height) * H;
		return clamp(((PB - sy) / (PB - PT)) * 25, 0, 25);
	};
	const applyEdgeDrag = (e: PointerEvent) => {
		if (edgeDrag.current === "band")
			setB(clamp(snap(2 * dFromClientX(e.clientX), 0.5), 1, 10));
		else if (edgeDrag.current === "zone")
			setZ(clamp(snap(dFromClientX(e.clientX) - B / 2, 0.5), 2, 20));
		else if (edgeDrag.current === "cap")
			setF(clamp(snap(feeFromClientY(e.clientY), 0.5), 5, 25));
	};
	const edgeStrip = (kind: Exclude<EdgeDrag, null>) => ({
		onPointerEnter: () => setGrabHover(kind),
		onPointerLeave: () => setGrabHover((g) => (g === kind ? null : g)),
		onPointerDown: (e: PointerEvent) => {
			(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
			edgeDrag.current = kind;
			applyEdgeDrag(e);
		},
		onPointerMove: (e: PointerEvent) => {
			if (edgeDrag.current === kind) applyEdgeDrag(e);
		},
		onPointerUp: () => {
			edgeDrag.current = null;
		},
		onPointerCancel: () => {
			edgeDrag.current = null;
		},
	});

	// in-plot line strips: draggable like the labels, but hover-transparent
	// so the crosshair keeps tracing straight through them
	const lineStrip = (kind: Exclude<EdgeDrag, null>) => {
		const base = edgeStrip(kind);
		return {
			...base,
			onPointerMove: (e: PointerEvent) => {
				setHover(Math.round(dFromClientX(e.clientX) * 10) / 10);
				base.onPointerMove(e);
			},
			onPointerLeave: () => {
				setHover(null);
				setGrabHover((g) => (g === kind ? null : g));
			},
		};
	};

	// the schedule, live: one row per 0.5bps of distance from M. The pointer
	// drives the highlighted row; colored rules mark the region boundaries.
	// The table always covers the chart's 30bps and keeps going when the
	// full-fee point lands beyond it, so the cap row is always in reach.
	const tableMax = Math.max(DMAX, Math.ceil(dFull) + 2);
	const schedRows: number[] = [];
	for (let d = 0; d <= tableMax + 0.001; d += 0.5) schedRows.push(d);
	const hoverRow = hover != null ? Math.round(hover * 2) / 2 : null;
	const sepColor = (d: number, next: number | undefined): string | null => {
		if (next == null) return null;
		if (d <= B / 2 + 1e-9 && next > B / 2 + 1e-9) return C.mark;
		if (d <= dKnee + 1e-9 && next > dKnee + 1e-9) return C.zone;
		if (feeAt(d) < F - 1e-9 && feeAt(next) >= F - 1e-9) return C.fee;
		return null;
	};

	// keep the hovered row in view — scroll the box only, never the page
	useEffect(() => {
		const box = tableRef.current;
		const el = activeRowRef.current;
		if (hoverRow == null || !box || !el) return;
		const headerH = 30;
		const top = el.offsetTop;
		const bottom = top + el.offsetHeight;
		if (top < box.scrollTop + headerH) box.scrollTop = top - headerH;
		else if (bottom > box.scrollTop + box.clientHeight)
			box.scrollTop = bottom - box.clientHeight;
	}, [hoverRow]);

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
					BASE FEE: THE PRICE OF PLACEMENT
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
					{/* —— left two-thirds: controls above, the curve below —— */}
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
								name="Inner Band · B"
								val={B}
								set={setB}
								min={1}
								max={10}
								stp={0.5}
								suffix="bps"
								hint="Width B, drawn M ± B/2."
							/>
							<Param
								name="Maker Zone · Z"
								val={Z}
								set={setZ}
								min={2}
								max={20}
								stp={0.5}
								suffix="bps"
								hint="Working radius past the band edge."
							/>
							<Param
								name="Fee Cap · F"
								val={F}
								set={setF}
								min={5}
								max={25}
								stp={0.5}
								suffix="bps"
								hint="Taker rate. Every fee's ceiling."
							/>
							<Param
								name="Zone Slope · k₁"
								val={slope}
								set={setSlope}
								min={0.25}
								max={3}
								stp={0.05}
								suffix="×"
								hint="Fee per bps inside the zone."
							/>
							<Param
								name="Far Slope · k₂"
								val={slope2}
								set={setSlope2}
								min={0.25}
								max={3}
								stp={0.05}
								suffix="×"
								hint="Fee per bps beyond the zone."
							/>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 3,
									background: C.inset,
									border: `1px solid ${C.line}`,
									borderRadius: 6,
									padding: "6px 10px",
									alignSelf: "start",
									minWidth: 0,
								}}
							>
								<span
									style={{ ...label, fontSize: 9.5, letterSpacing: "0.1em" }}
								>
									Full Fee Reached
								</span>
								<span
									style={{
										fontFamily: mono,
										fontSize: 11.5,
										color: C.text,
										whiteSpace: "nowrap",
									}}
								>
									{dFull.toFixed(1)}bps from M
								</span>
							</div>
						</div>

						<svg
							ref={svgRef}
							viewBox={`0 0 ${W} ${H}`}
							style={{ width: "100%", display: "block", touchAction: "none" }}
							role="img"
							aria-label="Base fee curve with draggable Band Edge, Zone Edge, and Cap; fee in bps against placement distance from the Mark"
						>
							<defs>
								<clipPath id="bf-plot">
									<rect x={PL} y={PT} width={PR - PL} height={PB - PT} />
								</clipPath>
							</defs>
							{/* gridlines */}
							{[5, 10, 15, 20, 25].map((v) => (
								<g key={v}>
									<line
										x1={PL}
										x2={PR}
										y1={yAt(v)}
										y2={yAt(v)}
										strokeWidth={1}
										style={{ stroke: C.grid }}
									/>
									{Math.abs(yAt(v) - yAt(F)) > 12 && (
										<text
											x={PL - 20}
											y={yAt(v) + 4.5}
											textAnchor="end"
											fontSize={13}
											style={{ fill: C.faint, fontFamily: mono }}
										>
											{v}
										</text>
									)}
								</g>
							))}
							<text
								x={PL - 20}
								y={yAt(0) + 4.5}
								textAnchor="end"
								fontSize={13}
								style={{ fill: C.faint, fontFamily: mono }}
							>
								0
							</text>
							<text
								x={11}
								y={(PT + PB) / 2}
								fontSize={12}
								transform={`rotate(-90 11 ${(PT + PB) / 2})`}
								textAnchor="middle"
								letterSpacing="0.12em"
								style={{ fill: C.dim, fontFamily: mono }}
							>
								FEE · BPS
							</text>

							{/* fee cap: axis tick plus a draggable line across the plot */}
							<g pointerEvents="none" style={{ transition: "all 150ms" }}>
								<text
									x={PL - 20}
									y={yAt(F) + 16}
									textAnchor="end"
									fontSize={9}
									letterSpacing="0.12em"
									style={{ fill: C.fee, fontFamily: mono }}
								>
									CAP
								</text>
								<text
									x={PL - 20}
									y={yAt(F) + 4.5}
									textAnchor="end"
									fontSize={13}
									style={{ fill: C.fee, fontFamily: mono }}
								>
									{F.toFixed(2)}
								</text>
								<path
									d={`M${PL - 16},${yAt(F) - 5} L${PL - 6},${yAt(F)} L${PL - 16},${yAt(F) + 5} Z`}
									style={{ fill: C.fee }}
								/>
								{grabHover === "cap" && (
									<>
										<path
											d={`M${PL - 15},${yAt(F) - 16} l 4,-5 l 4,5`}
											fill="none"
											strokeWidth={1.5}
											style={{ stroke: C.fee }}
										/>
										<path
											d={`M${PL - 15},${yAt(F) + 26} l 4,5 l 4,-5`}
											fill="none"
											strokeWidth={1.5}
											style={{ stroke: C.fee }}
										/>
									</>
								)}
								<line
									x1={PL}
									x2={PR}
									y1={yAt(F)}
									y2={yAt(F)}
									strokeDasharray="4 5"
									opacity={0.35}
									style={{ stroke: C.fee }}
								/>
							</g>

							{/* the inner band, then the Maker Zone tint */}
							<rect
								x={xAt(0)}
								y={PT}
								width={Math.max(0, xAt(B / 2) - xAt(0))}
								height={PB - PT}
								style={{ fill: C.band, transition: "all 220ms ease" }}
							/>
							<rect
								x={xAt(B / 2)}
								y={PT}
								width={Math.max(0, xAt(Math.min(dKnee, DMAX)) - xAt(B / 2))}
								height={PB - PT}
								style={{ fill: C.zoneSoft, transition: "all 220ms ease" }}
							/>
							<line
								x1={xAt(B / 2)}
								x2={xAt(B / 2)}
								y1={PT}
								y2={PB}
								strokeDasharray="3 4"
								strokeWidth={1}
								opacity={0.75}
								style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
							/>
							<text
								x={xAt(B / 2) - 6}
								y={PT - 6}
								textAnchor="end"
								fontSize={12}
								pointerEvents="none"
								style={{
									fill: C.mark,
									fontFamily: mono,
									transition: "all 220ms ease",
								}}
							>
								Band Edge
							</text>
							<rect
								x={xAt(B / 2) - 92}
								y={PT - 22}
								width={98}
								height={22}
								fill="transparent"
								style={{ cursor: "ew-resize" }}
								{...edgeStrip("band")}
							/>
							{grabHover === "band" && (
								<g pointerEvents="none">
									<path
										d={`M${xAt(B / 2) - 9},${PT + 8} l -5,4 l 5,4`}
										fill="none"
										strokeWidth={1.5}
										style={{ stroke: C.mark }}
									/>
									<path
										d={`M${xAt(B / 2) + 9},${PT + 8} l 5,4 l -5,4`}
										fill="none"
										strokeWidth={1.5}
										style={{ stroke: C.mark }}
									/>
								</g>
							)}

							{/* the zone edge: where the far slope takes over */}
							{dKnee <= DMAX && (
								<>
									<line
										x1={xAt(dKnee)}
										x2={xAt(dKnee)}
										y1={PT}
										y2={PB}
										strokeDasharray="3 4"
										strokeWidth={1}
										opacity={0.5}
										style={{ stroke: C.zone, transition: "all 220ms ease" }}
									/>
									<text
										x={xAt(dKnee) + 6}
										y={PT - 6}
										textAnchor="start"
										fontSize={12}
										pointerEvents="none"
										style={{
											fill: C.zone,
											fontFamily: mono,
											transition: "all 220ms ease",
										}}
									>
										Zone Edge
									</text>
									<rect
										x={xAt(dKnee) - 6}
										y={PT - 22}
										width={98}
										height={22}
										fill="transparent"
										style={{ cursor: "ew-resize" }}
										{...edgeStrip("zone")}
									/>
									{grabHover === "zone" && (
										<g pointerEvents="none">
											<path
												d={`M${xAt(dKnee) - 9},${PT + 8} l -5,4 l 5,4`}
												fill="none"
												strokeWidth={1.5}
												style={{ stroke: C.zone }}
											/>
											<path
												d={`M${xAt(dKnee) + 9},${PT + 8} l 5,4 l -5,4`}
												fill="none"
												strokeWidth={1.5}
												style={{ stroke: C.zone }}
											/>
										</g>
									)}
								</>
							)}

							{/* full-fee point on the distance axis */}
							{dFull <= DMAX ? (
								<g pointerEvents="none" style={{ transition: "all 150ms" }}>
									<path
										d={`M${xAt(dFull) - 5},${PB + 14} L${xAt(dFull)},${PB + 5} L${xAt(dFull) + 5},${PB + 14} Z`}
										style={{ fill: C.fee }}
									/>
									<text
										x={xAt(dFull)}
										y={PB + 27}
										textAnchor="middle"
										fontSize={11}
										style={{ fill: C.fee, fontFamily: mono }}
									>
										Full Fee
									</text>
								</g>
							) : (
								<text
									x={PR}
									y={PB + 27}
									textAnchor="end"
									fontSize={11}
									pointerEvents="none"
									style={{ fill: C.fee, fontFamily: mono }}
								>
									Full Fee →
								</text>
							)}

							{/* net edge: what distance keeps after the fee */}
							<polyline
								points={netCurve}
								fill="none"
								strokeWidth={1.75}
								strokeDasharray="6 4"
								clipPath="url(#bf-plot)"
								pointerEvents="none"
								opacity={0.85}
								style={{ stroke: C.dim, transition: "all 120ms" }}
							/>
							<text
								x={PR - 6}
								y={clamp(yAt(netAt(DMAX)) - 8, PT + 10, PB - 6)}
								textAnchor="end"
								fontSize={11}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Net Edge
							</text>

							{/* the base fee curve */}
							<polyline
								points={curve}
								fill="none"
								strokeWidth={2.75}
								clipPath="url(#bf-plot)"
								pointerEvents="none"
								style={{ stroke: C.fee, transition: "all 120ms" }}
							/>

							{/* hover crosshair: tracks the pointer, reads the schedule.
							    Skipped for table rows past the chart's 30bps range. */}
							{hover != null &&
								hover <= DMAX + 1e-9 &&
								(() => {
									const hf = feeAt(hover);
									const hn = hover - hf;
									const bw = 136;
									const bh = 56;
									const bx =
										xAt(hover) + 12 + bw > PR
											? xAt(hover) - 12 - bw
											: xAt(hover) + 12;
									const by = Math.max(
										PT + 2,
										Math.min(yAt(hf) - bh / 2, PB - bh - 2),
									);
									return (
										<g pointerEvents="none">
											<line
												x1={xAt(hover)}
												x2={xAt(hover)}
												y1={PT}
												y2={PB}
												strokeWidth={1}
												strokeDasharray="2 4"
												opacity={0.8}
												style={{ stroke: C.text }}
											/>
											<circle
												cx={xAt(hover)}
												cy={yAt(hf)}
												r={5}
												strokeWidth={1.75}
												style={{ fill: C.panel, stroke: C.fee }}
											/>
											<rect
												x={bx}
												y={by}
												width={bw}
												height={bh}
												rx={5}
												strokeWidth={0.75}
												style={{ fill: C.panel2, stroke: C.fee }}
											/>
											<text
												x={bx + 10}
												y={by + 16}
												fontSize={11}
												style={{ fill: C.dim, fontFamily: mono }}
											>
												{hover.toFixed(1)}bps from M
											</text>
											<text
												x={bx + 10}
												y={by + 32}
												fontSize={12}
												style={{ fill: C.fee, fontFamily: mono }}
											>
												Fee {hf.toFixed(2)}bps
											</text>
											<text
												x={bx + 10}
												y={by + 48}
												fontSize={12}
												style={{
													fill: hn < 0 ? C.danger : C.text,
													fontFamily: mono,
												}}
											>
												Net Edge {hn >= 0 ? "+" : "−"}
												{Math.abs(hn).toFixed(2)}
											</text>
										</g>
									);
								})()}

							{/* hover surface */}
							<rect
								x={PL}
								y={PT}
								width={PR - PL}
								height={PB - PT}
								fill="transparent"
								style={{ cursor: "crosshair" }}
								onPointerDown={(e) => {
									setHover(dAt(e));
								}}
								onPointerMove={(e) => {
									setHover(dAt(e));
								}}
								onPointerCancel={() => {
									setHover(null);
								}}
								onPointerLeave={() => {
									setHover(null);
								}}
							/>

							{/* in-plot strips over the lines: drag works here too, and the
							    crosshair traces straight through */}
							<rect
								x={xAt(B / 2) - 7}
								y={PT}
								width={14}
								height={PB - PT}
								fill="transparent"
								style={{ cursor: "ew-resize" }}
								{...lineStrip("band")}
							/>
							{dKnee <= DMAX && (
								<rect
									x={xAt(dKnee) - 7}
									y={PT}
									width={14}
									height={PB - PT}
									fill="transparent"
									style={{ cursor: "ew-resize" }}
									{...lineStrip("zone")}
								/>
							)}
							<rect
								x={PL}
								y={yAt(F) - 7}
								width={PR - PL}
								height={14}
								fill="transparent"
								style={{ cursor: "ns-resize" }}
								{...lineStrip("cap")}
							/>

							{/* the CAP marker in the gutter is the vertical drag handle */}
							<rect
								x={PL - 56}
								y={yAt(F) - 22}
								width={52}
								height={44}
								fill="transparent"
								style={{ cursor: "ns-resize" }}
								{...edgeStrip("cap")}
							/>

							{/* distance axis */}
							<line
								x1={PL}
								x2={PR}
								y1={PB}
								y2={PB}
								style={{ stroke: C.line }}
							/>
							{[0, 5, 10, 15, 20, 25, 30].map((d) => (
								<g key={d}>
									<line
										x1={xAt(d)}
										x2={xAt(d)}
										y1={PB}
										y2={PB + 4}
										style={{ stroke: C.faint }}
									/>
									<text
										x={xAt(d)}
										y={PB + 42}
										textAnchor="middle"
										fontSize={12}
										style={{ fill: C.faint, fontFamily: mono }}
									>
										{d}
									</text>
								</g>
							))}
							<text
								x={(PL + PR) / 2}
								y={PB + 62}
								textAnchor="middle"
								fontSize={11}
								letterSpacing="0.12em"
								style={{ fill: C.dim, fontFamily: mono }}
							>
								PLACEMENT · BPS FROM M
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
							Instructions: Hover the chart to trace the schedule. Drag the Band
							Edge, Zone Edge, or CAP by their lines or labels. Dials work too.
						</div>
					</div>

					{/* —— right third: the schedule, live —— */}
					<div
						style={{
							flex: "1 1 200px",
							minWidth: 190,
							padding: "8px 0 8px",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							ref={tableRef}
							class="sf-scroll"
							style={{
								position: "relative",
								border: `1px solid ${C.line}`,
								borderRadius: 6,
								flex: "1 1 0",
								minHeight: 0,
								maxHeight: 560,
								overflowY: "auto",
							}}
						>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr 1fr",
									position: "sticky",
									top: 0,
									background: C.inset,
									padding: "8px 8px 6px",
									borderBottom: `1px solid ${C.line}`,
									zIndex: 1,
								}}
							>
								<span style={{ ...label, fontSize: 9, textAlign: "center" }}>
									M Dist
								</span>
								<span style={{ ...label, fontSize: 9, textAlign: "center" }}>
									Base Fee
								</span>
								<span style={{ ...label, fontSize: 9, textAlign: "center" }}>
									Net Edge
								</span>
							</div>
							{schedRows.map((d, i) => {
								const f = feeAt(d);
								const n = d - f;
								const isHover =
									hoverRow != null && Math.abs(d - hoverRow) < 0.001;
								const sep = sepColor(d, schedRows[i + 1]);
								return (
									<div
										key={d}
										ref={isHover ? activeRowRef : undefined}
										onPointerEnter={() => setHover(d)}
										onPointerLeave={() => setHover(null)}
										style={{
											display: "grid",
											gridTemplateColumns: "1fr 1fr 1fr",
											width: "100%",
											padding: "2px 8px",
											cursor: "crosshair",
											borderLeft: `2px solid ${isHover ? C.fee : "transparent"}`,
											borderBottom: `2px solid ${
												sep
													? `color-mix(in srgb, ${sep} 55%, transparent)`
													: "transparent"
											}`,
											background: isHover ? C.band : "transparent",
											fontFamily: mono,
											fontSize: 12,
											lineHeight: 1.5,
										}}
									>
										<span style={{ textAlign: "center", color: C.dim }}>
											{d.toFixed(1)}
										</span>
										<span
											style={{
												textAlign: "center",
												color: f > 0 ? C.fee : C.dim,
											}}
										>
											{f.toFixed(2)}
										</span>
										<span
											style={{
												textAlign: "center",
												color: n < 0 ? C.danger : C.text,
											}}
										>
											{n >= 0 ? "+" : "−"}
											{Math.abs(n).toFixed(2)}
										</span>
									</div>
								);
							})}
						</div>
						<div
							style={{
								fontSize: 11,
								color: C.faint,
								padding: "6px 2px 0",
								lineHeight: 1.45,
							}}
						>
							All values in bps. Rules mark the{" "}
							<span style={{ color: C.mark }}>Band Edge</span>,{" "}
							<span style={{ color: C.zone }}>Zone Edge</span>, and{" "}
							<span style={{ color: C.fee }}>Cap</span>.
						</div>
					</div>
				</div>
			</div>

			{/* scenarios — the calibration tour */}
			<div
				style={{
					display: "flex",
					gap: 6,
					flexWrap: "wrap",
					margin: "10px 2px 0",
				}}
			>
				{FEE_SCENARIOS.map((sc) => (
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
					whiteSpace: "pre-line",
				}}
			>
				{renderBlurb(
					activeScenario
						? activeScenario.blurb
						: "Custom calibration, yours to shape. Drag the edges or dials freely; pick a scenario to return to a defined state.",
				)}
			</div>
		</div>
	);
}
