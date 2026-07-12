import { useEffect, useRef, useState } from "react";
import { stampCapBps } from "../../lib/snapshot-fees/engine";
import "./snapshot-fees-lab.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — base fee laboratory. The simplest piece of the
// mechanism: one order's placement against the declared standard.
// fee(d): free in the band, k₁ per bps inside the Maker Zone, k₂ beyond
// its edge, capped at F. Hover to trace.
// Left: dials + the curve. Right: the schedule, live, in 0.5bps rows.
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
	const [B, setB] = useState(2); // inner band width, bps
	const [Z, setZ] = useState(8); // Maker Zone width, bps beyond the band edge
	const [F, setF] = useState(10);
	const [slope, setSlope] = useState(0.8); // k₁, inside the zone
	const [slope2, setSlope2] = useState(1); // k₂, beyond the zone edge
	const [hover, setHover] = useState<number | null>(null);
	const tableRef = useRef<HTMLDivElement | null>(null);
	const activeRowRef = useRef<HTMLDivElement | null>(null);

	// piecewise stamp: gentle k₁ inside the Maker Zone, steeper k₂ beyond
	const feeAt = (d: number) => {
		const dd = Math.max(0, d - B / 2);
		const raw = dd <= Z ? slope * dd : slope * Z + slope2 * (dd - Z);
		return Math.min(F, raw);
	};
	const dFull = B / 2 + stampCapBps({ F, Z, slope, slope2 });
	const dKnee = B / 2 + Z;

	// geometry — viewBox sized for the two-thirds slot so text stays legible
	const W = 580;
	const H = 400;
	const PL = 78;
	const PR = 545;
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

	const dAt = (e: PointerEvent) => {
		const el = e.currentTarget as SVGRectElement;
		const r = el.getBoundingClientRect();
		const frac = (e.clientX - r.left) / r.width;
		const d = Math.max(0, Math.min(DMAX, frac * DMAX));
		return Math.round(d * 10) / 10;
	};

	// the schedule, live: one row per 0.5bps of distance from M. The pointer
	// drives the highlighted row.
	const schedRows: number[] = [];
	for (let d = 0; d <= DMAX + 0.001; d += 0.5) schedRows.push(d);
	const hoverRow = hover != null ? Math.round(hover * 2) / 2 : null;

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
						gap: "4px 14px",
						alignItems: "flex-start",
						margin: "0 10px",
						borderTop: `1px solid ${C.line}`,
					}}
				>
					{/* —— left two-thirds: controls above, the curve below —— */}
					<div style={{ flex: "2 1 400px", minWidth: 300 }}>
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: "10px 14px",
								alignItems: "flex-start",
								justifyContent: "space-between",
								padding: "8px 4px 6px",
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
								width={Math.max(0, xAt(B / 2) - xAt(0))}
								height={PB - PT}
								style={{ fill: C.band, transition: "all 220ms ease" }}
							/>
							<line
								x1={xAt(B / 2)}
								x2={xAt(B / 2)}
								y1={PT}
								y2={PB}
								strokeDasharray="3 4"
								style={{ stroke: C.bandEdge, transition: "all 220ms ease" }}
							/>
							<text
								x={xAt(B / 2)}
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

							{/* the zone edge: where the far slope takes over */}
							{dKnee <= DMAX && (
								<>
									<line
										x1={xAt(dKnee)}
										x2={xAt(dKnee)}
										y1={PT}
										y2={PB}
										strokeDasharray="3 4"
										opacity={0.7}
										style={{
											stroke: C.bandEdge,
											transition: "all 220ms ease",
										}}
									/>
									<text
										x={xAt(dKnee)}
										y={PT - 6}
										textAnchor="middle"
										fontSize={12}
										style={{
											fill: C.mark,
											fontFamily: mono,
											transition: "all 220ms ease",
										}}
									>
										zone edge
									</text>
								</>
							)}

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

							{/* hover crosshair: tracks the pointer, reads the schedule */}
							{hover != null &&
								(() => {
									const hf = feeAt(hover);
									const hn = hover - hf;
									const bw = 128;
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
												fee {hf.toFixed(2)}
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
												net {hn >= 0 ? "+" : "−"}
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
							<text
								x={W / 2}
								y={PB + 78}
								textAnchor="middle"
								fontSize={12.5}
								style={{ fill: C.faint, fontFamily: mono, fontStyle: "italic" }}
							>
								Instructions: Hover the chart to trace the schedule. Dial the
								band, zone, cap, and slopes.
							</text>
						</svg>
					</div>

					{/* —— right third: the schedule, live —— */}
					<div
						style={{
							flex: "1 1 200px",
							minWidth: 190,
							padding: "8px 0 8px",
						}}
					>
						<div
							ref={tableRef}
							class="sf-scroll"
							style={{
								position: "relative",
								border: `1px solid ${C.line}`,
								borderRadius: 6,
								maxHeight: 440,
								overflowY: "auto",
							}}
						>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr 1.1fr",
									position: "sticky",
									top: 0,
									background: C.inset,
									padding: "8px 10px 6px",
									borderBottom: `1px solid ${C.line}`,
									zIndex: 1,
								}}
							>
								<span style={{ ...label, fontSize: 9 }}>M Dist</span>
								<span style={{ ...label, fontSize: 9, textAlign: "right" }}>
									Base Fee
								</span>
								<span style={{ ...label, fontSize: 9, textAlign: "right" }}>
									Net Edge
								</span>
							</div>
							{schedRows.map((d) => {
								const f = feeAt(d);
								const n = d - f;
								const isHover =
									hoverRow != null && Math.abs(d - hoverRow) < 0.001;
								return (
									<div
										key={d}
										ref={isHover ? activeRowRef : undefined}
										style={{
											display: "grid",
											gridTemplateColumns: "1fr 1fr 1.1fr",
											width: "100%",
											padding: "2px 10px 2px 8px",
											borderLeft: `2px solid ${isHover ? C.fee : "transparent"}`,
											background: isHover ? C.band : "transparent",
											fontFamily: mono,
											fontSize: 12,
											lineHeight: 1.5,
										}}
									>
										<span style={{ textAlign: "left", color: C.dim }}>
											{d.toFixed(1)}
										</span>
										<span
											style={{
												textAlign: "right",
												color: f > 0 ? C.fee : C.dim,
											}}
										>
											{f.toFixed(2)}
										</span>
										<span
											style={{
												textAlign: "right",
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
							All values in bps. Hover the chart to trace rows.
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
