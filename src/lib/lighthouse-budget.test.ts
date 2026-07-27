import { describe, expect, test } from "bun:test";
import {
	checkBudgets,
	checkCategories,
	checkExpectedAudits,
	diffAssets,
	formatKibDelta,
	htmlFileToUrl,
	lighthouseConcurrency,
	mapWithConcurrency,
	median,
	normalizeAssetUrl,
} from "./lighthouse-budget";

const KIB = 1024;

describe("htmlFileToUrl", () => {
	test("maps the root index to /", () => {
		expect(htmlFileToUrl("index.html")).toBe("/");
	});

	test("maps a directory-style page to its pretty URL", () => {
		expect(htmlFileToUrl("about/index.html")).toBe("/about");
		expect(htmlFileToUrl("refactoring-with-love/index.html")).toBe(
			"/refactoring-with-love",
		);
	});

	test("keeps 404.html as a literal path", () => {
		/* astro preview serves it at /404.html with a 200, which is what
		 * Lighthouse needs; there is no pretty URL for it */
		expect(htmlFileToUrl("404.html")).toBe("/404.html");
	});
});

describe("normalizeAssetUrl", () => {
	test("strips the origin", () => {
		expect(normalizeAssetUrl("http://127.0.0.1:4399/about")).toBe("/about");
	});

	test("strips astro content hashes so a rebuild compares equal", () => {
		expect(
			normalizeAssetUrl(
				"http://127.0.0.1:4399/_astro/newsreader-latin-opsz-normal.DQOr0nmD.woff2",
			),
		).toBe("/_astro/newsreader-latin-opsz-normal.woff2");
		expect(normalizeAssetUrl("/_astro/PostLayout.Bdq5s1He.css")).toBe(
			"/_astro/PostLayout.css",
		);
		expect(normalizeAssetUrl("/_astro/page.B2uBVZjk.js")).toBe(
			"/_astro/page.js",
		);
	});

	test("handles hyphen and underscore in the hash alphabet", () => {
		expect(normalizeAssetUrl("/_astro/BaseLayout.CF-Vl2nb.css")).toBe(
			"/_astro/BaseLayout.css",
		);
		expect(normalizeAssetUrl("/_astro/Thing.Dh_MQqKQ.js")).toBe(
			"/_astro/Thing.js",
		);
	});

	test("leaves unhashed assets alone", () => {
		expect(normalizeAssetUrl("/assets/favicon.svg")).toBe(
			"/assets/favicon.svg",
		);
	});
});

describe("checkCategories", () => {
	const thresholds = { accessibility: 0.95, seo: 0.95 };

	test("passes a page at 1.00", () => {
		expect(
			checkCategories("/ [mobile]", { accessibility: 1, seo: 1 }, thresholds),
		).toEqual([]);
	});

	test("flags a category below threshold", () => {
		const v = checkCategories(
			"/ [mobile]",
			{ accessibility: 0.9, seo: 1 },
			thresholds,
		);
		expect(v).toHaveLength(1);
		expect(v[0].subject).toBe("/ [mobile] accessibility");
		expect(v[0].message).toContain("0.90");
	});

	test("flags a category that did not run rather than skipping it", () => {
		const v = checkCategories(
			"/ [mobile]",
			{ accessibility: null },
			{
				accessibility: 0.95,
			},
		);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("did not run");
	});

	test("treats the threshold as inclusive", () => {
		expect(checkCategories("/ [mobile]", { seo: 0.95 }, { seo: 0.95 })).toEqual(
			[],
		);
	});
});

describe("checkExpectedAudits", () => {
	test("passes when the 404 noindex is still failing is-crawlable", () => {
		expect(
			checkExpectedAudits(
				"/404.html [mobile]",
				{ "is-crawlable": 0 },
				{
					"is-crawlable": 0,
				},
			),
		).toEqual([]);
	});

	test("fails if the noindex silently disappears", () => {
		const v = checkExpectedAudits(
			"/404.html [mobile]",
			{ "is-crawlable": 1 },
			{
				"is-crawlable": 0,
			},
		);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("but 0 is expected");
	});
});

describe("checkBudgets", () => {
	const summary = {
		total: { transferSize: 187_157, requestCount: 12 },
		script: { transferSize: 7_181, requestCount: 5 },
		"third-party": { transferSize: 0, requestCount: 0 },
	};

	test("passes the current heaviest page against the shipped budgets", () => {
		expect(
			checkBudgets("/refactoring-with-love", summary, {
				total: 250,
				script: 30,
			}),
		).toEqual([]);
	});

	test("flags a script budget overage with the overage amount", () => {
		const v = checkBudgets("/refactoring-with-love", summary, { script: 5 });
		expect(v).toHaveLength(1);
		expect(v[0].subject).toContain("script bytes");
		expect(v[0].message).toContain("7.0 KiB over a 5 KiB budget");
	});

	test("treats a missing resource type as zero rather than a failure", () => {
		expect(checkBudgets("/", summary, { image: 100 })).toEqual([]);
	});

	test("flags third-party requests appearing", () => {
		const withThirdParty = {
			...summary,
			"third-party": { transferSize: 4_096, requestCount: 2 },
		};
		const v = checkBudgets("/", withThirdParty, {}, { "third-party": 0 });
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("2 requests");
	});

	test("is exactly at budget without failing", () => {
		const exact = { script: { transferSize: 10 * KIB, requestCount: 1 } };
		expect(checkBudgets("/", exact, { script: 10 })).toEqual([]);
	});
});

describe("diffAssets", () => {
	const before = {
		"/_astro/newsreader.woff2": {
			transferSize: 95_068,
			resourceSize: 94_748,
			resourceType: "Font",
		},
		"/_astro/gone.js": {
			transferSize: 1_000,
			resourceSize: 900,
			resourceType: "Script",
		},
	};

	test("reports a shrunk font as a single changed entry", () => {
		const after = {
			"/_astro/newsreader.woff2": {
				transferSize: 71_204,
				resourceSize: 71_000,
				resourceType: "Font",
			},
			"/_astro/gone.js": before["/_astro/gone.js"],
		};
		const deltas = diffAssets(before, after);
		expect(deltas).toHaveLength(1);
		expect(deltas[0].name).toBe("/_astro/newsreader.woff2");
		expect(deltas[0].status).toBe("changed");
		expect(deltas[0].delta).toBe(-23_864);
	});

	test("classifies added and removed files", () => {
		const after = {
			"/_astro/newsreader.woff2": before["/_astro/newsreader.woff2"],
			"/_astro/new.js": {
				transferSize: 500,
				resourceSize: 400,
				resourceType: "Script",
			},
		};
		const deltas = diffAssets(before, after);
		const byName = Object.fromEntries(deltas.map((d) => [d.name, d.status]));
		expect(byName["/_astro/gone.js"]).toBe("removed");
		expect(byName["/_astro/new.js"]).toBe("added");
	});

	test("sorts by absolute change so the biggest mover leads", () => {
		const after = {
			"/_astro/newsreader.woff2": {
				transferSize: 95_168,
				resourceSize: 94_748,
				resourceType: "Font",
			},
			"/_astro/gone.js": {
				transferSize: 11_000,
				resourceSize: 900,
				resourceType: "Script",
			},
		};
		expect(diffAssets(before, after)[0].name).toBe("/_astro/gone.js");
	});

	test("drops unchanged files", () => {
		expect(diffAssets(before, before)).toEqual([]);
	});
});

describe("formatKibDelta", () => {
	test("renders KiB with a sign past a kibibyte", () => {
		expect(formatKibDelta(-23_864)).toBe("-23.3 KiB");
		expect(formatKibDelta(3_584)).toBe("+3.5 KiB");
	});

	test("drops to bytes below a kibibyte so small changes stay legible", () => {
		/* rewriting a hashed asset reference moves a document a few bytes;
		 * "+0.0 KiB" would read as no size at all */
		expect(formatKibDelta(38)).toBe("+38 B");
		expect(formatKibDelta(-7)).toBe("-7 B");
	});

	test("has no sign at zero", () => {
		expect(formatKibDelta(0)).toBe("0 B");
	});
});

describe("lighthouseConcurrency", () => {
	test("still parallelises on the 2-core private runner", () => {
		expect(lighthouseConcurrency(2)).toBe(2);
	});

	test("uses 4 on the public runner", () => {
		expect(lighthouseConcurrency(4)).toBe(4);
	});

	test("caps at 4 on a big local machine", () => {
		expect(lighthouseConcurrency(32)).toBe(4);
	});

	test("floors at 2 rather than serialising on a single core", () => {
		expect(lighthouseConcurrency(1)).toBe(2);
	});
});

describe("mapWithConcurrency", () => {
	test("returns results in input order, not completion order", async () => {
		/* delays are deliberately inverted, so completion order is the
		 * reverse of input order */
		const out = await mapWithConcurrency([30, 20, 10], 3, async (ms) => {
			await Bun.sleep(ms);
			return ms;
		});
		expect(out).toEqual([30, 20, 10]);
	});

	test("never exceeds the limit in flight", async () => {
		let inFlight = 0;
		let peak = 0;
		await mapWithConcurrency(Array.from({ length: 12 }), 3, async () => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await Bun.sleep(5);
			inFlight--;
			return null;
		});
		expect(peak).toBe(3);
	});

	test("runs every item exactly once", async () => {
		const seen: number[] = [];
		await mapWithConcurrency([0, 1, 2, 3, 4, 5, 6], 3, async (n) => {
			seen.push(n);
			return n;
		});
		expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	test("handles an empty list without hanging", async () => {
		expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
	});

	test("propagates a failure rather than silently dropping it", async () => {
		expect(
			mapWithConcurrency([1, 2], 2, async (n) => {
				if (n === 2) throw new Error("lighthouse failed");
				return n;
			}),
		).rejects.toThrow("lighthouse failed");
	});
});

describe("median", () => {
	test("takes the middle of an odd sample", () => {
		expect(median([2118, 1980, 2400])).toBe(2118);
	});

	test("averages the middle pair of an even sample", () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	test("returns NaN for an empty sample", () => {
		expect(median([])).toBeNaN();
	});
});
