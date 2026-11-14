#!/usr/bin/env node
// Checks the direct dependencies a pull request adds or changes with npq, at
// the versions pnpm-lock.yaml resolves, against the base commit's lockfile.
// npq errors fail the run unless .npq-allow lists that package, check and
// version; warnings are printed as annotations. See SKILL.md.
//
// Usage: node check.mjs --base <git rev>   (run from the repo root, after
// `pnpm install --frozen-lockfile`, which installs npq as a devDependency)

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ALLOW_FILE = ".npq-allow";
const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"];
const REGISTRY = "https://registry.npmjs.org/";
// npq 3.27 check names, as its JSON reports them in `marshall`.
export const CHECKS = new Set([
  "age",
  "author",
  "deprecation",
  "downloads",
  "license",
  "maintainers_expired_emails",
  "newBin",
  "provenance",
  "repo",
  "scripts",
  "signatures",
  "snyk",
  "typosquatting",
  "version_maturity",
]);
const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// One allow line: <package>@<version> <check> <YYYY-MM-DD> <reason>.
export function parseAllow(text) {
  const entries = [];
  const errors = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const lineNo = index + 1;
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S.*)$/);
    if (!match) {
      errors.push({
        line: lineNo,
        message: "expected <package>@<version> <check> <YYYY-MM-DD> <reason>",
      });
      return;
    }
    const [, spec, check, date, reason] = match;
    const at = spec.lastIndexOf("@");
    const name = at > 0 ? spec.slice(0, at) : "";
    const version = at > 0 ? spec.slice(at + 1) : "";
    if (!name || !EXACT_VERSION.test(version)) {
      errors.push({
        line: lineNo,
        message: `${spec}: name an exact version, as <package>@1.2.3`,
      });
      return;
    }
    if (!CHECKS.has(check)) {
      errors.push({
        line: lineNo,
        message: `${check}: not an npq check (one of ${[...CHECKS].join(", ")})`,
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      errors.push({
        line: lineNo,
        message: `${date}: the date must be YYYY-MM-DD`,
      });
      return;
    }
    entries.push({ line: lineNo, name, version, check, date, reason });
  });
  return { entries, errors };
}

// Direct dependencies of the one project in `listing`, the parsed output of
// `pnpm list --lockfile-only --json --depth 0`, keyed by the name they are
// installed under.
export function directDeps(listing) {
  if (!Array.isArray(listing) || listing.length !== 1) {
    throw new Error("expected one project; pnpm workspaces are not supported");
  }
  const deps = new Map();
  for (const section of SECTIONS) {
    for (const [alias, dep] of Object.entries(listing[0][section] ?? {})) {
      deps.set(alias, {
        alias,
        // `from` is the registry name, which differs from the key for an alias.
        name: dep.from ?? alias,
        version: dep.version,
        resolved: dep.resolved ?? "",
      });
    }
  }
  return deps;
}

// Dependencies in `head` that `base` lacks or resolves to another version.
export function changedDeps(base, head) {
  return [...head.values()].filter((dep) => {
    const before = base.get(dep.alias);
    return (
      !before || before.name !== dep.name || before.version !== dep.version
    );
  });
}

function pnpmList(cwd) {
  const result = spawnSync(
    "pnpm",
    ["list", "--lockfile-only", "--json", "--depth", "0"],
    {
      cwd,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`pnpm list failed in ${cwd}:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function gitShow(rev, path) {
  const result = spawnSync("git", ["show", `${rev}:${path}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout : null;
}

// The base commit's dependencies, listed from its own manifest and lockfile.
function baseDeps(rev) {
  const lockfile = gitShow(rev, "pnpm-lock.yaml");
  const manifest = gitShow(rev, "package.json");
  if (lockfile === null || manifest === null) return new Map();
  const dir = mkdtempSync(join(tmpdir(), "npq-check-base-"));
  try {
    writeFileSync(join(dir, "package.json"), manifest);
    writeFileSync(join(dir, "pnpm-lock.yaml"), lockfile);
    const workspace = gitShow(rev, "pnpm-workspace.yaml");
    if (workspace !== null)
      writeFileSync(join(dir, "pnpm-workspace.yaml"), workspace);
    return directDeps(pnpmList(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// npq's JSON report on `specs`. Exit codes 0 (clean) and 1 (findings) both
// carry a report; anything else, or a report with failures, means npq could
// not check every package.
export function runNpq(npqBin, specs) {
  const env = { ...process.env };
  // Each MARSHALL_DISABLE_<CHECK> variable turns an npq check off; exceptions
  // belong in .npq-allow, where review sees them.
  for (const key of Object.keys(env)) {
    if (key.startsWith("MARSHALL_")) delete env[key];
  }
  const result = spawnSync(npqBin, ["--json", ...specs], {
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `npq printed no JSON report (exit ${result.status}):\n${result.stderr}${result.stdout}`,
    );
  }
  if (report.status === "failed" || (report.failures ?? []).length > 0) {
    const reasons = (report.failures ?? [])
      .map(
        (f) =>
          `${f.package ?? "npq"}${f.marshall ? ` (${f.marshall})` : ""}: ${f.code}: ${f.message}`,
      )
      .join("\n");
    throw new Error(
      `npq could not complete the audit:\n${reasons || JSON.stringify(report)}`,
    );
  }
  if (![0, 1].includes(result.status) || !Array.isArray(report.packages)) {
    throw new Error(
      `unexpected npq result (exit ${result.status}): ${result.stdout}`,
    );
  }
  return report;
}

// Sorts npq's findings into errors (failing), allowed errors and warnings.
// `deps` are the checked dependencies, in the order they were passed to npq,
// which keeps its package reports in that order.
export function evaluate(deps, report, allow) {
  const errors = [];
  const allowed = [];
  const warnings = [];
  const used = new Set();
  if (report.packages.length !== deps.length) {
    throw new Error(
      `npq reported ${report.packages.length} packages for ${deps.length} requested`,
    );
  }
  deps.forEach((dep, index) => {
    for (const finding of report.packages[index].findings ?? []) {
      const item = { dep, check: finding.marshall, message: finding.message };
      if (finding.severity === "warning") {
        warnings.push(item);
        continue;
      }
      const entry = allow.find(
        (e) =>
          e.name === dep.name &&
          e.version === dep.version &&
          e.check === finding.marshall,
      );
      if (entry) {
        used.add(entry);
        allowed.push({ ...item, entry });
      } else {
        errors.push(item);
      }
    }
  });
  return { errors, allowed, warnings, used };
}

function escapeData(text) {
  return String(text)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function escapeProperty(text) {
  return escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function annotate(level, message, { file, line } = {}) {
  const props = [];
  if (file) props.push(`file=${escapeProperty(file)}`);
  if (line) props.push(`line=${line}`);
  console.log(
    `::${level}${props.length ? ` ${props.join(",")}` : ""}::${escapeData(message)}`,
  );
}

function manifestLine(manifestText, alias) {
  const lines = manifestText.split("\n");
  const index = lines.findIndex((l) =>
    l.trimStart().startsWith(`${JSON.stringify(alias)}:`),
  );
  return index === -1 ? undefined : index + 1;
}

function main(argv) {
  const baseIndex = argv.indexOf("--base");
  const base = baseIndex === -1 ? undefined : argv[baseIndex + 1];
  if (!base) {
    console.error("usage: check.mjs --base <git rev>");
    return 2;
  }

  const allowText = existsSync(ALLOW_FILE)
    ? readFileSync(ALLOW_FILE, "utf8")
    : "";
  const allow = parseAllow(allowText);
  for (const e of allow.errors)
    annotate("error", `${ALLOW_FILE}: ${e.message}`, {
      file: ALLOW_FILE,
      line: e.line,
    });

  const head = directDeps(pnpmList(process.cwd()));
  const changed = changedDeps(baseDeps(base), head);
  const manifest = readFileSync("package.json", "utf8");
  const where = (dep) => ({
    file: "package.json",
    line: manifestLine(manifest, dep.alias),
  });

  const notRegistry = changed.filter(
    (d) => !d.resolved.startsWith(REGISTRY) || !EXACT_VERSION.test(d.version),
  );
  for (const dep of notRegistry) {
    annotate(
      "error",
      `${dep.alias}: resolves to ${dep.resolved || dep.version}, not a package on ${REGISTRY}, so npq cannot check it`,
      where(dep),
    );
  }
  const toCheck = changed.filter((d) => !notRegistry.includes(d));

  let result = { errors: [], allowed: [], warnings: [], used: new Set() };
  if (toCheck.length > 0) {
    console.log(
      `npq: checking ${toCheck.map((d) => `${d.name}@${d.version}`).join(", ")}`,
    );
    const report = runNpq(
      "node_modules/.bin/npq",
      toCheck.map((d) => `${d.name}@${d.version}`),
    );
    result = evaluate(toCheck, report, allow.entries);
  } else {
    console.log("npq: no new or changed direct dependencies");
  }

  for (const w of result.warnings) {
    annotate(
      "warning",
      `npq ${w.check}: ${w.dep.name}@${w.dep.version}: ${w.message}`,
      where(w.dep),
    );
  }
  for (const a of result.allowed) {
    console.log(
      `allowed by ${ALLOW_FILE} line ${a.entry.line}: npq ${a.check}: ${a.dep.name}@${a.dep.version}: ${a.message}`,
    );
  }
  for (const e of result.errors) {
    const line = `${e.dep.name}@${e.dep.version} ${e.check} ${new Date().toISOString().slice(0, 10)} <reason>`;
    annotate(
      "error",
      `npq ${e.check}: ${e.dep.name}@${e.dep.version}: ${e.message}\nIf this is a false positive, add to ${ALLOW_FILE}: ${line}`,
      where(e.dep),
    );
  }
  // An entry for a version no longer installed is dead weight; flag it so it
  // gets removed with the upgrade that replaced it.
  for (const entry of allow.entries) {
    const dep = [...head.values()].find(
      (d) => d.name === entry.name && d.version === entry.version,
    );
    if (!dep) {
      annotate(
        "notice",
        `${ALLOW_FILE}: ${entry.name}@${entry.version} is not a direct dependency at that version; remove the line`,
        { file: ALLOW_FILE, line: entry.line },
      );
    }
  }

  const failed =
    allow.errors.length + notRegistry.length + result.errors.length;
  console.log(
    `npq: ${result.errors.length} error(s), ${result.allowed.length} allowed, ${result.warnings.length} warning(s)`,
  );
  return failed > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    annotate("error", `npq check: ${error.message}`);
    process.exitCode = 1;
  }
}
