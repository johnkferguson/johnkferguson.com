/* Every repo-relative link in the top-level docs points at something that
 * exists.
 *
 * The README is a tour, and a tour is only useful while its links land.
 * Renaming or moving a file is exactly the change that breaks one, and
 * nothing else would notice: lychee checks the built site, not markdown
 * in the repo, and GitHub renders a dead relative link as an ordinary
 * link that 404s on click.
 *
 * Only relative targets are checked. External URLs are lychee's job and
 * would make this test depend on the network. */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = ["README.md", "CONTRIBUTING.md", "CLAUDE.md"];

/** repo root, from src/lib/ */
const ROOT = resolve(import.meta.dir, "../..");

/* Tracked paths, not the working directory.
 *
 * A link in the README resolves against the repo as GitHub serves it, so
 * existsSync is the wrong question: src/content/posts/drafts/ is present
 * on the author's disk (it is a nested private repo) and gitignored here,
 * so a link to it passes locally and 404s for everyone else.
 *
 * --others --exclude-standard counts a file that is new but not ignored,
 * so writing a doc and the file it links to in one go does not fail until
 * the moment it is staged. */
const tracked = new Set(
	Bun.spawnSync(
		["git", "ls-files", "--cached", "--others", "--exclude-standard"],
		{ cwd: ROOT },
	)
		.stdout.toString()
		.split("\n")
		.filter(Boolean),
);

/** Directories are not listed by ls-files, so infer them from their files. */
const trackedDirs = new Set<string>();
for (const path of tracked) {
	const parts = path.split("/");
	for (let i = 1; i < parts.length; i++) {
		trackedDirs.add(parts.slice(0, i).join("/"));
	}
}

function isTracked(target: string): boolean {
	const clean = target.replace(/\/+$/, "");
	return tracked.has(clean) || trackedDirs.has(clean);
}

/** `[text](target)` and `[text](<target>)`, ignoring images. */
const LINK = /\[[^\]]*\]\(\s*(?:<([^>]+)>|([^()\s]+))\s*(?:"[^"]*")?\)/g;

function relativeTargets(markdown: string): string[] {
	const found: string[] = [];
	for (const m of markdown.matchAll(LINK)) {
		const target = (m[1] ?? m[2] ?? "").trim();
		if (target === "") continue;
		/* external, protocol-relative, in-page anchors, mail */
		if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;
		/* strip a trailing anchor: docs/x.md#section resolves to docs/x.md */
		found.push(target.split("#")[0] ?? target);
	}
	return found;
}

describe("relative links in the docs", () => {
	for (const doc of DOCS) {
		const path = resolve(ROOT, doc);

		test(`${doc} exists`, () => {
			/* a renamed doc would otherwise silently check nothing */
			expect(existsSync(path)).toBe(true);
		});

		test(`${doc} links all resolve in the repo`, async () => {
			const markdown = await Bun.file(path).text();
			const targets = relativeTargets(markdown);
			const broken = targets.filter((t) => !isTracked(t));
			expect(broken).toEqual([]);
		});
	}

	test("the README actually carries repo links, so the check is not vacuous", () => {
		/* if a rewrite dropped every relative link, the assertions above would
		 * pass over an empty list and report clean */
		const markdown = require("node:fs").readFileSync(
			resolve(ROOT, "README.md"),
			"utf8",
		);
		expect(relativeTargets(markdown).length).toBeGreaterThan(5);
	});
});

describe("relativeTargets", () => {
	test("takes repo-relative targets", () => {
		expect(relativeTargets("see [art](src/lib/art) here")).toEqual([
			"src/lib/art",
		]);
	});

	test("skips external and anchor-only links", () => {
		const md =
			"[a](https://x.test) [b](//x.test) [c](#section) [d](mailto:x@y.test)";
		expect(relativeTargets(md)).toEqual([]);
	});

	test("handles angle-bracket targets, which is how a path with brackets is written", () => {
		expect(relativeTargets("[x](<src/pages/[slug].md.ts>)")).toEqual([
			"src/pages/[slug].md.ts",
		]);
	});

	test("drops a trailing anchor so the file still resolves", () => {
		expect(relativeTargets("[x](CONTRIBUTING.md#prs)")).toEqual([
			"CONTRIBUTING.md",
		]);
	});
});
