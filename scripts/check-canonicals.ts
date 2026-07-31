#!/usr/bin/env bun
/**
 * Assert every built page names its served URL, not the .html file behind
 * it. Runs after `bun run build`; the reasoning lives in
 * src/lib/canonical-audit.ts.
 */

import { existsSync, readdirSync } from "node:fs";
import { auditCanonicals, type CanonicalViolation } from "../src/lib/canonical-audit";

const DIST = "dist";

if (!existsSync(DIST)) {
	console.error(`${DIST}/ not found - run \`bun run build\` first`);
	process.exit(1);
}

const files = readdirSync(DIST, { recursive: true })
	.map(String)
	.filter((f) => f.endsWith(".html"))
	.sort();

/* Fail closed. An empty glob means the build shape changed or the script
 * is pointed somewhere wrong, and reporting "clean" over zero pages is the
 * failure this check exists to prevent. */
if (files.length === 0) {
	console.error(`no HTML pages found in ${DIST}/ - this check asserted nothing`);
	process.exit(1);
}

const violations: CanonicalViolation[] = [];
for (const file of files) {
	const html = await Bun.file(`${DIST}/${file}`).text();
	violations.push(...auditCanonicals(file, html));
}

if (violations.length > 0) {
	for (const v of violations) {
		console.error(`FAIL   ${v.file}`);
		console.error(`       ${v.message}`);
	}
	console.error(
		`\ncanonical check: ${violations.length} failing across ${files.length} pages`,
	);
	process.exit(1);
}

console.log(`canonical check: clean (${files.length} pages)`);
