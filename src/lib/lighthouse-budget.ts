/**
 * Pure helpers behind `scripts/lighthouse.ts`. Everything here is a plain
 * function over already-collected Lighthouse JSON so it can be unit-tested
 * without driving Chrome; the script owns the browser, the server, and the
 * config.
 *
 * Budgets are enforced here rather than by Lighthouse because Lighthouse 13
 * removed budgets entirely: there is no `performance-budget` audit, no
 * budget file in `core/audits/`, and `--budget-path` is accepted and
 * silently ignored. The `resource-summary` audit still reports per-type
 * transfer sizes and request counts, which is what these checks read.
 */

/** One assertion failure, rendered by the script as a FAIL line. */
export interface Violation {
	/** what was checked, e.g. `/about [mobile] seo` */
	subject: string;
	/** the specific overage or shortfall */
	message: string;
}

/** `resource-summary` rows, keyed by resourceType. */
export type ResourceSummary = Record<
	string,
	{ transferSize: number; requestCount: number }
>;

/** Per-file sizes pulled from `network-requests`, keyed by normalised name. */
export type AssetSizes = Record<
	string,
	{ transferSize: number; resourceSize: number; resourceType: string }
>;

const KIB = 1024;

/**
 * Map a built HTML file, relative to `dist/`, onto the URL path that serves
 * it. Astro emits directory-style pages (`about/index.html`) plus a
 * top-level `404.html`, which has no pretty URL and is requested as-is.
 */
export function htmlFileToUrl(relPath: string): string {
	const p = relPath.replaceAll("\\", "/");
	if (p === "index.html") return "/";
	if (p.endsWith("/index.html")) return `/${p.slice(0, -"/index.html".length)}`;
	return `/${p}`;
}

/**
 * Strip the origin and Astro's content hash from an asset URL so the same
 * logical file compares equal across builds. Without this every asset reads
 * as removed-plus-added in a diff, because any content change rewrites the
 * hash (`newsreader-latin-opsz-normal.DQOr0nmD.woff2`).
 */
export function normalizeAssetUrl(url: string): string {
	let path: string;
	try {
		path = new URL(url).pathname;
	} catch {
		path = url;
	}
	return path.replace(
		/\.[A-Za-z0-9_-]{8}\.(woff2|woff|css|js|svg|png|jpg|jpeg|webp|avif)$/,
		".$1",
	);
}

/** Category scores below their threshold. */
export function checkCategories(
	subject: string,
	scores: Record<string, number | null>,
	thresholds: Record<string, number>,
): Violation[] {
	const violations: Violation[] = [];
	for (const [category, min] of Object.entries(thresholds)) {
		const score = scores[category];
		if (score === null || score === undefined) {
			violations.push({
				subject: `${subject} ${category}`,
				message: `no score reported - the category did not run`,
			});
			continue;
		}
		if (score < min) {
			violations.push({
				subject: `${subject} ${category}`,
				message: `scored ${score.toFixed(2)}, below the ${min.toFixed(2)} threshold`,
			});
		}
	}
	return violations;
}

/**
 * Individual audits asserted to hold a specific score. Used for the `/404.html`
 * `noindex`: rather than only relaxing that page's SEO threshold, assert the
 * `is-crawlable` failure is still there, so the `noindex` cannot silently
 * disappear.
 */
export function checkExpectedAudits(
	subject: string,
	auditScores: Record<string, number | null>,
	expected: Record<string, number>,
): Violation[] {
	const violations: Violation[] = [];
	for (const [id, want] of Object.entries(expected)) {
		const got = auditScores[id];
		if (got === want) continue;
		violations.push({
			subject: `${subject} ${id}`,
			message: `scored ${got === null || got === undefined ? "n/a" : got} but ${want} is expected here`,
		});
	}
	return violations;
}

/**
 * Override keys that match no audited page.
 *
 * A per-page exception outliving its page is silent otherwise: the page is
 * gone or renamed, so nothing consults the entry, and it sits in config
 * looking authoritative while describing something that no longer exists.
 * The same reasoning as pairing the `/404.html` SEO exception with a
 * positive `is-crawlable` assertion, an exception should never quietly stop
 * meaning anything.
 */
export function checkUnusedOverrides(
	overrideKeys: string[],
	auditedUrls: string[],
): Violation[] {
	const audited = new Set(auditedUrls);
	return overrideKeys
		.filter((key) => !audited.has(key))
		.map((key) => ({
			subject: `URL_OVERRIDES["${key}"]`,
			message:
				"no page at this URL was audited - the entry is stale (renamed or removed page?); fix the key or delete it",
		}));
}

/**
 * A budgeted resource type that `resource-summary` never reported.
 *
 * Absent is not the same as zero, and treating it as zero would fail open:
 * the budget would pass unconditionally and forever. Lighthouse emits a
 * fixed set of nine resource types on every page, zeros included, so a page
 * with no images reports `image: 0` rather than omitting it. Absent
 * therefore means a typo in the budget keys, or a Lighthouse release that
 * changed the audit's shape - both of which should be loud, since both
 * otherwise leave the gate asserting nothing while reporting clean.
 */
function missingType(subject: string, resourceType: string): Violation {
	return {
		subject: `${subject} ${resourceType}`,
		message:
			"resource-summary reported no such type - a budget key typo, or the audit shape changed; either way this budget is asserting nothing",
	};
}

/** Transfer sizes over budget, plus any request-count ceilings. */
export function checkBudgets(
	subject: string,
	summary: ResourceSummary,
	sizeBudgetsKib: Record<string, number>,
	countBudgets: Record<string, number> = {},
): Violation[] {
	const violations: Violation[] = [];
	for (const [resourceType, budgetKib] of Object.entries(sizeBudgetsKib)) {
		const entry = summary[resourceType];
		if (entry === undefined) {
			violations.push(missingType(subject, resourceType));
			continue;
		}
		const budget = budgetKib * KIB;
		if (entry.transferSize > budget) {
			violations.push({
				subject: `${subject} ${resourceType} bytes`,
				message: `${formatKib(entry.transferSize)} over a ${budgetKib} KiB budget (+${formatKib(entry.transferSize - budget)})`,
			});
		}
	}
	for (const [resourceType, maxCount] of Object.entries(countBudgets)) {
		const entry = summary[resourceType];
		if (entry === undefined) {
			violations.push(missingType(subject, resourceType));
			continue;
		}
		if (entry.requestCount > maxCount) {
			violations.push({
				subject: `${subject} ${resourceType} requests`,
				message: `${entry.requestCount} requests, budget is ${maxCount}`,
			});
		}
	}
	return violations;
}

export function formatKib(bytes: number): string {
	return `${(bytes / KIB).toFixed(1)} KiB`;
}

/**
 * Signed size change. Sub-KiB deltas render in bytes: rewriting a hashed
 * asset reference shifts a document by a few bytes, and rounding that to
 * "+0.0 KiB" reads as a change too small to have a size, rather than one
 * too small to matter.
 */
export function formatKibDelta(bytes: number): string {
	const sign = bytes > 0 ? "+" : bytes < 0 ? "-" : "";
	const magnitude = Math.abs(bytes);
	return magnitude < KIB
		? `${sign}${magnitude} B`
		: `${sign}${(magnitude / KIB).toFixed(1)} KiB`;
}

export interface AssetDelta {
	name: string;
	status: "added" | "removed" | "changed";
	before: number;
	after: number;
	delta: number;
}

/**
 * Per-file transfer-size changes between two snapshots, largest absolute
 * change first. Unchanged files are dropped; the caller reports the total.
 */
export function diffAssets(
	before: AssetSizes,
	after: AssetSizes,
): AssetDelta[] {
	const names = new Set([...Object.keys(before), ...Object.keys(after)]);
	const deltas: AssetDelta[] = [];
	for (const name of names) {
		const b = before[name]?.transferSize ?? 0;
		const a = after[name]?.transferSize ?? 0;
		if (b === a) continue;
		deltas.push({
			name,
			status: !(name in before)
				? "added"
				: !(name in after)
					? "removed"
					: "changed",
			before: b,
			after: a,
			delta: a - b,
		});
	}
	return deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/**
 * How many Lighthouse runs to have in flight at once.
 *
 * Safe to parallelise at all because nothing the gate asserts on is
 * timing-sensitive: accessibility, SEO and best-practices are DOM-based, and
 * transfer bytes are fixed. Contention only adds noise to the performance
 * score, which is printed and never asserted.
 *
 * Floored at 2 because even the 2-core runner gains (a single run does not
 * saturate both cores, and each invocation spends 1-2s launching Chrome).
 * Capped at 4 because past that the runs contend for CPU more than they
 * overlap, and every concurrent Chrome costs a few hundred MB.
 */
export function lighthouseConcurrency(cpuCount: number): number {
	return Math.max(2, Math.min(4, cpuCount));
}

/**
 * Run `fn` over `items` with at most `limit` in flight, returning results in
 * INPUT order regardless of completion order. The ordering matters: it is
 * what keeps the gate's output a stable, diffable table once the runs stop
 * being sequential.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, items.length)) },
		async () => {
			while (true) {
				const index = next++;
				if (index >= items.length) return;
				results[index] = await fn(items[index], index);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

/**
 * Median of a sample. Compare mode runs each page several times because the
 * metrics it reports (LCP, CLS) are the nondeterministic ones; the gate runs
 * once because nothing it asserts on varies between runs.
 */
export function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}
