import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* Publishing is two steps: move the file out of drafts/ and drop
 * draft: true. Only the first is enforced by anything. Forget the second
 * and getVisiblePosts filters the post out of production, so there is no
 * page, no feed entry and no sitemap entry, while the build succeeds and
 * every check passes. The post simply is not there.
 *
 * Same reasoning as post-ids.test.ts: a silent content-layer outcome is
 * worth a loud test. Read off the filesystem rather than through the
 * content layer, because the loader's own drafts/ exclusion is keyed on
 * ASTRO_BUILD and would hide half the question.
 *
 * Unpublishing is moving the file back to drafts/, not flipping the flag
 * in place, which is also what takes it back out of the public repo. */

const POSTS = join(import.meta.dir, "../content/posts");

/** `draft: true` inside the leading frontmatter block only. */
function declaresDraft(source: string): boolean {
	const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return false;
	return /^draft:\s*true\s*$/m.test(fm[1] ?? "");
}

function postFiles(): string[] {
	return readdirSync(POSTS, { recursive: true })
		.map(String)
		.filter((f) => /\.(md|mdx)$/.test(f));
}

describe("the drafts boundary", () => {
	test("no published post is still flagged draft", () => {
		const published = postFiles().filter((f) => !/^drafts[/\\]/.test(f));
		/* CI clones without drafts/, so this list is the whole collection
		 * there; locally it is the published half */
		expect(published.length).toBeGreaterThan(0);

		const stillFlagged = published.filter((f) =>
			declaresDraft(readFileSync(join(POSTS, f), "utf8")),
		);
		expect(stillFlagged).toEqual([]);
	});
});

describe("declaresDraft", () => {
	test("reads the frontmatter flag", () => {
		expect(declaresDraft("---\ntitle: x\ndraft: true\n---\n\nbody")).toBe(true);
	});

	test("ignores draft: false", () => {
		expect(declaresDraft("---\ntitle: x\ndraft: false\n---\n")).toBe(false);
	});

	test("ignores the word in the body, which is prose about drafts", () => {
		expect(
			declaresDraft("---\ntitle: x\n---\n\ndraft: true in a code fence"),
		).toBe(false);
	});

	test("ignores a file with no frontmatter", () => {
		expect(declaresDraft("just a body")).toBe(false);
	});
});
