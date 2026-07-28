import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type BookLevel,
	BP,
	computeModel,
	fullFeeBps,
	type MarketModel,
	type Side,
} from "../../../lib/snapshot-fees/engine";
import "./lab-theme.css";

// ————————————————————————————————————————————————————————————————
// Snapshot Fees — single-maker laboratory
// Levels: 100.00 ± 0.005 steps. 1bp = $0.01 (price ≈ $100 reference).
// Bid side left of center, ask side right. M floats; center is fixed.
// Mechanism lives in src/lib/snapshot-fees/engine.ts — this file only renders.
// ————————————————————————————————————————————————————————————————

const N = 61; // levels
const CENTER = 30; // index of 100.00
// zoom steps: ticks visible either side of 100.00 (view only, never the book)
const ZOOM_HALVES = [10, 15, 20, 25, 30];
const TICK = 0.005; // $ per level
const MAX_DEPTH = 25000; // $ per level
const STEP_DOLLARS = 250;
// Defaults for the Maker Zone Z (M's working radius: eligibility
// range, walk truncation, boundary-fill price, and the base-fee knee) and the
// far slope k₂ beyond the zone edge.
const Z_DEFAULT = 4;
const SLOPE2_DEFAULT = 0.95;

const priceAt = (i: number) => +(100 + (i - CENTER) * TICK).toFixed(3);
// 100.000 (i = CENTER) is a quotable bid; asks start one tick above.
const sideAt = (i: number): Side => (i <= CENTER ? "bid" : "ask");

interface Scenario {
	key: string;
	title: string;
	blurb: string;
	book: () => number[];
	/* zoom index into ZOOM_HALVES this scenario opens at (default 1, ±7.5bps) */
	zoom?: number;
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
		title: "Balanced",
		zoom: ZOOM_HALVES.length - 1,
		blurb: `A mirrored ladder: the same size resting at every distance on both sides, growing toward the edges. Every dollar finds a pair, so each level's receipt is its placement and nothing else. M lands at 100.000, the levels at 0.5 and 1bps out trade free, and the fee climbs with distance: 0.8bps at 2bps out, 3.2bps at the zone's edge, and the 10bps cap from 12.5bps out, where the last six levels all pay the same.

Hover a bar near the mid and one far out and compare receipts: the surcharge line is zero on both. Hover M to see how it is calculated.`,
		book: () => {
			const a = Array(N).fill(0);
			for (let k = 0; k < 30; k++) {
				const v = Math.round((3000 + (17000 * k) / 29) / 250) * 250;
				a[CENTER - 1 - k] = v;
				a[CENTER + 1 + k] = v;
			}
			return a;
		},
	},
	{
		key: "unbalanced",
		title: "Unbalanced",
		zoom: ZOOM_HALVES.length - 1,
		blurb: `The same $345k on each side as [[Balanced]], arranged differently: the bid ladder runs steep, thin near the mid and heavy far out, while the asks spread more evenly, holding more of their weight close. Weight near the midpoint pushes M away from its side: the walk covers its $20,000 in three ask levels but needs five bid levels, and M settles at 99.997, shifted toward the bids. The shift leaves two bid levels inside the band and only one ask level. Pairing follows the same imbalance: with most of the ask notional close in, the asks reach into deeper bid levels to find their pairs, so the surcharges land on the ask side. Past the full-fee point no level pays a surcharge either way: both legs already stand at the cap.

Hover M to compare the two walks, then hover an ask outside the band and read the surcharge in its receipt.`,
		book: () => {
			const a = Array(N).fill(0);
			for (let k = 0; k < 30; k++) {
				const v = Math.round((3000 + (17000 * k) / 29) / 250) * 250;
				a[CENTER - 1 - k] = v;
				a[CENTER + 1 + k] = Math.round((6500 + (10000 * k) / 29) / 250) * 250;
			}
			return a;
		},
	},
	{
		key: "taker",
		title: "Directional",
		blurb: `$255k of asks over $82.5k of bids, zoomed in to a smaller range. While [[Unbalanced]] rearranged equal notional, this book is short a side, and that costs more. Only the smaller bid side can pair, consumed best-priced first. On the heavier side, the asks begin to run out of pairs at 100.035, with that level priced as half paired and half directional. Above it, all asks lack any paired liquidity and pay the full cap, even though they stand a relatively short distance from M.

Hover any ask from 100.035 outward to see how much the directional surcharge adds to its total fee. Then try dragging any bid taller and watch the fees above 100.035 fall from the cap back toward placement rates.`,
		book: () => {
			const a = Array(N).fill(0);
			for (let k = 0; k < 15; k++) {
				a[CENTER - 1 - k] = Math.round((4000 + (3000 * k) / 14) / 250) * 250;
				a[CENTER + 1 + k] = 10000 + 1000 * k;
			}
			return a;
		},
	},
	{
		key: "wide",
		title: "Quoting Wide",
		blurb: `A maker quoting only wide: two rungs on each side, mirrored, nothing inside 4bps of the mid. Every dollar pairs and no receipt shows a surcharge; the fees are placement alone. The rungs at 100.040 pay 2.4bps and the ones at 100.045 pay 2.8bps, where [[Balanced]]'s near levels trade free. A book this thin also runs the walk short: it wants $20,000 a side and finds $14k, so the M popup prices the missing depth at the boundary, shown as the starred rows.

Try widening B: at 8bps the band swallows the inner rungs, at 10 all four trade free.`,
		book: () =>
			bookOf({
				[CENTER - 9]: 8000,
				[CENTER - 8]: 6000,
				[CENTER + 8]: 6000,
				[CENTER + 9]: 8000,
			}),
	},
	{
		key: "thin",
		title: "Thin Side, Moving M",
		blurb: `Bids crowd the mid, eight $10k levels deep, while the asks run thin: ten small rungs summing to just $20,000, with the real ask depth waiting beyond 100.055. The walk covers its $20,000 in two bid levels, while the ask side takes all ten. M lands at 100.012, more than a bps above the mid.

Four asks fall inside the band, but no bid stands inside it for them to pair with, so their pairs reach below the band and they pay a surcharge, about 0.5bps despite their placement. The nearest bid at 99.995 sits just outside the band and pays 0.55bps.

Try the D dial in both directions. Raise it and the walk absorbs more of the thin side, pushing M out to 100.014 at $30k. Lower it to $10k and the walk reads less of the book, sees less of the imbalance, and pulls M back in to 100.007.`,
		book: () => {
			const a = Array(N).fill(0);
			// heavy near bids, then a moderate ladder to the far edge
			for (let k = 0; k < 8; k++) a[CENTER - 1 - k] = 10000;
			for (let j = 0; j < 22; j++)
				a[CENTER - 9 - j] = Math.round((9000 + (9000 * j) / 21) / 250) * 250;
			// asks: thin rungs summing to exactly $20k through the reach, then
			// a wall just past the walk's stopping point, tapering beyond
			[1250, 1500, 1750, 1750, 2000, 2000, 2250, 2250, 2500, 2750].forEach(
				(v, k) => {
					a[CENTER + 1 + k] = v;
				},
			);
			for (let j = 0; j < 6; j++) a[CENTER + 11 + j] = 16000;
			for (let j = 0; j < 14; j++) a[CENTER + 17 + j] = 12000;
			return a;
		},
	},
];

// Theme roles — resolved per light/dark mode in lab-theme.css
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
	measure: "var(--lab-measure)",
	band: "var(--lab-band)",
	bandEdge: "var(--lab-band-edge)",
	zone: "var(--lab-zone)",
	measureSlice: "var(--lab-measure-slice)",
	hatch: "var(--lab-hatch)",
	danger: "var(--lab-danger)",
	warn: "var(--lab-warn)",
	inset: "var(--lab-inset)",
	hint: "var(--lab-hint)",
	onAccent: "var(--lab-on-accent)",
};

const mono = "var(--lab-mono)";

// What each dial does, narrated as you move it
const DIAL_EFFECT: Record<string, { up: string; down: string }> = {
	B: {
		up: "Wider band: more room to trade free, lower base fees outside it; fee cap reached later.",
		down: "Tighter band: less room to trade free, higher base fees outside it; fee cap reached sooner.",
	},
	F: {
		up: "Higher cap: fee cap reached later, there is more room for pairing liquidity; directional trades pay more.",
		down: "Lower cap: fee cap reached sooner, there is less room for pairing liquidity; directional trades pay less.",
	},
	D: {
		up: "Larger size: more of the order book used to calculate M; more size needed to move it.",
		down: "Smaller size: less of the order book used to calculate M; less size needed to move it.",
	},
	Z: {
		up: "Wider zone: more of the book counts toward M; k₂ takes over further out.",
		down: "Tighter zone: less of the book counts toward M; k₂ takes over sooner.",
	},
	k: {
		up: "Steeper zone slope: each bps outside the band costs more; fee cap reached sooner.",
		down: "Gentler zone slope: each bps outside the band costs less; fee cap reached later.",
	},
	k2: {
		up: "Steeper far slope: each bps past the zone edge costs more; fee cap reached sooner.",
		down: "Gentler far slope: each bps past the zone edge costs less; fee cap reached later.",
	},
};

// k₁ at or above 1 is a regime rather than a change, so it replaces the
// up/down narration in either direction.
const K1_WARNING =
	"k₁ ≥ 1: the fee grows as fast as the distance; quoting wider adds no net edge.";

// Holds the narration area before any dial has been touched, captioning the
// Full Fee Reached readout above it.
const IDLE_EFFECT =
	"The distance from M where paired liquidity first pays the full cap. Move a dial to see what changes it.";

// Reserves the narration box's height (rendered invisibly, see below). Longest
// string wins: every line shares one font size and text width, so the longest
// wraps to at least as many lines as any other. IDLE_EFFECT rides along in the
// comparison even though it renders italic, Newsreader's italic being the
// narrower face of the two.
const LONGEST_EFFECT = [
	...Object.values(DIAL_EFFECT).flatMap((e) => [e.up, e.down]),
	K1_WARNING,
	IDLE_EFFECT,
].reduce((a, b) => (b.length > a.length ? b : a));

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
						accentColor: warn ? C.warn : "var(--lab-slider)",
					}}
				/>
				<span
					style={{
						fontFamily: mono,
						fontSize: 11.5,
						color: warn ? C.warn : C.text,
						whiteSpace: "nowrap",
						width: "7ch",
						textAlign: "right",
						flexShrink: 0,
					}}
				>
					{suffix === "$" ? fmt$(val) : val + (suffix || "")}
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

export default function SingleMakerLab() {
	// —— market standard ——
	const [B, setB] = useState(2); // inner band width, bps
	const [D, setD] = useState(20000); // typical demand, $
	// —— fee schedule ——
	const [F, setF] = useState(10); // cap: ceiling of the resting schedule, bps
	const [Z, setZ] = useState(Z_DEFAULT); // Maker Zone, bps past the band edge
	const [slope, setSlope] = useState(0.8); // k₁: base-fee bps per bp inside the zone
	const [slope2, setSlope2] = useState(SLOPE2_DEFAULT); // k₂ beyond the zone
	const [comp, setComp] = useState(0); // inside compensation max, bps (parked module)

	const [sizes, setSizes] = useState<number[]>(() => SCENARIOS[0].book());
	const [scenario, setScenario] = useState<string | null>(SCENARIOS[0].key);
	const [effect, setEffect] = useState<{ t: string; warn: boolean } | null>(
		null,
	);
	const [centerSide, setCenterSide] = useState<"bid" | "ask">("bid");
	const [mHover, setMHover] = useState(false);
	const [feeHover, setFeeHover] = useState<number | null>(null);
	const [zoom, setZoom] = useState(SCENARIOS[0].zoom ?? 1); // default view: ±7.5bps
	const lastM = useRef(100);
	const drag = useRef<DragState | null>(null);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const zoneDrag = useRef<0 | 1 | null>(null);
	const [zoneGrab, setZoneGrab] = useState<0 | 1 | null>(null);
	// fade the fee receipt while the pointer sits under its box, so the
	// bars beneath stay visible mid-resize
	const [underTip, setUnderTip] = useState(false);
	const tipH = useRef(0);
	// the last custom book and dials, remembered when a scenario replaces
	// them; the Custom button restores them
	const [customSnap, setCustomSnap] = useState<{
		sizes: number[];
		centerSide: "bid" | "ask";
		B: number;
		D: number;
		F: number;
		Z: number;
		slope: number;
		slope2: number;
	} | null>(null);

	/* stable identity so the model memo only recomputes on real input
	 * changes, not on every hover/zoom render */
	const sideOf = useCallback(
		(i: number): Side => (i === CENTER ? centerSide : sideAt(i)),
		[centerSide],
	);
	const model = useMemo(() => {
		const book: BookLevel[] = sizes.map((size, i) => ({
			i,
			price: priceAt(i),
			side: sideOf(i),
			size,
		}));
		// the lab always carries a prior M (lastM starts at 100), so the
		// no-M state is unreachable here and M / the band edges are numbers
		return computeModel(
			book,
			{ B, D, F, Z, slope, slope2, comp },
			lastM.current,
		) as MarketModel & { M: number; edgeBid: number; edgeAsk: number };
	}, [sizes, B, D, F, Z, slope, slope2, comp, sideOf]);

	useEffect(() => {
		if (model.state === "fresh") lastM.current = model.M;
	}, [model.M, model.state]);

	// —— chart geometry ——
	// Top strip (y 0…PT) holds the M carriage and band-edge labels; below
	// the price axis, a key strip and instructions close the frame.
	const W = 960;
	const H = 514;
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
	const labelStride = [2, 3, 4, 5, 6][zoom];
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
		if (scenario === null)
			setCustomSnap({ sizes, centerSide, B, D, F, Z, slope, slope2 });
		setSizes(sc.book());
		setCenterSide("bid");
		setEffect(null);
		setB(2);
		setD(20000);
		setF(10);
		setZ(Z_DEFAULT);
		setSlope(0.8);
		setSlope2(SLOPE2_DEFAULT);
		setComp(0);
		setZoom(sc.zoom ?? 1);
		setScenario(sc.key);
	};

	// blurb markup: [[Title]] or [[Title|shown text]] renders as an inline
	// link that selects that scenario
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
	const touch =
		(dial: keyof typeof DIAL_EFFECT, cur: number, fn: (v: number) => void) =>
		(v: number) => {
			fn(v);
			setScenario(null);
			if (v === cur) return;
			if (dial === "k" && v >= 1) setEffect({ t: K1_WARNING, warn: true });
			else
				setEffect({
					t: DIAL_EFFECT[dial][v > cur ? "up" : "down"],
					warn: false,
				});
		};

	const onUp = () => {
		drag.current = null;
	};

	// —— zone-edge drag: either side's Zone Edge line retunes Z, as in the
	// Base Fee lab. Distance is read against the band edge the line hangs off.
	const priceFromClientX = (clientX: number) => {
		const r = svgRef.current?.getBoundingClientRect();
		if (!r) return 100;
		const sx = ((clientX - r.left) / r.width) * W;
		return priceAt(loI) + ((sx - PL - PAD) / step) * TICK;
	};
	const applyZoneDrag = (e: PointerEvent) => {
		const side = zoneDrag.current;
		if (side == null) return;
		const p = priceFromClientX(e.clientX);
		const dist =
			side === 0 ? (model.edgeBid - p) / BP : (p - model.edgeAsk) / BP;
		const v = Math.max(2, Math.min(20, Math.round(dist * 2) / 2));
		if (v !== Z) touch("Z", Z, setZ)(v);
	};
	const zoneStrip = (side: 0 | 1) => ({
		onPointerEnter: () => setZoneGrab(side),
		onPointerLeave: () => setZoneGrab((g) => (g === side ? null : g)),
		onPointerDown: (e: PointerEvent) => {
			(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
			zoneDrag.current = side;
			applyZoneDrag(e);
		},
		onPointerMove: (e: PointerEvent) => {
			if (zoneDrag.current === side) applyZoneDrag(e);
		},
		onPointerUp: () => {
			zoneDrag.current = null;
		},
		onPointerCancel: () => {
			zoneDrag.current = null;
		},
	});

	const btn = (active: boolean) => ({
		background: active ? "var(--lab-btn-active-bg)" : "var(--lab-btn-bg)",
		border: `1px solid ${active ? "var(--lab-btn-active-bg)" : C.line}`,
		color: active ? C.panel2 : C.dim,
		fontSize: 11,
		padding: "4px 10px",
		borderRadius: 5,
		boxShadow: "var(--lab-btn-shadow)",
		cursor: "pointer",
	});

	// —— partner highlighting: the exact dollars paired with the hovered
	// level, located inside each partner bar via the spillover order ——
	const tip = feeHover;
	const tipLv = tip != null ? model.levels[tip] : null;
	const tipBk = tipLv?.bk ?? null;
	const tipFeeY = tipBk ? yFee(tipBk.final) : null;
	let pairSlices: { i: number; from: number; to: number }[] = [];
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
				offset.set(pr.price, (offset.get(pr.price) ?? 0) + pr.paired);
		}
		pairSlices = tipBk.pairs.flatMap((pr) => {
			const partner = model.levels.find(
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

	const feePts = model.levels.filter(
		(l) => l.size > 0 && l.side !== "mid" && inView(l.i),
	);
	const feePath = feePts
		.map((l, k) => `${k ? "L" : "M"}${xAt(l.i)},${yFee(l.bk?.final ?? 0)}`)
		.join(" ");

	return (
		<div class="sf-lab" style={{ color: C.text }}>
			{/* chart */}
			<div
				style={{
					background: C.panel,
					border: `1px solid ${C.line}`,
					borderTop: "none",
					borderRadius: "0 0 8px 8px",
					padding: "6px 4px 2px",
					position: "relative",
				}}
			>
				<div
					style={{
						fontSize: 12,
						fontStyle: "italic",
						color: C.faint,
						textAlign: "center",
						margin: "0 10px",
						borderTop: `1px solid ${C.line}`,
						padding: "6px 12px 6px",
						lineHeight: 1.5,
					}}
				>
					Instructions: Hover a bar for its fee and paired liquidity, or{" "}
					<span style={{ color: C.measure }}>M</span> for the walk that set it.
					Adjust the market: drag a bar's top edge, double-click 100.000 to flip
					its side, zoom out for the whole book, and retune the dials. Scenarios
					below.
				</div>
				{/* dials left, readouts right — the readout column absorbs the
				    width the full-panel grid used to waste on stretched sliders */}
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "4px 24px",
						alignItems: "flex-start",
						margin: "0 10px",
					}}
				>
					<div
						style={{
							flex: "2 1 400px",
							minWidth: 300,
							display: "grid",
							gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
							gap: "10px 16px",
							padding: "10px 4px 4px",
						}}
					>
						<Param
							name="Typical demand · D"
							val={D}
							set={touch("D", D, setD)}
							min={1000}
							max={30000}
							stp={500}
							suffix="$"
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
							hint="The most any resting order pays."
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
							flex: "1 1 200px",
							minWidth: 190,
							display: "flex",
							flexDirection: "column",
							gap: 8,
							padding: "10px 0 4px",
						}}
					>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 3,
								background: C.inset,
								border: `1px solid ${C.line}`,
								borderRadius: 6,
								padding: "6px 10px",
							}}
						>
							<span style={{ ...label, fontSize: 9.5, letterSpacing: "0.1em" }}>
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
								{(B / 2 + fullFeeBps({ F, Z, slope, slope2 })).toFixed(1)}
								bps from M
							</span>
							<div
								style={{
									alignSelf: "stretch",
									borderTop: `1px solid ${C.line}`,
									margin: "4px 0 5px",
								}}
							/>
							{/* dial narration. The area is sized by an invisible copy of
							    the longest tip, so the box holds one height and no tip can
							    shift the chart below it. A pixel height would not do:
							    this column is flexible, so the same string wraps to more
							    lines as the viewport narrows. */}
							<div style={{ alignSelf: "stretch", position: "relative" }}>
								<div
									aria-hidden="true"
									style={{
										display: "flex",
										gap: 8,
										visibility: "hidden",
										pointerEvents: "none",
									}}
								>
									<span style={{ width: 14, flex: "0 0 auto" }} />
									<span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
										{LONGEST_EFFECT}
									</span>
								</div>
								{effect ? (
									<div
										class="sf-effect"
										style={{
											position: "absolute",
											inset: 0,
											display: "flex",
											gap: 8,
											alignItems: "center",
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
											}}
										>
											<path d="M9 18h6" />
											<path d="M10 22h4" />
											<path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
										</svg>
										<span
											style={{
												fontSize: 12.5,
												color: effect.warn ? C.warn : C.text,
												lineHeight: 1.5,
											}}
										>
											{effect.t}
										</span>
									</div>
								) : (
									/* idle: a caption for the readout above, which four of the
									   six tips end by referring to. Indented past the bulb's
									   width and gap so the text holds its x when a tip
									   replaces it, and no bulb: nothing has been caused yet. */
									<div
										style={{
											position: "absolute",
											inset: 0,
											display: "flex",
											alignItems: "center",
											paddingLeft: 22,
										}}
									>
										<span
											style={{
												fontSize: 12.5,
												color: C.faint,
												lineHeight: 1.5,
												fontStyle: "italic",
											}}
										>
											{IDLE_EFFECT}
										</span>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
				<div>
					<svg
						ref={svgRef}
						viewBox={`0 0 ${W} ${H}`}
						style={{ width: "100%", display: "block", touchAction: "none" }}
						onPointerMove={(e) => {
							const r = svgRef.current?.getBoundingClientRect();
							if (!r) return;
							const sx = ((e.clientX - r.left) / r.width) * W;
							const sy = ((e.clientY - r.top) / r.height) * H;
							const inside =
								feeHover != null &&
								!mHover &&
								sx >= W / 2 - 240 &&
								sx <= W / 2 + 240 &&
								sy >= PT + 8 &&
								sy <= PT + 8 + tipH.current;
							setUnderTip((v) => (v === inside ? v : inside));
						}}
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
						{/* band-edge labels — hidden when the band is too narrow on screen */}
						{xOfPrice(model.edgeAsk) - xOfPrice(model.edgeBid) > 56 && (
							<>
								<text
									x={xOfPrice(model.edgeBid)}
									y={PT - 6}
									textAnchor="middle"
									fontSize={12}
									style={{
										fill: C.measure,
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
										fill: C.measure,
										fontFamily: mono,
										transition: "all 220ms ease",
									}}
								>
									{fmtPx(model.edgeAsk)}
								</text>
							</>
						)}

						{/* zone edges: where the far slope takes over, either side */}
						{[model.edgeBid - Z * BP, model.edgeAsk + Z * BP].map(
							(zp, side) => {
								const zx = xOfPrice(zp);
								if (zx < PL || zx > PR) return null;
								const bandX = xOfPrice(
									side === 0 ? model.edgeBid : model.edgeAsk,
								);
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
							},
						)}

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
									{/* bar body: hovering reads the level's fee */}
									{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hover surface */}
									<rect
										x={xAt(lv.i) - step / 2}
										y={PT}
										width={step}
										height={PB - PT}
										fill="transparent"
										style={{ cursor: "default" }}
										onPointerEnter={() => setFeeHover(lv.bk ? lv.i : null)}
										onPointerLeave={() => setFeeHover(null)}
										onDblClick={() => {
											if (lv.i === CENTER)
												setCenterSide((cs) => (cs === "bid" ? "ask" : "bid"));
										}}
									/>
									{/* grab handle: hugs the bar's top edge, mostly outside it;
									    allowed to poke 12px above the plot so a full-height bar
									    stays grabbable on a slight overshoot */}
									<rect
										x={xAt(lv.i) - step / 2}
										y={
											lv.size > 0
												? Math.max(PT - 12, yDepth(lv.size) - 12)
												: PB - 14
										}
										width={step}
										height={lv.size > 0 ? 16 : 14}
										fill="transparent"
										style={{ cursor: "ns-resize" }}
										onPointerEnter={() => setFeeHover(lv.bk ? lv.i : null)}
										onPointerLeave={() => setFeeHover(null)}
										onPointerDown={(e) => onDown(e, lv.i)}
										onPointerMove={onMove}
										onPointerUp={onUp}
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
											style={{
												fill: lv.side === "bid" ? C.bid : C.ask,
											}}
										/>
									)}
									{lv.size > 0 && (model.measureUsed.get(lv.i) || 0) > 0 && (
										<rect
											x={xAt(lv.i) - barW / 2}
											y={yDepth(model.measureUsed.get(lv.i) ?? 0)}
											width={barW}
											height={Math.max(
												0,
												PB - yDepth(model.measureUsed.get(lv.i) ?? 0),
											)}
											strokeWidth={1.25}
											rx={2}
											opacity={dimIf(lv.i)}
											pointerEvents="none"
											style={{ fill: C.measureSlice, stroke: C.measure }}
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

						{/* partner highlight — the dollars paired with the hovered level */}
						{pairSlices
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

						{/* hovered-bar outline, above the walk overlay so it never
						    sinks beneath the consumed-slice fill */}
						{tipLv && tipLv.size > 0 && inView(tipLv.i) && (
							<rect
								x={xAt(tipLv.i) - barW / 2}
								y={yDepth(tipLv.size)}
								width={barW}
								height={Math.max(0, PB - yDepth(tipLv.size))}
								fill="none"
								strokeWidth={1.75}
								rx={2}
								pointerEvents="none"
								style={{ stroke: C.text }}
							/>
						)}

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
								r={feeHover === l.i ? 5.5 : 4}
								strokeWidth={1.5}
								pointerEvents="none"
								style={{ fill: C.fee, stroke: C.panel }}
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
						{/* both rows centered on the plot's midline: the states on top,
						    the hover highlights beneath */}
						<g pointerEvents="none" style={{ fontFamily: mono }}>
							<rect
								x={288}
								y={PB + 46}
								width={14}
								height={14}
								rx={2}
								style={{ fill: C.bid }}
							/>
							<text
								x={309}
								y={PB + 59}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Bids
							</text>
							<rect
								x={383}
								y={PB + 46}
								width={14}
								height={14}
								rx={2}
								style={{ fill: C.ask }}
							/>
							<text
								x={404}
								y={PB + 59}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Asks
							</text>
							<circle
								cx={485}
								cy={PB + 53}
								r={6}
								strokeWidth={1}
								style={{ fill: C.fee, stroke: C.panel }}
							/>
							<text
								x={498}
								y={PB + 59}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Fee if Fully Filled
							</text>
							<rect
								x={205}
								y={PB + 72}
								width={14}
								height={14}
								fill="url(#sf-hatch)"
								strokeWidth={0.5}
								style={{ stroke: C.dim }}
							/>
							<text
								x={226}
								y={PB + 85}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Directional
							</text>
							<rect
								x={368}
								y={PB + 72}
								width={14}
								height={14}
								rx={1.5}
								fill="none"
								strokeWidth={1.75}
								style={{ stroke: C.text }}
							/>
							<text
								x={389}
								y={PB + 85}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Paired Liquidity
							</text>
							<rect
								x={579}
								y={PB + 72}
								width={14}
								height={14}
								rx={2}
								strokeWidth={1.25}
								style={{ fill: C.measureSlice, stroke: C.measure }}
							/>
							<text
								x={600}
								y={PB + 85}
								fontSize={16}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Contributing to M
							</text>
						</g>

						{/* zoom rides the key strip's left end as one segmented control
						    (⊖ | ±bps | ⊕), sized and styled to mirror Clear on the
						    right. View only — the book and M never change. */}
						<rect
							x={26}
							y={PB + 50}
							width={138}
							height={32}
							rx={6}
							strokeWidth={1}
							style={{
								fill: "var(--lab-chartbtn-bg)",
								stroke: C.line,
								filter: "var(--lab-btn-drop)",
							}}
						/>
						<line
							x1={60}
							x2={60}
							y1={PB + 50}
							y2={PB + 82}
							strokeWidth={1}
							style={{ stroke: C.line }}
						/>
						<line
							x1={130}
							x2={130}
							y1={PB + 50}
							y2={PB + 82}
							strokeWidth={1}
							style={{ stroke: C.line }}
						/>
						<svg
							x={35}
							y={PB + 58}
							width={16}
							height={16}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.2}
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							opacity={zoom >= ZOOM_HALVES.length - 1 ? 0.35 : 1}
							style={{ color: C.dim }}
						>
							<circle cx="11" cy="11" r="7" />
							<line x1="20.5" y1="20.5" x2="16" y2="16" />
							<line x1="8" y1="11" x2="14" y2="11" />
						</svg>
						<text
							x={95}
							y={PB + 71}
							textAnchor="middle"
							fontSize={14}
							pointerEvents="none"
							style={{ fill: C.dim, fontFamily: mono }}
						>
							±{viewHalf % 2 ? (viewHalf / 2).toFixed(1) : viewHalf / 2}bps
						</text>
						<svg
							x={139}
							y={PB + 58}
							width={16}
							height={16}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.2}
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							opacity={zoom === 0 ? 0.35 : 1}
							style={{ color: C.dim }}
						>
							<circle cx="11" cy="11" r="7" />
							<line x1="20.5" y1="20.5" x2="16" y2="16" />
							<line x1="8" y1="11" x2="14" y2="11" />
							<line x1="11" y1="8" x2="11" y2="14" />
						</svg>
						{/* biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg> */}
						<rect
							x={26}
							y={PB + 50}
							width={34}
							height={32}
							fill="transparent"
							role="button"
							tabIndex={0}
							aria-label="Zoom out: show more of the book"
							onClick={() =>
								setZoom((z) => Math.min(ZOOM_HALVES.length - 1, z + 1))
							}
							onKeyDown={(e) => {
								if (e.key === "Enter")
									setZoom((z) => Math.min(ZOOM_HALVES.length - 1, z + 1));
							}}
							style={{
								cursor: zoom >= ZOOM_HALVES.length - 1 ? "default" : "pointer",
							}}
						/>
						{/* biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg> */}
						<rect
							x={130}
							y={PB + 50}
							width={34}
							height={32}
							fill="transparent"
							role="button"
							tabIndex={0}
							aria-label="Zoom in"
							onClick={() => setZoom((z) => Math.max(0, z - 1))}
							onKeyDown={(e) => {
								if (e.key === "Enter") setZoom((z) => Math.max(0, z - 1));
							}}
							style={{ cursor: zoom === 0 ? "default" : "pointer" }}
						/>

						{/* Clear rides the key strip, right-aligned: empties the book */}
						{/* biome-ignore lint/a11y/useSemanticElements: SVG hit area — a real <button> cannot exist inside <svg> */}
						<g
							role="button"
							tabIndex={0}
							aria-label="Clear the book"
							onClick={() => {
								setSizes(Array(N).fill(0));
								setScenario(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									setSizes(Array(N).fill(0));
									setScenario(null);
								}
							}}
							style={{ cursor: "pointer" }}
						>
							<rect
								x={858}
								y={PB + 50}
								width={76}
								height={32}
								rx={6}
								strokeWidth={1}
								style={{
									fill: "var(--lab-chartbtn-bg)",
									stroke: C.line,
									filter: "var(--lab-btn-drop)",
								}}
							/>
							<text
								x={896}
								y={PB + 71}
								textAnchor="middle"
								fontSize={15.5}
								style={{ fill: C.dim, fontFamily: mono }}
							>
								Clear
							</text>
						</g>

						{/* zone-edge drag handles: the triangle-and-label gutter above
						    the plot drags Z, as in the Base Fee lab. Confined to the
						    top strip so bar hover and resizing keep the whole plot. */}
						{[model.edgeBid - Z * BP, model.edgeAsk + Z * BP].map(
							(zp, side) => {
								const zx = xOfPrice(zp);
								if (zx < PL || zx > PR) return null;
								const s = side as 0 | 1;
								return (
									<g key={s}>
										<rect
											x={zx - 20}
											y={PT - 30}
											width={40}
											height={18}
											fill="transparent"
											style={{ cursor: "ew-resize" }}
											{...zoneStrip(s)}
										/>
										{zoneGrab === s && (
											<g pointerEvents="none">
												<path
													d={`M${zx - 9},${PT + 8} l -5,4 l 5,4`}
													fill="none"
													strokeWidth={1.5}
													style={{ stroke: C.zone }}
												/>
												<path
													d={`M${zx + 9},${PT + 8} l 5,4 l -5,4`}
													fill="none"
													strokeWidth={1.5}
													style={{ stroke: C.zone }}
												/>
											</g>
										)}
									</g>
								);
							},
						)}

						{/* M carriage — the signature. Rides the top strip; hover for
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
								style={{ stroke: C.measure }}
							/>
							<path
								d={`M0,${PT - 3} l -6,-10 l 12,0 z`}
								style={{ fill: C.measure }}
							/>
							<rect
								x={-58}
								y={8}
								width={116}
								height={22}
								rx={4}
								strokeWidth={0.75}
								style={{ fill: C.panel2, stroke: C.measure }}
							/>
							<text
								x={0}
								y={24}
								textAnchor="middle"
								fontSize={13.5}
								style={{ fill: C.measure, fontFamily: mono }}
							>
								M {fmtPx(model.M)}
								{model.state !== "fresh" ? " ❄" : ""}
							</text>
							{/* hover hit zone: the label box and arrow only, not the line */}
							<rect
								x={-58}
								y={6}
								width={116}
								height={PT - 15}
								fill="transparent"
								onPointerEnter={() => setMHover(true)}
								onPointerLeave={() => setMHover(false)}
								style={{ cursor: "help" }}
							/>
						</g>

						{/* M tooltip — the walk that produced it, side by side */}
						{mHover &&
							(() => {
								const xT = Math.min(
									Math.max(xOfPrice(model.M), PL + 190),
									PR - 190,
								);
								const top = PT + 8;
								if (model.state !== "fresh") {
									const rows = [
										{ t: "M Held: No Valid Candidate Book", c: C.text },
										{ t: "nothing is eligible to walk;", c: C.dim },
										{
											t: `showing last computed M ${fmtPx(model.M)}`,
											c: C.dim,
										},
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
												style={{ fill: C.panel2, stroke: C.measure }}
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
												l.side === side &&
												(model.measureUsed.get(l.i) ?? 0) > 0,
										)
										.sort((a, b) =>
											side === "bid" ? b.price - a.price : a.price - b.price,
										)
										.map((l) => ({
											t: `${fmtPx(l.price)} · ${fmt$(model.measureUsed.get(l.i) ?? 0)}`,
											c: C.text,
										}));
								const colOf = (side: Side) => {
									const rows = walk(side);
									const short =
										side === "bid" ? model.shortBid : model.shortAsk;
									if (short) {
										rows.push({ t: "", c: C.faint });
										rows.push({
											t: `${fmtPx(short.price)} · ${fmt$(short.missing)} *`,
											c: C.faint,
										});
									}
									return rows;
								};
								const anyShort =
									model.shortBid != null || model.shortAsk != null;
								const noteLines = anyShort
									? ["* missing depth, priced at the", "measurement boundary"]
									: ["purple slices = the depth each walk consumed"];
								const L = colOf("bid");
								const R = colOf("ask");
								const nRows = Math.max(L.length, R.length, 1);
								const headY = top + 44;
								const rowY = (k: number) => top + 64 + k * 17;
								const resY = rowY(nRows - 1) + 21;
								const footY = resY + 23;
								const noteY = footY + 18;
								const h = noteY + 10 + (noteLines.length - 1) * 15 - top;
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
											style={{ fill: C.panel2, stroke: C.measure }}
										/>
										<text
											x={xT}
											y={top + 22}
											textAnchor="middle"
											fontSize={14}
											style={{ fill: C.dim, fontFamily: mono }}
										>
											M: Measured Price of this Snapshot
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
											Sell {fmt$(D)} → Bids
										</text>
										<text
											x={colR}
											y={headY}
											fontSize={13.5}
											style={{ fill: C.ask, fontFamily: mono }}
										>
											Buy {fmt$(D)} → Asks
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
											Gets → {model.iBid != null ? fmtPx(model.iBid) : "–"}
										</text>
										<text
											x={colR}
											y={resY}
											fontSize={14}
											style={{ fill: C.ask, fontFamily: mono }}
										>
											Pays → {model.iAsk != null ? fmtPx(model.iAsk) : "–"}
										</text>
										<text
											x={xT}
											y={footY}
											textAnchor="middle"
											fontSize={14}
											style={{ fill: C.measure, fontFamily: mono }}
										>
											M = ({model.iBid != null ? fmtPx(model.iBid) : "–"} +{" "}
											{model.iAsk != null ? fmtPx(model.iAsk) : "–"}) / 2 ={" "}
											{fmtPx(model.M)}
										</text>
										{noteLines.map((t, k) => (
											<text
												key={t}
												x={xT}
												y={noteY + k * 15}
												textAnchor="middle"
												fontSize={12}
												style={{ fill: C.faint, fontFamily: mono }}
											>
												{t}
											</text>
										))}
									</g>
								);
							})()}

						{/* fee tooltip — itemized receipt in the fixed top-center slot
					    (shares it with the M tooltip, which takes precedence) */}
						{feeHover != null &&
							!mHover &&
							(() => {
								const tipI = feeHover;
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
									.filter((pr) => pr.baseFee <= b.own)
									.reduce((sum, pr) => sum + pr.paired, 0);
								if (atOrInside > 0)
									items.push({
										amt: 0,
										t: `${amt$(0, "+")} · ${Math.round((atOrInside / b.q) * 100)}% ≤ Base Fee`,
										c: C.dim,
									});
								for (const pr of b.pairs) {
									const extra = Math.max(0, pr.baseFee - b.own);
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
										t: `${amt$(amt, "+")} · ${pct}% Directional → Cap`,
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
									// starts under the equation's right-hand side, whose terms
									// it defines: 12 mono chars (" +0.92bps = ") at 14px ≈ 101
									indent: 101,
									t: "(M Distance − Total Fee)",
									c: C.faint,
									s: 12,
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
								tipH.current = h;
								return (
									<g
										pointerEvents="none"
										opacity={underTip ? 0.65 : 1}
										style={{ transition: "opacity 120ms" }}
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

				{/* scenarios — the guided tour, a footer band of the frame */}
				<div class="sf-scenarios">
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
						onClick={() => {
							if (scenario !== null && customSnap) {
								setSizes(customSnap.sizes);
								setCenterSide(customSnap.centerSide);
								setB(customSnap.B);
								setD(customSnap.D);
								setF(customSnap.F);
								setZ(customSnap.Z);
								setSlope(customSnap.slope);
								setSlope2(customSnap.slope2);
								setEffect(null);
								setScenario(null);
							}
						}}
						title="Return to your last custom book"
						style={{
							...btn(scenario === null),
							...(scenario !== null && !customSnap
								? { opacity: 0.45, cursor: "default" }
								: {}),
						}}
					>
						Custom
					</button>
				</div>
				<div class="sf-caption">
					{scenario
						? renderBlurb(
								SCENARIOS.find((sc) => sc.key === scenario)?.blurb ?? "",
							)
						: "Custom setup. Drag bars and dials freely. Picking a scenario keeps this book in memory, and the Custom button brings it back."}
				</div>
			</div>
		</div>
	);
}
