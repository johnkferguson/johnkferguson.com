#!/usr/bin/env bun
/**
 * Lighthouse gate and before/after tool for the built site.
 *
 * Runs over every page in `dist/`, under both the mobile and desktop
 * presets, and has three modes:
 *
 *   bun run lighthouse                   gate: assert and exit 1 on failure
 *   bun run lighthouse --save [label]    record a snapshot to .lighthouse/
 *   bun run lighthouse --compare [label] re-run and diff against a snapshot
 *
 * `--runs N` overrides how many times each page is audited (default 3 for
 * save and compare, 1 for the gate). It is a save/compare knob: the gate
 * asserts on nothing that varies between runs, so raising it there is
 * multiplied runtime for an identical result. The useful direction is
 * usually down - `--compare --runs 1` gives the per-file byte deltas, which
 * are deterministic anyway, in a third of the time.
 *
 * Gate mode is what CI runs. Compare mode is the local workflow for asset
 * work: snapshot, change a font or a stylesheet, rebuild, compare, and read
 * the per-file byte delta.
 *
 * Why both presets. Lighthouse defaults to mobile (Moto G Power, 4x CPU
 * throttle, simulated slow 4G), which is the stricter view, and transfer
 * bytes are identical under both - so budgets run on mobile alone. The
 * reason desktop runs at all is that some audits only exist there: the TOC
 * rail is desktop-only DOM (>= 1020px), so `list` and `listitem` score on
 * desktop and are not applicable on mobile. A mobile-only run cannot see
 * desktop markup at all.
 *
 * Why one run in gate mode and several in compare mode. The LHCI convention
 * of a median over three runs exists to stabilise the performance score.
 * Nothing gated here is nondeterministic - category scores and transfer
 * bytes are identical run to run - so gate mode runs once. Compare mode
 * reports LCP and CLS, which do vary, so it takes a median.
 *
 * That same determinism is why the audits run concurrently rather than one
 * after another, and why the results are printed in task order once they all
 * land instead of streaming as they finish.
 *
 * The performance score is printed but never asserted on. A warn-only gate
 * is noise nobody reads; the byte budgets are the real performance gate.
 * For reference when someone does read it: every page scores 0 on
 * `render-blocking-insight` and `network-dependency-tree-insight`, from the
 * fonts and CSS in `<head>`. That is the standing baseline, not a
 * regression.
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import {
	type AssetSizes,
	type ResourceSummary,
	type Violation,
	checkBudgets,
	checkCategories,
	checkExpectedAudits,
	checkUnusedOverrides,
	diffAssets,
	formatKib,
	formatKibDelta,
	htmlFileToUrl,
	lighthouseConcurrency,
	mapWithConcurrency,
	median,
	normalizeAssetUrl,
} from "../src/lib/lighthouse-budget";

/* ------------------------------------------------------------------ *
 * CONFIG
 *
 * Thresholds and budgets live here with their reasoning, the way the
 * accepted-advisory list lives in scripts/audit.sh, so the numbers and
 * the argument for them cannot drift apart.
 * ------------------------------------------------------------------ */

const HOST = "127.0.0.1";
const PORT = 4399;
const DIST = "dist";
const SNAPSHOT_DIR = ".lighthouse";
const REPORT_DIR = join(SNAPSHOT_DIR, "reports");
const PRESETS = ["mobile", "desktop"] as const;

/**
 * Deterministic categories only. All four pages score 1.00 on every one of
 * these today, so 0.95 is headroom rather than a target being scraped.
 */
const CATEGORY_THRESHOLDS: Record<string, number> = {
	accessibility: 0.95,
	"best-practices": 0.95,
	seo: 0.95,
};

/**
 * Transfer-size ceilings in KiB, asserted on the mobile run only (desktop
 * transfers the identical bytes). Sized over today's heaviest page
 * (/refactoring-with-love: 183 KiB total, 7 KiB script, 139 KiB font) with
 * room to grow, while still catching an island that quietly pulls in a
 * dependency or an art asset that ships unoptimised.
 *
 * A page that legitimately needs more gets an entry in URL_OVERRIDES rather
 * than a raise here. Snapshot Fees will need one when it publishes: four
 * Preact islands, KaTeX CSS and its font files, and SVG art do not fit
 * these numbers, and that negotiation is the point of having them.
 */
const SIZE_BUDGETS_KIB: Record<string, number> = {
	total: 250,
	script: 30,
	stylesheet: 30,
	font: 160,
	image: 100,
};

/** The site ships no third-party requests. Keep it that way. */
const COUNT_BUDGETS: Record<string, number> = { "third-party": 0 };

/**
 * Individual audits every page must hold, asserted directly rather than
 * through the performance score they feed.
 *
 * Kept to two on purpose. The byte budgets already cover the ground that
 * `unused-*`, `unminified-*` and `total-byte-weight` describe, and cover it
 * better by asserting real bytes rather than a heuristic's opinion of them.
 * These two cover what the budgets cannot see:
 *
 * - legacy-javascript-insight: transpiled-down or polyfilled output is
 *   invisible to a byte budget until it is large enough to breach one. A
 *   live risk once the Preact islands arrive.
 * - image-delivery-insight: trivially passing at zero images today, which
 *   makes it a tripwire for the generated art rather than a restatement of
 *   the image budget.
 *
 * Note these are v13 audit ids. `uses-text-compression` and
 * `modern-image-formats` no longer exist (folded into
 * `document-latency-insight` and `image-delivery-insight`), and adding them
 * by name would assert nothing at all.
 */
const EXPECTED_AUDITS: Record<string, number> = {
	"legacy-javascript-insight": 1,
	"image-delivery-insight": 1,
};

interface UrlOverride {
	categories?: Record<string, number>;
	sizeBudgetsKib?: Record<string, number>;
	countBudgets?: Record<string, number>;
	/** audit id -> the score that page is expected to hold */
	expectedAudits?: Record<string, number>;
}

const URL_OVERRIDES: Record<string, UrlOverride> = {
	/*
	 * The 404 page is deliberately noindex, which fails `is-crawlable` and
	 * drags the SEO category to 0.66. Lowering the threshold alone would
	 * mean nobody notices if the noindex ever disappears, so the exception
	 * is paired with a positive assertion that it is still failing.
	 */
	"/404": {
		categories: { seo: 0.6 },
		expectedAudits: { "is-crawlable": 0 },
	},
	/*
	 * The first page to want italic prose and math on the same page, which is
	 * what the font number is: Newsreader normal and italic are 196 KiB
	 * between them, so a 160 KiB ceiling is unreachable here whatever KaTeX
	 * does. KaTeX's five faces add 59 KiB on top (Main-Regular, Math-Italic,
	 * and three Size faces), and Fira Code 400 the last 23.
	 *
	 * Measured at 278 KiB font / 368 KiB total. The ceilings sit a little
	 * over that: enough that a run does not flake, tight enough that another
	 * font face or a fifth island still trips them.
	 *
	 * Both should come down rather than stay here. Subsetting the KaTeX faces
	 * to the glyphs this post actually sets is issue #23, and would take the
	 * font figure back under 240.
	 */
	"/snapshot-fees": {
		sizeBudgetsKib: { font: 290, total: 385 },
	},
};

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

type Preset = (typeof PRESETS)[number];

interface PageResult {
	categories: Record<string, number | null>;
	auditScores: Record<string, number | null>;
	resourceSummary: ResourceSummary;
	assets: AssetSizes;
	metrics: Record<string, number>;
}

type Snapshot = {
	label: string;
	createdAt: string;
	runs: number;
	pages: Record<string, Partial<Record<Preset, PageResult>>>;
};

const METRIC_KEYS = [
	"firstContentfulPaint",
	"largestContentfulPaint",
	"cumulativeLayoutShift",
	"totalBlockingTime",
] as const;

/* ------------------------------------------------------------------ *
 * Discovery and server
 * ------------------------------------------------------------------ */

function discoverUrls(): string[] {
	if (!existsSync(DIST)) {
		throw new Error(`${DIST}/ not found - run \`bun run build\` first`);
	}
	const urls = readdirSync(DIST, { recursive: true })
		.map(String)
		.filter((f) => f.endsWith(".html"))
		.map(htmlFileToUrl)
		.sort();
	if (urls.length === 0) throw new Error(`no HTML pages found in ${DIST}/`);
	return urls;
}

/**
 * Every child this script spawns, so one cleanup path can end all of them.
 * The `finally` in main() covers exceptions; the signal handlers cover a
 * SIGINT or SIGTERM that reaches only this process (an editor stop button,
 * a targeted kill). An interactive Ctrl-C needs neither, since it signals
 * the whole process group and the children exit on their own.
 */
const audits = new Set<Bun.Subprocess>();
let previewProc: Bun.Subprocess | null = null;

function cleanup(): void {
	/* Audits first: killing the server out from under a live audit just
	 * makes it spend its own timeout failing on connection-refused. */
	for (const proc of audits) proc.kill();
	audits.clear();
	previewProc?.kill();
	previewProc = null;
}

/**
 * Start `astro preview` and return the port it actually bound.
 *
 * Reading the port back rather than assuming it is the point of this
 * function. `astro preview` does not fail on a taken port, it increments
 * ("Port 4399 is in use, trying another one..." then binds 4400). Polling
 * the port we *asked* for would then succeed against whatever else is
 * holding it, and the whole run would audit that instead - silently, and
 * most plausibly against a preview leaked from an interrupted earlier run
 * still serving a stale dist/.
 *
 * `--host 127.0.0.1` is equally deliberate: preview otherwise binds IPv6
 * only, so 127.0.0.1 is refused and connectivity comes down to how
 * `localhost` happens to resolve, for this poll and for Chrome alike.
 */
async function startServer(): Promise<{ port: number; stop: () => void }> {
	/* Piped rather than ignored so a startup failure reports astro's actual
	 * message instead of a 30-second timeout. Safe to leave undrained:
	 * preview emits three lines and does not log requests, so the pipe
	 * cannot fill and block the server mid-run. */
	const proc = Bun.spawn(
		["bunx", "astro", "preview", "--host", HOST, "--port", String(PORT)],
		{ stdout: "pipe", stderr: "pipe" },
	);
	previewProc = proc;

	/* Drained continuously in the background rather than read inside the
	 * poll loop. Racing a `reader.read()` against a timeout discards the
	 * pending read along with whatever it later resolves to, so the port
	 * line is lost and startup always times out. */
	let output = "";
	const drain = async (stream: ReadableStream<Uint8Array>) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) {
			output += decoder.decode(chunk, { stream: true });
		}
	};
	void drain(proc.stdout as ReadableStream<Uint8Array>).catch(() => {});
	void drain(proc.stderr as ReadableStream<Uint8Array>).catch(() => {});

	const deadline = Date.now() + 30_000;
	let exited = false;
	void proc.exited.then(() => {
		exited = true;
	});

	const fail = (reason: string): never => {
		cleanup();
		throw new Error(
			`astro preview ${reason}\n--- preview output ---\n${output.trim() || "(no output)"}`,
		);
	};

	while (Date.now() < deadline) {
		await Bun.sleep(100);
		const match = output.match(/http:\/\/[^\s/]+:(\d+)\//);
		if (match) {
			const port = Number(match[1]);
			/* The banner can in principle print a beat before the socket
			 * accepts, so confirm on the port it actually reported. */
			for (let i = 0; i < 40; i++) {
				try {
					const res = await fetch(`http://${HOST}:${port}/`, {
						signal: AbortSignal.timeout(1000),
					});
					if (res.ok) {
						if (port !== PORT) {
							console.log(
								`  note: port ${PORT} was busy, preview bound ${port}\n`,
							);
						}
						return { port, stop: cleanup };
					}
				} catch {
					/* not accepting yet */
				}
				await Bun.sleep(250);
			}
			return fail(`reported port ${port} but never answered there`);
		}

		/* Exiting before printing a port means it failed outright: a config
		 * or plugin error, or bunx failing to resolve astro. Reporting that
		 * immediately beats waiting out the deadline for a message we
		 * already have. */
		if (exited) return fail("exited during startup");
	}
	return fail("did not report a port within 30s");
}

/* ------------------------------------------------------------------ *
 * Lighthouse
 * ------------------------------------------------------------------ */

async function runLighthouse(
	url: string,
	preset: Preset,
	port: number,
): Promise<PageResult> {
	/* Reports are kept rather than consumed and deleted: a category
	 * assertion that fails names the category, not the element behind it,
	 * and the full report is what makes that diagnosable. CI uploads this
	 * directory when the gate fails. Paths are deterministic, so repeated
	 * runs overwrite instead of accumulating.
	 *
	 * This naming assumes a flat, underscore-free URL space: `/a/b` and
	 * `/a_b` would collide. Posts live at `/{slug}` with kebab-case slugs,
	 * so that is unreachable today; revisit if nested routes appear. */
	const slug = url === "/" ? "root" : url.replaceAll("/", "_");
	const out = join(REPORT_DIR, `${preset}-${slug}.json`);
	const args = [
		"lighthouse",
		`http://${HOST}:${port}${url}`,
		"--quiet",
		"--output=json",
		`--output-path=${out}`,
		/* --no-sandbox: the runner image restricts unprivileged user
		 * namespaces, which Chrome's sandbox needs. Left unconditional
		 * rather than scoped to CI so the browser is invoked identically in
		 * both places - that parity is why local verification predicts CI.
		 * The sandbox guards against hostile page content, and we only ever
		 * load our own dist/ over loopback, with a third-party budget of 0. */
		"--chrome-flags=--headless=new --no-sandbox --disable-gpu",
	];
	if (preset === "desktop") args.push("--preset=desktop");

	const proc = Bun.spawn(["bunx", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	audits.add(proc);
	const code = await proc.exited;
	audits.delete(proc);
	if (code !== 0) {
		const err = await new Response(proc.stderr).text();
		throw new Error(`lighthouse failed on ${url} [${preset}]:\n${err}`);
	}

	return extract(await Bun.file(out).json());
}

function extract(report: {
	categories: Record<string, { score: number | null }>;
	audits: Record<string, { score: number | null; details?: unknown }>;
}): PageResult {
	const categories: Record<string, number | null> = {};
	for (const [id, c] of Object.entries(report.categories)) {
		categories[id] = c.score;
	}

	const auditScores: Record<string, number | null> = {};
	for (const [id, a] of Object.entries(report.audits)) auditScores[id] = a.score;

	const resourceSummary: ResourceSummary = {};
	const summaryItems =
		(
			report.audits["resource-summary"]?.details as
				| { items?: { resourceType: string; transferSize: number; requestCount: number }[] }
				| undefined
		)?.items ?? [];
	for (const item of summaryItems) {
		resourceSummary[item.resourceType] = {
			transferSize: item.transferSize,
			requestCount: item.requestCount,
		};
	}

	const assets: AssetSizes = {};
	const requests =
		(
			report.audits["network-requests"]?.details as
				| {
						items?: {
							url: string;
							transferSize: number;
							resourceSize: number;
							resourceType?: string;
						}[];
				  }
				| undefined
		)?.items ?? [];
	for (const r of requests) {
		assets[normalizeAssetUrl(r.url)] = {
			transferSize: r.transferSize ?? 0,
			resourceSize: r.resourceSize ?? 0,
			resourceType: r.resourceType ?? "Other",
		};
	}

	const metricItem =
		(
			report.audits.metrics?.details as
				| { items?: Record<string, number>[] }
				| undefined
		)?.items?.[0] ?? {};
	const metrics: Record<string, number> = {};
	for (const k of METRIC_KEYS) metrics[k] = metricItem[k] ?? Number.NaN;

	return { categories, auditScores, resourceSummary, assets, metrics };
}

/** Several runs, keeping the median of each metric. Everything else is
 * deterministic, so the last run's values stand. */
async function runLighthouseMedian(
	url: string,
	preset: Preset,
	runs: number,
	port: number,
): Promise<PageResult> {
	const results: PageResult[] = [];
	for (let i = 0; i < runs; i++)
		results.push(await runLighthouse(url, preset, port));
	const last = results[results.length - 1];
	const metrics: Record<string, number> = {};
	for (const k of METRIC_KEYS) {
		metrics[k] = median(
			results.map((r) => r.metrics[k]).filter((n) => !Number.isNaN(n)),
		);
	}
	return { ...last, metrics };
}

/* ------------------------------------------------------------------ *
 * Collection
 * ------------------------------------------------------------------ */

async function collect(
	urls: string[],
	runs: number,
	port: number,
): Promise<Snapshot["pages"]> {
	/* Page x preset is one flat work list so both dimensions parallelise.
	 * The `runs` within a single audit stay sequential on purpose: they exist
	 * to median out metric noise, and overlapping them would feed contention
	 * into the very numbers being medianed. */
	const tasks = urls.flatMap((url) =>
		PRESETS.map((preset) => ({ url, preset })),
	);
	const limit = lighthouseConcurrency(cpus().length);
	console.log(`  ${tasks.length} audits, ${limit} at a time\n`);

	const results = await mapWithConcurrency(tasks, limit, (task) =>
		runLighthouseMedian(task.url, task.preset, runs, port),
	);

	const pages: Snapshot["pages"] = {};
	tasks.forEach((task, i) => {
		(pages[task.url] ??= {})[task.preset] = results[i];
	});

	/* Printed after the fact, in task order rather than completion order, so
	 * the log stays a stable table instead of interleaving. */
	for (const { url, preset } of tasks) {
		const result = pages[url][preset];
		if (!result) continue;
		const score = (id: string) =>
			(result.categories[id] ?? Number.NaN).toFixed(2);
		console.log(
			`  ${preset.padEnd(8)} ${url.padEnd(24)} perf ${score("performance")}  a11y ${score("accessibility")}  bp ${score("best-practices")}  seo ${score("seo")}  ${formatKib(
				result.resourceSummary.total?.transferSize ?? 0,
			)}`,
		);
	}
	return pages;
}

/* ------------------------------------------------------------------ *
 * Modes
 * ------------------------------------------------------------------ */

function gate(pages: Snapshot["pages"]): number {
	const violations: Violation[] = [
		...checkUnusedOverrides(Object.keys(URL_OVERRIDES), Object.keys(pages)),
	];

	for (const [url, byPreset] of Object.entries(pages)) {
		const override = URL_OVERRIDES[url] ?? {};
		const thresholds = { ...CATEGORY_THRESHOLDS, ...override.categories };

		for (const preset of PRESETS) {
			const result = byPreset[preset];
			if (!result) continue;
			const subject = `${url} [${preset}]`;
			violations.push(
				...checkCategories(subject, result.categories, thresholds),
				...checkExpectedAudits(subject, result.auditScores, {
					...EXPECTED_AUDITS,
					...override.expectedAudits,
				}),
			);
		}

		/* Budgets on mobile alone - desktop transfers identical bytes. */
		const mobile = byPreset.mobile;
		if (mobile) {
			violations.push(
				...checkBudgets(
					url,
					mobile.resourceSummary,
					{ ...SIZE_BUDGETS_KIB, ...override.sizeBudgetsKib },
					{ ...COUNT_BUDGETS, ...override.countBudgets },
				),
			);
		}
	}

	console.log("");
	for (const v of violations) {
		console.log(`FAIL   ${v.subject}\n       ${v.message}`);
	}
	const pageCount = Object.keys(pages).length;
	if (violations.length > 0) {
		console.log(
			`\nlighthouse gate: ${violations.length} failing across ${pageCount} pages`,
		);
		return 1;
	}
	console.log(
		`\nlighthouse gate: clean (${pageCount} pages, ${PRESETS.join(" + ")})`,
	);
	return 0;
}

function snapshotPath(label: string): string {
	return join(SNAPSHOT_DIR, `${label}.json`);
}

async function save(
	label: string,
	pages: Snapshot["pages"],
	runs: number,
): Promise<void> {
	const snapshot: Snapshot = {
		label,
		createdAt: new Date().toISOString(),
		runs,
		pages,
	};
	await Bun.write(snapshotPath(label), `${JSON.stringify(snapshot, null, 2)}\n`);
	console.log(`\nsaved snapshot "${label}" to ${snapshotPath(label)}`);
}

async function compare(label: string, pages: Snapshot["pages"]): Promise<void> {
	const path = snapshotPath(label);
	if (!existsSync(path)) {
		throw new Error(
			`no snapshot "${label}" at ${path} - record one with \`bun run lighthouse --save ${label}\` first`,
		);
	}
	const before: Snapshot = await Bun.file(path).json();
	console.log(`\ncompared against "${before.label}" (${before.createdAt})\n`);

	for (const [url, byPreset] of Object.entries(pages)) {
		const beforePage = before.pages[url];
		if (!beforePage) {
			console.log(`${url}\n  NEW PAGE - not in the snapshot\n`);
			continue;
		}
		console.log(url);

		/* Per-file bytes are preset-independent, so report them once. */
		const a = beforePage.mobile;
		const b = byPreset.mobile;
		if (a && b) {
			const deltas = diffAssets(a.assets, b.assets);
			if (deltas.length === 0) {
				console.log("  bytes    unchanged");
			} else {
				for (const d of deltas) {
					const detail =
						d.status === "changed"
							? `${formatKib(d.before)} -> ${formatKib(d.after)}`
							: d.status === "added"
								? `new, ${formatKib(d.after)}`
								: `gone, was ${formatKib(d.before)}`;
					console.log(
						`  ${formatKibDelta(d.delta).padStart(12)}  ${d.name}  (${detail})`,
					);
				}
				const total =
					(b.resourceSummary.total?.transferSize ?? 0) -
					(a.resourceSummary.total?.transferSize ?? 0);
				console.log(`  ${formatKibDelta(total).padStart(12)}  TOTAL`);
			}
		}

		for (const preset of PRESETS) {
			const prev = beforePage[preset];
			const next = byPreset[preset];
			if (!prev || !next) continue;
			const changed = Object.keys(next.categories).filter(
				(k) => next.categories[k] !== prev.categories[k],
			);
			for (const k of changed) {
				console.log(
					`  ${preset} ${k}: ${prev.categories[k]} -> ${next.categories[k]}`,
				);
			}
		}

		/* Metrics move run to run even with a median; read them as a
		 * direction, not a measurement. */
		const prevM = beforePage.mobile?.metrics;
		const nextM = byPreset.mobile?.metrics;
		if (prevM && nextM) {
			const parts = METRIC_KEYS.map((k) => {
				const d = nextM[k] - prevM[k];
				const unit = k === "cumulativeLayoutShift" ? "" : "ms";
				return `${k} ${d > 0 ? "+" : ""}${unit === "" ? d.toFixed(3) : Math.round(d)}${unit}`;
			});
			console.log(`  mobile metrics (noisy): ${parts.join(", ")}`);
		}
		console.log("");
	}
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function argValue(flag: string, fallback: string): string {
	const argv = process.argv.slice(2);
	const i = argv.indexOf(flag);
	if (i === -1) {
		const inline = argv.find((a) => a.startsWith(`${flag}=`));
		return inline ? inline.slice(flag.length + 1) : fallback;
	}
	const next = argv[i + 1];
	return next && !next.startsWith("--") ? next : fallback;
}

async function main() {
	const argv = process.argv.slice(2);
	const saving = argv.some((a) => a === "--save" || a.startsWith("--save="));
	const comparing = argv.some(
		(a) => a === "--compare" || a.startsWith("--compare="),
	);
	if (saving && comparing) {
		throw new Error("--save and --compare are mutually exclusive");
	}

	/* Metrics are the only thing that varies, so only the modes that
	 * report them pay for extra runs. */
	const defaultRuns = comparing || saving ? 3 : 1;
	const runs = Number(argValue("--runs", String(defaultRuns)));
	if (!Number.isInteger(runs) || runs < 1) {
		throw new Error(`--runs must be a positive integer, got "${runs}"`);
	}

	/* Cleared rather than merged into: an interrupted run leaves truncated
	 * reports behind, and a stale one sitting next to fresh ones reads as
	 * authoritative when someone opens this directory to diagnose a
	 * failure. */
	rmSync(REPORT_DIR, { recursive: true, force: true });
	mkdirSync(REPORT_DIR, { recursive: true });

	const urls = discoverUrls();
	console.log(
		`lighthouse: ${urls.length} pages x ${PRESETS.length} presets x ${runs} run${runs === 1 ? "" : "s"}\n`,
	);

	const server = await startServer();
	/* The finally below covers exceptions; these cover a signal that reaches
	 * only this process. Registered after startServer so a failure in there
	 * has already cleaned up after itself. */
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => {
			cleanup();
			process.exit(130);
		});
	}

	let pages: Snapshot["pages"];
	try {
		pages = await collect(urls, runs, server.port);
	} finally {
		server.stop();
	}

	if (saving) {
		await save(argValue("--save", "baseline"), pages, runs);
		return;
	}
	if (comparing) {
		await compare(argValue("--compare", "baseline"), pages);
		return;
	}
	process.exitCode = gate(pages);
}

await main();
