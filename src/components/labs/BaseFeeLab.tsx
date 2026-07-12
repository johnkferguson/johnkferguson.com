import { useRef, useState } from "react";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — base fee laboratory. The simplest piece of the
// mechanism: one order's placement against the declared standard.
// fee(d) = min(F, k × bps beyond the band edge). Drag to place.
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
					{val}
					{suffix || ""}
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

export default function BaseFeeLab() {
	const [S, setS] = useState(2);
	const [F, setF] = useState(10);
	const [slope, setSlope] = useState(0.8);
	const [place, setPlace] = useState(6); // bps from M
	const dragging = useRef(false);

	const feeAt = (d: number) => Math.min(F, slope * Math.max(0, d - S / 2));
	const fee = feeAt(place);
	const net = place - fee;
	const dFull = S / 2 + F / slope;

	// geometry
	const W = 960;
	const H = 400;
	const PL = 84;
	const PR = 900;
	const PT = 42;
	const PB = 320;
	const DMAX = 30;
	const xAt = (d: number) => PL + (d / DMAX) * (PR - PL);
	const yAt = (v: number) => PB - (v / 25) * (PB - PT);

	const curve = (() => {
		const pts: string[] = [];
		for (let d = 0; d <= DMAX + 0.001; d += 0.25) {
			pts.push(`${xAt(d)},${yAt(feeAt(d))}`);
		}
		return pts.join(" ");
	})();
	// gross edge reference: one bps of distance is one bps of edge
	const edgeEnd = Math.min(DMAX, 25);

	const placeFrom = (e: PointerEvent) => {
		const el = e.currentTarget as SVGRectElement;
		const r = el.getBoundingClientRect();
		const frac = (e.clientX - r.left) / r.width;
		const d = Math.max(0, Math.min(DMAX, frac * DMAX));
		setPlace(Math.round(d * 10) / 10);
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
					BASE FEE: THE PRICE OF PLACEMENT
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
						name="Spread standard · S"
						val={S}
						set={setS}
						min={1}
						max={10}
						stp={0.5}
						suffix="bps"
						hint="The free band, M ± S/2."
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
						name="Fee Slope · k"
						val={slope}
						set={setSlope}
						min={0.25}
						max={3}
						stp={0.05}
						suffix="×"
						hint="Fee per bps outside the band."
					/>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 3,
							background: C.inset,
							border: `1px solid ${C.line}`,
							borderRadius: 6,
							padding: "8px 12px",
						}}
					>
						<span style={label}>Your placement</span>
						<span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
							{place.toFixed(1)}bps from M · fee {fee.toFixed(2)}bps · net{" "}
							{net >= 0 ? "+" : ""}
							{net.toFixed(2)}bps
						</span>
					</div>
				</div>

				<svg
					viewBox={`0 0 ${W} ${H}`}
					style={{ width: "100%", display: "block", touchAction: "none" }}
					role="img"
					aria-label="Base fee curve: fee in bps against placement distance from the Mark"
				>
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

					{/* fee cap tick */}
					<g pointerEvents="none" style={{ transition: "all 150ms" }}>
						<text
							x={PL - 20}
							y={yAt(F) - 9}
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
					</g>

					{/* the free band */}
					<rect
						x={xAt(0)}
						y={PT}
						width={Math.max(0, xAt(S / 2) - xAt(0))}
						height={PB - PT}
						style={{ fill: C.band, transition: "all 220ms ease" }}
					/>
					<line
						x1={xAt(S / 2)}
						x2={xAt(S / 2)}
						y1={PT}
						y2={PB}
						strokeDasharray="3 4"
						style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
					/>
					<text
						x={xAt(S / 2)}
						y={PT - 6}
						textAnchor="middle"
						fontSize={12}
						style={{
							fill: C.mark,
							fontFamily: mono,
							transition: "all 220ms ease",
						}}
					>
						band edge
					</text>

					{/* full-fee point on the distance axis */}
					{dFull <= DMAX && (
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
								full fee
							</text>
						</g>
					)}

					{/* gross edge reference: a bps of distance is a bps of edge */}
					<line
						x1={xAt(0)}
						y1={yAt(0)}
						x2={xAt(edgeEnd)}
						y2={yAt(edgeEnd)}
						strokeDasharray="2 5"
						opacity={0.6}
						style={{ stroke: C.faint }}
					/>
					<text
						x={xAt(edgeEnd) - 6}
						y={yAt(edgeEnd) + 14}
						textAnchor="end"
						fontSize={11}
						style={{ fill: C.faint, fontFamily: mono }}
					>
						your edge (1:1)
					</text>

					{/* the base fee curve */}
					<polyline
						points={curve}
						fill="none"
						strokeWidth={2.75}
						pointerEvents="none"
						style={{ stroke: C.fee, transition: "all 120ms" }}
					/>

					{/* your placement marker */}
					<g pointerEvents="none" style={{ transition: "all 60ms" }}>
						<line
							x1={xAt(place)}
							x2={xAt(place)}
							y1={PT}
							y2={PB}
							strokeWidth={1}
							opacity={0.45}
							style={{ stroke: C.text }}
						/>
						<circle
							cx={xAt(place)}
							cy={yAt(fee)}
							r={6}
							strokeWidth={1.5}
							style={{ fill: C.fee, stroke: C.panel }}
						/>
					</g>

					{/* drag surface */}
					<rect
						x={PL}
						y={PT}
						width={PR - PL}
						height={PB - PT}
						fill="transparent"
						style={{ cursor: "ew-resize" }}
						onPointerDown={(e) => {
							(e.currentTarget as SVGRectElement).setPointerCapture(
								e.pointerId,
							);
							dragging.current = true;
							placeFrom(e);
						}}
						onPointerMove={(e) => {
							if (dragging.current) placeFrom(e);
						}}
						onPointerUp={() => {
							dragging.current = false;
						}}
						onPointerCancel={() => {
							dragging.current = false;
						}}
					/>

					{/* distance axis */}
					<line x1={PL} x2={PR} y1={PB} y2={PB} style={{ stroke: C.line }} />
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
					<text
						x={W / 2}
						y={PB + 78}
						textAnchor="middle"
						fontSize={12.5}
						style={{ fill: C.faint, fontFamily: mono, fontStyle: "italic" }}
					>
						Instructions: Drag on the chart to move your placement. Dial S, F,
						and k.
					</text>
				</svg>
			</div>
		</div>
	);
}
