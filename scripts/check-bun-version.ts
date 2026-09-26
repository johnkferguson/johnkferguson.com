#!/usr/bin/env bun
/**
 * Refuse to install under a bun other than the pinned one. Runs as the root
 * preinstall, before bun touches bun.lock: a newer bun rewrites the lockfile
 * in a format the pinned one cannot parse, which otherwise surfaces only as
 * "Unknown lockfile version" in CI.
 *
 * package.json's packageManager is the pin, read by setup-bun in CI. Netlify
 * reads only BUN_VERSION from netlify.toml, so that copy is checked here too.
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const pinned = /^bun@(.+)$/.exec(pkg.packageManager ?? "")?.[1];
const netlify = /^BUN_VERSION\s*=\s*"([^"]+)"/m.exec(readFileSync("netlify.toml", "utf8"))?.[1];

const errors: string[] = [];
if (!pinned) errors.push(`package.json packageManager must be "bun@<version>"`);
else if (Bun.version !== pinned) errors.push(`running bun ${Bun.version}, but packageManager pins ${pinned}`);
if (pinned && netlify !== pinned) errors.push(`netlify.toml BUN_VERSION is ${netlify}, but packageManager pins ${pinned}`);

if (errors.length > 0) {
	for (const e of errors) console.error(`bun version check: ${e}`);
	process.exit(1);
}
