import { describe, expect, test } from "bun:test";
import { labEventPath, shouldCount } from "./analytics";

describe("shouldCount", () => {
	test("counts the production host, with or without www", () => {
		expect(shouldCount("johnkferguson.com")).toBe(true);
		expect(shouldCount("www.johnkferguson.com")).toBe(true);
	});

	test("skips deploy previews and local hosts", () => {
		expect(shouldCount("deploy-preview-60--johnkferguson.netlify.app")).toBe(
			false,
		);
		expect(shouldCount("localhost")).toBe(false);
		expect(shouldCount("127.0.0.1")).toBe(false);
	});
});

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
