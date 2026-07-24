#!/usr/bin/env bun
/**
 * Cooldown-aware audit gate. Reads `bun audit --json` from stdin and
 * decides what actually fails CI, keeping the audit aligned with
 * bunfig's minimumReleaseAge instead of fighting it:
 *
 * - An advisory whose fix is already installable (an in-range version
 *   outside the vulnerable range, older than the cooldown window)
 *   FAILS - it is actionable right now.
 * - An advisory whose only in-range fix is still younger than the
 *   window is WAIVED with the date it becomes actionable. The waiver
 *   expires by itself: once the fix ages past the window, this gate
 *   starts failing until someone re-resolves the package.
 * - An advisory with no in-range fix at all FAILS - that needs a human
 *   decision (documented ignore in audit.sh, or an override).
 * - CRITICAL advisories are never waived: in that case the cooldown is
 *   the thing to bypass (bunfig minimumReleaseAgeExcludes), not the
 *   audit.
 *
 * Severities below high never gate (parity with --audit-level=high);
 * they are printed as info.
 *
 * Permanent, exposure-justified ignores stay in audit.sh and arrive
 * here as --ignore=GHSA-... args.
 */

import { readFileSync } from "node:fs";

interface Advisory {
	id: number;
	url: string;
	title: string;
	severity: string;
	vulnerable_versions: string;
}

interface RegistryDoc {
	versions: Record<string, unknown>;
	time: Record<string, string>;
}

const WINDOW_ARG = process.argv.find((a) => a.startsWith("--window="));
const IGNORED = new Set(
	process.argv
		.filter((a) => a.startsWith("--ignore="))
		.map((a) => a.slice("--ignore=".length)),
);

function cooldownSeconds(): number {
	if (WINDOW_ARG) return Number(WINDOW_ARG.slice("--window=".length));
	const bunfig = readFileSync("bunfig.toml", "utf8");
	const m = bunfig.match(/^\s*minimumReleaseAge\s*=\s*(\d+)/m);
	if (!m) throw new Error("bunfig.toml: minimumReleaseAge not found");
	return Number(m[1]);
}

const LOCK = readFileSync("bun.lock", "utf8");

/** every version of `name` resolved in the lockfile */
function installedVersions(name: string): string[] {
	const re = new RegExp(
		`\\["${name.replaceAll("/", "\\/")}@([^"]+)"`,
		"g",
	);
	return [...new Set([...LOCK.matchAll(re)].map((m) => m[1]))];
}

/** every range the tree declares on `name` (root package.json included
 * via the lockfile's workspace stanza) */
function declaredRanges(name: string): string[] {
	const re = new RegExp(`"${name.replaceAll("/", "\\/")}":\\s*"([^"]+)"`, "g");
	return [...new Set([...LOCK.matchAll(re)].map((m) => m[1]))].filter(
		(r) => !/^(workspace:|file:|link:|git|http)/.test(r),
	);
}

const ghsa = (adv: Advisory) => adv.url.split("/").pop() ?? String(adv.id);

async function main() {
	const raw = await Bun.stdin.text();
	const report: Record<string, Advisory[]> = raw.trim()
		? JSON.parse(raw)
		: {};
	const windowSec = cooldownSeconds();
	const now = Date.now();

	let failures = 0;
	let waived = 0;

	for (const [pkg, advisories] of Object.entries(report)) {
		/* registry doc fetched once per package; `time` has publish dates */
		let registry: RegistryDoc | null = null;

		for (const adv of advisories) {
			const id = ghsa(adv);
			if (IGNORED.has(id)) continue;
			const label = `${pkg} ${id} (${adv.severity}): ${adv.title}`;
			if (adv.severity !== "high" && adv.severity !== "critical") {
				console.log(`INFO   ${label}`);
				continue;
			}

			const vulnerable = installedVersions(pkg).filter((v) =>
				Bun.semver.satisfies(v, adv.vulnerable_versions),
			);
			if (vulnerable.length === 0) continue;

			if (!registry) {
				const res = await fetch(`https://registry.npmjs.org/${pkg}`);
				if (!res.ok)
					throw new Error(`registry fetch failed for ${pkg}: ${res.status}`);
				registry = (await res.json()) as RegistryDoc;
			}
			const allVersions = Object.keys(registry.versions);
			const ranges = declaredRanges(pkg);

			/* a usable fix must clear this advisory, satisfy every range
			 * currently binding a vulnerable resolution, and not be a
			 * downgrade of it */
			for (const cur of vulnerable) {
				const constraints = ranges.filter((r) =>
					Bun.semver.satisfies(cur, r),
				);
				const fixes = allVersions.filter(
					(v) =>
						!v.includes("-") &&
						Bun.semver.order(v, cur) > 0 &&
						!Bun.semver.satisfies(v, adv.vulnerable_versions) &&
						constraints.every((r) => Bun.semver.satisfies(v, r)),
				);
				if (fixes.length === 0) {
					failures++;
					console.log(
						`FAIL   ${label}\n       installed ${cur}; no in-range fix exists - decide: documented ignore in audit.sh, or an override`,
					);
					continue;
				}
				const ages = fixes.map((v) => ({
					v,
					published: Date.parse(registry?.time[v] ?? ""),
				}));
				const eligible = ages.filter(
					(f) => now - f.published >= windowSec * 1000,
				);
				if (eligible.length > 0) {
					failures++;
					console.log(
						`FAIL   ${label}\n       installed ${cur}; fix ${eligible[0].v} is outside the cooldown window - re-resolve it (delete its bun.lock entry, bun install)`,
					);
					continue;
				}
				if (adv.severity === "critical") {
					failures++;
					console.log(
						`FAIL   ${label}\n       installed ${cur}; fix ${ages[0].v} is inside the cooldown window, but critical advisories are never waived - consider minimumReleaseAgeExcludes`,
					);
					continue;
				}
				const soonest = ages
					.map((f) => f.published + windowSec * 1000)
					.sort((a, b) => a - b)[0];
				waived++;
				console.log(
					`WAIVE  ${label}\n       installed ${cur}; fix ${ages[0].v} is inside the cooldown window - actionable ${new Date(soonest).toISOString().slice(0, 10)}, when this gate starts failing`,
				);
			}
		}
	}

	if (failures > 0) {
		console.log(`\naudit gate: ${failures} failing, ${waived} waived`);
		process.exit(1);
	}
	console.log(
		waived > 0
			? `\naudit gate: clean (${waived} waived pending cooldown)`
			: "\naudit gate: clean",
	);
}

await main();
