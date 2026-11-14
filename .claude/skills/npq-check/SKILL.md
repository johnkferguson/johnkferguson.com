---
name: npq-check
description: Check new and changed npm dependencies with npq in CI, with reviewed exceptions in .npq-allow. Use when the npq check fails or warns on a pull request, when adding or upgrading a dependency in a repo that has .npq-allow, or when setting the check up in a pnpm repo.
---

# npq check

`check.mjs` in this skill runs npq on the direct dependencies a pull request adds or changes, at the versions `pnpm-lock.yaml` resolves, by comparing the lockfile with the base commit's. It never installs anything: npq runs in its audit-only `--json` mode.

- An npq **error** fails the check: typosquatting, a new or dormant maintainer, a version under a week old, deprecation, install scripts, known vulnerabilities, low downloads, no license. A **warning** shows as an annotation on `package.json` and doesn't fail.
- The check fails when npq can't finish (a registry lookup fails, for example). Re-run the job; don't add an exception for it.
- A dependency that resolves outside registry.npmjs.org (git, tarball URL, `link:`) fails, since npq can't check it.
- `MARSHALL_DISABLE_*` variables, npq's switches for turning a check off, are cleared before npq runs. Exceptions go in `.npq-allow`, where review sees them.

## When the check fails

Read the finding before anything else. Most errors are real: a lookalike name, a release from a maintainer who hasn't published in months, a package with an install script. Fix the dependency (the intended package, an older version, a different package) where you can.

For a false positive, add one line to `.npq-allow` at the repo root, in the same PR:

```
<package>@<version> <check> <YYYY-MM-DD> <reason>
```

- `check` is npq's name for it, as the annotation prints: `typosquatting`, `author`, `scripts`, `snyk` and so on.
- The version is exact. A line covers one check at one version, so an upgrade needs a new line; delete the old one with it. The check prints a notice for lines whose version is no longer installed.
- The reason says why the finding doesn't apply, as a fact a reviewer can check ("the official Svelte CLI, published by the Svelte org"), not that it was reviewed.
- Lines starting with `#` are comments. The file's first line documents the format.

Never edit `check.mjs` in a consumer repo: it is synced from agent-skills and the next sync replaces it.

## Setting it up in a repo

Requires a single-project pnpm repo with `npq` as an exact-pinned devDependency, so the install that CI already runs provides it under the repo's install policy. Add a step to the job that runs `pnpm install --frozen-lockfile`, after the install, and check out two commits so the base is there:

```yaml
- uses: actions/checkout@<pinned tag>
  with:
    persist-credentials: false
    fetch-depth: 2
- run: pnpm install --frozen-lockfile
- name: Check new and changed dependencies with npq
  if: github.event_name == 'pull_request'
  run: node .claude/skills/npq-check/check.mjs --base HEAD^1
```

On `pull_request`, checkout gives the merge of the PR into its base, so `HEAD^1` is the base branch the PR merges into. Keep the step in the job that is already a required status check: a separate workflow filtered to dependency paths never reports on other PRs, and a required check that never reports blocks them.

Then create `.npq-allow` with the format line as its first line:

```
# <package>@<version> <check> <YYYY-MM-DD> <reason>; see .claude/skills/npq-check/SKILL.md
```
