import { describe, expect, test } from "bun:test";
import { shareControls } from "./share";

describe("shareControls", () => {
	test("touch device with a share sheet gets share alone", () => {
		/* the sheet already contains Copy; a copy button would duplicate it */
		expect(shareControls({ hasShare: true, coarsePointer: true })).toEqual([
			"share",
		]);
	});

	test("pointer device without a share sheet gets copy alone", () => {
		/* Chrome and Brave on Linux, Firefox on every desktop */
		expect(shareControls({ hasShare: false, coarsePointer: false })).toEqual([
			"copy",
		]);
	});

	test("pointer device with a share sheet gets both, copy first", () => {
		/* most current macOS and Windows browsers */
		expect(shareControls({ hasShare: true, coarsePointer: false })).toEqual([
			"copy",
			"share",
		]);
	});

	test("touch device without a share sheet falls back to copy", () => {
		expect(shareControls({ hasShare: false, coarsePointer: true })).toEqual([
			"copy",
		]);
	});

	test("copy is offered in every state that lacks a share sheet", () => {
		for (const coarsePointer of [true, false]) {
			expect(shareControls({ hasShare: false, coarsePointer })).toContain(
				"copy",
			);
		}
	});

	test("no state is ever empty", () => {
		for (const hasShare of [true, false]) {
			for (const coarsePointer of [true, false]) {
				expect(
					shareControls({ hasShare, coarsePointer }).length,
				).toBeGreaterThan(0);
			}
		}
	});
});
