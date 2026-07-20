import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/* generateId in content.config.ts strips the drafts/ prefix so a draft
 * keeps its final slug across publishing. Side effect: drafts/foo.md and
 * a published foo.md would silently collide (content layer warns,
 * last-one-wins). Keep that failure loud. */
describe("post ids", () => {
	test("drafts and published posts never collide", () => {
		const postsDir = join(import.meta.dir, "../content/posts");
		const ids = readdirSync(postsDir, { recursive: true })
			.map(String)
			.filter((f) => /\.(md|mdx)$/.test(f))
			.map((f) => f.replace(/^drafts[/\\]/, "").replace(/\.(md|mdx)$/, ""));
		expect(ids.length).toBeGreaterThan(0);
		const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
		expect(dupes).toEqual([]);
	});
});
