import { expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashSeed } from "./core";
import { artSvg, DEFAULT_QUIET } from "./generate";

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

/* top-level art keys are strings or booleans; a quoted numeric seed
 * ("123456") must STAY a string or hashSeed's charCodeAt explodes */
function coerceScalar(raw: string): string | boolean {
	const s = raw.replace(/^["']|["']$/g, "");
	if (s === "true") return true;
	if (s === "false") return false;
	return s;
}

/* params/thumb values, where numbers are the point */
function coerceNested(raw: string): string | number | boolean {
	const s = coerceScalar(raw);
	if (typeof s === "boolean") return s;
	const n = Number(s);
	return Number.isNaN(n) || s === "" ? s : n;
}

/* minimal parser for the art: block this repo's frontmatter uses
 * (scalar keys at 2 spaces, params/thumb maps nested at 4) */
function parseArt(md: string): PinnedArt | null {
	const fm = md.match(/^---\n([\s\S]*?)\n---/);
	if (!fm) return null;
	const lines = fm[1].split("\n");
	const start = lines.findIndex((l) => /^art:\s*$/.test(l));
	if (start === -1) return null;
	// biome-ignore lint/suspicious/noExplicitAny: transient parse target
	const art: any = {};
	// biome-ignore lint/suspicious/noExplicitAny: transient parse target
	let nested: any = null;
	for (let i = start + 1; i < lines.length; i++) {
		const m = lines[i].match(/^(\s+)([\w-]+):\s*(.*)$/);
		if (!m) break;
		const [, indent, key, raw] = m;
		if (indent.length === 2) {
			if (raw === "") {
				art[key] = {};
				nested = art[key];
			} else {
				art[key] = coerceScalar(raw);
				nested = null;
			}
		} else if (nested) {
			nested[key] = coerceNested(raw);
		}
	}
	return art.piece ? (art as PinnedArt) : null;
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
	return { backdrop: hex(backdrop), thumb: hex(thumb) };
}

const pinned = readdirSync(POSTS_DIR, { withFileTypes: true })
	.filter((e) => e.isFile() && e.name.endsWith(".md"))
	.flatMap((e) => {
		const art = parseArt(readFileSync(resolve(POSTS_DIR, e.name), "utf8"));
		const slug = e.name.replace(/\.md$/, "");
		return art ? [{ slug, art }] : [];
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
