import { expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { ogArtOptions, pinArtColors } from "../og";
import { hashSeed } from "./core";
import { artSvg, DEFAULT_QUIET } from "./generate";
import { PIECES } from "./pieces";

/*
 * Pinned art is regenerated at every build, so a change to a piece or a
 * shared primitive silently redraws the artwork on already-published
 * posts. This snapshot makes that failure loud: it hashes each pinned
 * post's rendered surfaces against art-snapshots.json. An intentional
 * change is accepted with:
 *
 *   UPDATE_ART_SNAPSHOTS=1 bun test src/lib/art/pinned-art.test.ts
 */

const POSTS_DIR = resolve("src/content/posts");
const SNAP_PATH = resolve("src/lib/art/art-snapshots.json");

interface PinnedArt {
	piece: string;
	seed?: string;
	params?: Record<string, number>;
	thumb?: { x: number; y: number; w: number; h: number };
	motion?: boolean;
}

/**
 * The art: block, read with the same YAML the site's own loader uses.
 *
 * This was a hand-rolled line parser, and every fix to it was another
 * way it differed from YAML: it stopped at the first comment line, and
 * once that was fixed a TRAILING comment still parsed into the value, so
 * `seed: abc # chosen in review` hashed as that whole string and
 * `bars: 52 # wider` came out a string instead of a number. Both make
 * the guard report drift that never happened, which is the one failure a
 * drift guard cannot afford. Astro parses this frontmatter with real
 * YAML; so does this.
 */
function parseArt(md: string): PinnedArt | null {
	const fm = md.match(/^---\n([\s\S]*?)\n---/);
	if (!fm) return null;
	const doc = parseYaml(fm[1]) as { art?: PinnedArt } | null;
	const art = doc?.art;
	if (!art?.piece) return null;
	/* YAML reads an unquoted 123456 as a number, and so would Astro,
	 * whose schema types seed as a string and would reject it. Say that
	 * here rather than letting hashSeed die inside charCodeAt. */
	if (art.seed !== undefined && typeof art.seed !== "string") {
		throw new Error(
			`art.seed must be a string; quote it in the frontmatter (got ${typeof art.seed})`,
		);
	}
	return art;
}

const hex = (s: string) => hashSeed(s).toString(16).padStart(8, "0");

/** the production surfaces, mirroring PostLayout and index.astro */
function surfaceHashes(slug: string, art: PinnedArt): Record<string, string> {
	const common = {
		seedKey: art.seed ?? slug,
		piece: art.piece,
		params: art.params,
	};
	const backdrop = artSvg({
		...common,
		width: 1600,
		height: 640,
		quiet: DEFAULT_QUIET,
		quietStrength: 0.4,
	});
	const thumb = art.thumb
		? artSvg({
				...common,
				animate: art.motion,
				width: 1600,
				height: 640,
				quiet: DEFAULT_QUIET,
				quietStrength: 0.4,
				crop: art.thumb,
			})
		: artSvg({ ...common, animate: art.motion, width: 800, height: 560 });
	/* The share card, built from the endpoint's own options rather than a
	 * copy of them, and hashed AFTER pinArtColors because that is what
	 * ships: a palette edit really does redraw every card, and this is
	 * where that should surface. Only the art is hashed, never the
	 * assembled card, which carries the title, date and reading time, so
	 * hashing it would churn this snapshot on every prose edit and train
	 * whoever sees the diff to accept it blindly. */
	const og = pinArtColors(artSvg(ogArtOptions(art, slug)));
	return { backdrop: hex(backdrop), thumb: hex(thumb), og: hex(og) };
}

/* Recursive and .mdx-aware on purpose. Posts are authored as .md or
 * .mdx and drafts live a directory down, so a top-level .md-only scan
 * silently covered none of either: a draft could be tuned, pinned, and
 * published without this guard ever having watched it. Slugs mirror the
 * collection's generateId (src/content.config.ts), which strips the
 * drafts/ prefix, so a post keeps its snapshot key when it publishes. */
const pinned = readdirSync(POSTS_DIR, { recursive: true })
	.filter((f): f is string => typeof f === "string" && /\.mdx?$/.test(f))
	.flatMap((file) => {
		const art = parseArt(readFileSync(resolve(POSTS_DIR, file), "utf8"));
		const slug = file.replace(/^drafts\//, "").replace(/\.mdx?$/, "");
		return art ? [{ slug, art }] : [];
	});

test("no two posts pin the same piece", () => {
	/* Pieces are commissioned one per post, which is what lets per-piece
	 * settings like ogQuiet stand in for per-post ones: there is no
	 * frontmatter override for them, so a shared piece would silently tie
	 * two posts' cards together. */
	const byPiece = new Map<string, string[]>();
	for (const { slug, art } of pinned) {
		byPiece.set(art.piece, [...(byPiece.get(art.piece) ?? []), slug]);
	}
	const shared = [...byPiece].filter(([, slugs]) => slugs.length > 1);
	expect(shared.map(([p, slugs]) => `${p}: ${slugs.join(", ")}`)).toEqual([]);
});

test("every pinned piece exists", () => {
	/* a renamed piece should fail here, not ship fallback art */
	for (const { slug, art } of pinned) {
		expect(Object.keys(PIECES), `${slug} pins ${art.piece}`).toContain(
			art.piece,
		);
	}
});

test("a quoted numeric seed parses as a string, not a number", () => {
	const art = parseArt(
		'---\ntitle: "x"\nart:\n  piece: refactoring-with-love\n  seed: "123456"\n  motion: true\n  params:\n    cell: 32\n---\nbody',
	);
	expect(art?.seed).toBe("123456");
	expect(art?.motion).toBe(true);
	expect(art?.params?.cell).toBe(32);
	/* and the full pipeline must hash it, not throw */
	expect(() => surfaceHashes("x", art as PinnedArt)).not.toThrow();
});

test("published pinned art matches its snapshot", () => {
	const actual = Object.fromEntries(
		pinned.map(({ slug, art }) => [slug, surfaceHashes(slug, art)]),
	);
	if (process.env.UPDATE_ART_SNAPSHOTS) {
		writeFileSync(SNAP_PATH, `${JSON.stringify(actual, null, "\t")}\n`);
		return;
	}
	let stored: Record<string, Record<string, string>> = {};
	try {
		stored = JSON.parse(readFileSync(SNAP_PATH, "utf8"));
	} catch {
		/* missing file: the expect below reports the drift */
	}
	expect(
		actual,
		"pinned art output changed; if intentional, accept with UPDATE_ART_SNAPSHOTS=1 bun test src/lib/art/pinned-art.test.ts",
	).toEqual(stored);
});
