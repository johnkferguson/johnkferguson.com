/**
 * Snapshot fees — the Typical Demand machine (D).
 *
 * D is the Mark's measuring size: the market's typical per-auction demand,
 * measured from fills and rebased once per epoch (a day, throughout). Per
 * window, two running sums and nothing else:
 *
 *   S1 += v        S2 += v²
 *
 * where v is the window's executed taker notional (both flows summed; in a
 * netting venue fills are the imbalance that reaches the book, so the
 * definition adapts per venue). At epoch close the sensor S2/S1 is the
 * dollar-weighted typical window: each traded dollar reports the size of the
 * window it traded in, and the sensor is the average of those reports. No
 * window count appears anywhere.
 *
 * The update is ordinary hygiene for an automated statistic, not defense:
 * if the epoch carried at least g·D of flow (minimum sample), D steps by
 * (sensor/D)^α bounded to [1/c, c] (one day, whatever it contains, moves the
 * yardstick at most c×); otherwise D freezes for the epoch, no decay. D never
 * falls below the configured floor, which is a mark-validity bound (a walk
 * too small reads only the best quotes) and is separate from the launch
 * seed, which initializes D and constrains nothing afterward.
 *
 * This is one possible instantiation of a demand measure. The forms are
 * argued from what each part must do; the values are fit per venue, like the
 * fee-curve parameters.
 */

export interface DemandParams {
	/** Launch value, $. Initializes D; constrains nothing afterward. */
	seed: number;
	/** Validity floor D_min, $: protects the walk's depth, not demand. */
	floor: number;
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
	s1: number;
	s2: number;
	/** Did the epoch carry g·D of flow? */
	gate: boolean;
	/** S2/S1, the dollar-weighted typical window. Null when gated. */
	sensor: number | null;
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
	let s1 = 0;
	let s2 = 0;
	for (const [n, v] of windows) {
		if (n <= 0 || v <= 0) continue;
		s1 += n * v;
		s2 += n * v * v;
	}
	const gate = s1 >= p.gate * dOpen - 1e-9;
	if (!gate) {
		return {
			dOpen,
			s1,
			s2,
			gate,
			sensor: null,
			rawStep: null,
			step: 1,
			clamped: false,
			floored: false,
			dClose: dOpen,
		};
	}
	const sensor = s2 / s1;
	const rawStep = (sensor / dOpen) ** p.alpha;
	const step = Math.min(p.clampMult, Math.max(1 / p.clampMult, rawStep));
	const clamped = Math.abs(step - rawStep) > 1e-12;
	let dClose = dOpen * step;
	let floored = false;
	if (dClose < p.floor) {
		dClose = p.floor;
		floored = true;
	}
	return {
		dOpen,
		s1,
		s2,
		gate,
		sensor,
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
