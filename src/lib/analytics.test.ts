import { describe, expect, test } from "bun:test";
import {
	coversEnough,
	type LabEventKind,
	labEventPath,
	labTracker,
	SEEN_DWELL_MS,
} from "./analytics";

describe("labEventPath", () => {
	test("builds lab/<post>/<lab>/<kind>", () => {
		expect(
			labEventPath("/snapshot-fees", "lab-setting-the-base-fee", "seen"),
		).toBe("lab/snapshot-fees/setting-the-base-fee/seen");
	});

	test("is the same for every served spelling of the page", () => {
		for (const pathname of [
			"/snapshot-fees",
			"/snapshot-fees/",
			"/snapshot-fees.html",
		]) {
			expect(labEventPath(pathname, "lab-demand", "used")).toBe(
				"lab/snapshot-fees/demand/used",
			);
		}
	});

	test("keeps an explicit id that lacks the lab- prefix", () => {
		expect(labEventPath("/snapshot-fees", "custom", "used")).toBe(
			"lab/snapshot-fees/custom/used",
		);
	});

	test("names the root page", () => {
		expect(labEventPath("/", "lab-demo", "seen")).toBe("lab/home/demo/seen");
	});
});

describe("coversEnough", () => {
	test("a short lab needs half of itself on screen", () => {
		expect(coversEnough(200, 400, 900)).toBe(true);
		expect(coversEnough(199, 400, 900)).toBe(false);
	});

	test("a lab taller than the viewport needs half the viewport", () => {
		/* 1427px lab on a 667px phone: at most 47% of it is ever visible */
		expect(coversEnough(334, 1427, 667)).toBe(true);
		expect(coversEnough(333, 1427, 667)).toBe(false);
	});

	test("nothing visible is never enough", () => {
		expect(coversEnough(0, 0, 667)).toBe(false);
	});
});

/* manual clock: set() queues, advance() runs whatever is due */
function fakeTimers() {
	let now = 0;
	let next = 0;
	const queue = new Map<number, { at: number; fn: () => void }>();
	return {
		set(fn: () => void, ms: number) {
			queue.set(next, { at: now + ms, fn });
			return next++;
		},
		clear(id: unknown) {
			queue.delete(id as number);
		},
		advance(ms: number) {
			now += ms;
			for (const [id, t] of [...queue]) {
				if (t.at > now) continue;
				queue.delete(id);
				t.fn();
			}
		},
	};
}

function setup() {
	const timers = fakeTimers();
	const fired: LabEventKind[] = [];
	const tracker = labTracker((kind) => fired.push(kind), timers);
	return { timers, fired, tracker };
}

describe("labTracker", () => {
	test("fires seen after the lab stays covered for the dwell time", () => {
		const { timers, fired, tracker } = setup();
		tracker.visibility(true);
		timers.advance(SEEN_DWELL_MS - 1);
		expect(fired).toEqual([]);
		timers.advance(1);
		expect(fired).toEqual(["seen"]);
	});

	test("a lab scrolled past before the dwell time is not seen", () => {
		const { timers, fired, tracker } = setup();
		tracker.visibility(true);
		timers.advance(SEEN_DWELL_MS / 2);
		tracker.visibility(false);
		timers.advance(SEEN_DWELL_MS * 2);
		expect(fired).toEqual([]);
	});

	test("repeated covered reports do not restart the dwell", () => {
		const { timers, fired, tracker } = setup();
		tracker.visibility(true);
		timers.advance(SEEN_DWELL_MS / 2);
		tracker.visibility(true);
		timers.advance(SEEN_DWELL_MS / 2);
		expect(fired).toEqual(["seen"]);
	});

	test("each event fires at most once", () => {
		const { timers, fired, tracker } = setup();
		for (let i = 0; i < 3; i++) {
			tracker.visibility(true);
			timers.advance(SEEN_DWELL_MS);
			tracker.visibility(false);
			tracker.use();
		}
		expect(fired).toEqual(["seen", "used"]);
	});

	test("used does not wait for seen", () => {
		const { fired, tracker } = setup();
		tracker.use();
		expect(fired).toEqual(["used"]);
	});
});
