/**
 * Snapshot fees — the Typical Demand machine (D).
 *
 * D is the Mark's measuring size: the market's typical per-auction demand,
 * measured from fills and rebased once per epoch (a day, throughout). Per
 * window, two accumulators and nothing else:
 *
 *   S1 += min(v, w·D)        S2 += min(v, w·D)²
 *
 * where v is the window's executed taker notional (both flows summed; in a
 * netting venue fills are the imbalance that reaches the book, so the
 * definition adapts per venue). At epoch close the sensor S2/S1 is the
 * dollar-weighted typical window: each traded dollar reports the size of the
 * window it traded in, so dust windows carry almost no weight. No window
 * count appears anywhere; the per-window mean S1/N is exactly the estimator
 * dust inflates, and it is deliberately not used.
 *
 * If the epoch carried at least g·D of counted flow, D steps by (sensor/D)^α
 * bounded to [1/c, c] and floored at the seed; otherwise D freezes for the
 * epoch (no decay). At α = 1/2 the step closes half the remaining doublings
 * per epoch.
 *
 * This is one concrete instantiation of a demand measure: w, g, α, c and the
 * seed are parameters of the machine, not constants of the design.
 */

export interface DemandParams {
	/** Launch value and floor, $. The one declared number. */
	seed: number;
	/** Winsor multiple w: a single window counts at most w × D. */
	winsor: number;
	/** Gate multiple g: an epoch updates D only if S1 ≥ g × D. */
	gate: number;
	/** Chase exponent α: the epoch step is (sensor/D)^α. */
	alpha: number;
	/** Clamp multiple c: one epoch's step is bounded to [1/c, c]. */
	clampMult: number;
}

/** A group of same-sized windows: [how many windows, $ traded in each]. */
export type WindowGroup = [count: number, v: number];

export interface EpochResult {
	dOpen: number;
	/** Winsorized accumulators. */
	s1: number;
	s2: number;
	/** Uncapped accumulators, for showing what winsorizing prevented. */
	s1Raw: number;
	s2Raw: number;
	/** True when at least one window hit the w·D cap. */
	winsorized: boolean;
	/** Did the epoch carry g·D of counted flow? */
	gate: boolean;
	/** S2/S1, the dollar-weighted typical window. Null when gated. */
	sensor: number | null;
	/** The uncapped sensor, for comparison. Null when gated or flowless. */
	sensorRaw: number | null;
	/** (sensor/D)^α before clamping. Null when gated. */
	rawStep: number | null;
	/** The applied multiplier (1 when gated). */
	step: number;
	clamped: boolean;
	floored: boolean;
	dClose: number;
}

export function runEpoch(
	dOpen: number,
	windows: WindowGroup[],
	p: DemandParams,
): EpochResult {
	const cap = p.winsor * dOpen;
	let s1 = 0;
	let s2 = 0;
	let s1Raw = 0;
	let s2Raw = 0;
	let winsorized = false;
	for (const [n, v] of windows) {
		if (n <= 0 || v <= 0) continue;
		const c = Math.min(v, cap);
		if (v > cap) winsorized = true;
		s1 += n * c;
		s2 += n * c * c;
		s1Raw += n * v;
		s2Raw += n * v * v;
	}
	const gate = s1 >= p.gate * dOpen - 1e-9;
	if (!gate) {
		return {
			dOpen,
			s1,
			s2,
			s1Raw,
			s2Raw,
			winsorized,
			gate,
			sensor: null,
			sensorRaw: null,
			rawStep: null,
			step: 1,
			clamped: false,
			floored: false,
			dClose: dOpen,
		};
	}
	const sensor = s2 / s1;
	const sensorRaw = s1Raw > 0 ? s2Raw / s1Raw : null;
	const rawStep = (sensor / dOpen) ** p.alpha;
	const step = Math.min(p.clampMult, Math.max(1 / p.clampMult, rawStep));
	const clamped = Math.abs(step - rawStep) > 1e-12;
	let dClose = dOpen * step;
	let floored = false;
	if (dClose < p.seed) {
		dClose = p.seed;
		floored = true;
	}
	return {
		dOpen,
		s1,
		s2,
		s1Raw,
		s2Raw,
		winsorized,
		gate,
		sensor,
		sensorRaw,
		rawStep,
		step,
		clamped,
		floored,
		dClose,
	};
}

/** Run consecutive epochs from the seed, threading D through. */
export function runEpochs(
	days: WindowGroup[][],
	p: DemandParams,
): EpochResult[] {
	let d = p.seed;
	return days.map((w) => {
		const r = runEpoch(d, w, p);
		d = r.dClose;
		return r;
	});
}

/**
 * Effective window count S1²/S2: how many equal windows the epoch's money
 * behaved like. Diagnostic only; the machine itself never counts windows.
 * Identity: nEff × sensor = S1.
 */
export function nEff(s1: number, s2: number): number {
	return s2 > 0 ? (s1 * s1) / s2 : 0;
}
