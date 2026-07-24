#!/usr/bin/env bun
/* Verify every package version ADDED by the current bun.lock diff vs
 * main is older than bunfig's minimumReleaseAge, i.e. that Netlify's
 * plain bun install will accept the lockfile. Run after any lockfile
 * change before pushing: `bun scripts/verify-lock-ages.ts`. */

const diff = await Bun.$`git diff main -- bun.lock`.text();
const added = new Set<string>();
for (const line of diff.split("\n")) {
	if (!line.startsWith("+")) continue;
	const m = line.match(/\["((?:@[^/"]+\/)?[^"@]+)@(\d[^"]*)"/);
	if (m) added.add(`${m[1]}@${m[2]}`);
}

const bunfig = await Bun.file("bunfig.toml").text();
const windowSec = Number(
	bunfig.match(/^\s*minimumReleaseAge\s*=\s*(\d+)/m)?.[1] ?? 0,
);
const now = Date.now();

const byPkg = new Map<string, string[]>();
for (const spec of added) {
	const at = spec.lastIndexOf("@");
	const name = spec.slice(0, at);
	const ver = spec.slice(at + 1);
	byPkg.set(name, [...(byPkg.get(name) ?? []), ver]);
}

let young = 0;
for (const [name, vers] of byPkg) {
	const res = await fetch(
		`https://registry.npmjs.org/${name.replace("/", "%2f")}`,
	);
	if (!res.ok) {
		console.log(`?      ${name}: registry ${res.status}`);
		continue;
	}
	const time = ((await res.json()) as { time: Record<string, string> }).time;
	for (const v of vers) {
		const ageDays = (now - Date.parse(time[v] ?? "")) / 86_400_000;
		const ok = ageDays * 86_400 >= windowSec;
		if (!ok) young++;
		console.log(
			`${ok ? "OK " : "YOUNG"}  ${name}@${v}  ${ageDays.toFixed(1)}d`,
		);
	}
}
console.log(
	`\n${byPkg.size} packages checked; ${young} younger than the window`,
);
process.exit(young > 0 ? 1 : 0);
