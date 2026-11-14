# CLAUDE.md

Personal blog at johnkferguson.com. Astro 7, hand-written CSS, pnpm 12 on Node 24 (bun runs the tests and `scripts/`), static on Netlify.

Commands are in `package.json`. Two that aren't obvious: `pnpm run lighthouse` needs a build first, and prefer `pnpm run dev` over build-and-preview when iterating.

Two standing conventions: `src/lib/` is pure TS and unit-tested, with components only rendering; Preact runs with `compat: true`, so labs import from `"react"` and are written React-style.

## Writing Posts

Drafts live in `src/content/posts/drafts/` with `draft: true`. They render in dev only; production builds glob-exclude them via `ASTRO_BUILD`.

**That directory is its own private git repo**, gitignored here, so unpublished writing stays out of this public one. Commit from inside it, pushing to `johnkferguson.com-drafts`; `.githooks/pre-push` rejects any push from this repo that touches the path (`git config core.hooksPath .githooks`). Publishing is a move up one level, and the slug survives it. Two consequences:

- CI no longer schema-validates drafts, since it clones a tree without them. That check is local now.
- `git clean -xdff` here deletes the drafts repo along with any unpushed history.

Conventions inside a post:

- Formula variables are ALWAYS inline math (`$M$`, `$k_1$`); backticks are for code. Literal dollar amounts are ALWAYS escaped (`\$5`), because the processor pairs any two unescaped `$` in a paragraph and garbles both the money and the neighbouring math (`literal-dollars.test.ts`).
- Heading levels step down one at a time, never h2 to h4. The TOC rail assumes it (`heading-structure.test.ts`).

## Prose Style (blog posts)

Register varies by post (see the `pace` frontmatter field): technical and
mechanism pieces are dry, precise, sustained argument; non-technical pieces
(e.g. Refactoring with Love) are personal and warm, with short sentences,
single-sentence paragraphs, and fragments used freely as pacing. Constant
across every register:

- Never use em dashes, in any text.
- No marketing voice ("unlock", "key benefits"). State consequences as
  facts, not benefits, and scope claims to what the design guarantees.
- Avoid LLM tells: "can be viewed as", "as a design", "the right lens",
  "X, not Y" framing, anthropomorphized subjects ("the schedule stops
  caring").
- Concrete specifics over abstractions; sincerity without irony.

Technical pieces additionally:

- Plain declarative sentences; no aphoristic register: no rhetorical
  fragments, epigrams, mirror constructions, or snap colon payoffs.
- Forward references name and link the target section, never a bare "later".
- A precise formulation lives in exactly one place; don't repeat the same
  phrasing in the lede and the body.

## Markdown Pipeline

- `src/markdown/` holds the Sätteri plugins, plain `.mjs` so `astro.config.mjs` loads them through Node rather than falling back to vite.
- **`remarkPlugins`/`rehypePlugins` typecheck but are silently ignored.** Sätteri plugins go in `mdastPlugins`/`hastPlugins`. Relatedly, a hast plugin's `ctx.report()` goes nowhere, so warn or throw instead.
- **A raw hast node is not an escape hatch for HTML.** `{ type: "raw" }` renders in `.md`, but MDX compiles it to a string child that JSX escapes. Parse into real hast with `hast-util-from-html`.
- **Bumping `katex` means re-running `scripts/build-katex.py` in the same commit**, because `public/katex/` is a committed copy and 0.18.0 renamed every internal class. It is excluded from Dependabot's monthly group for that reason: its PR can never merge unaided.
- **KaTeX parse errors fail production builds but only warn in dev**, so a bad formula looks fine locally.
- Keep `@astrojs/markdown-satteri` pinned exact to astro's own dependency and bump them in lockstep. `satteri` is excluded from the monthly group, so its breaking 0.x minors arrive alone.

## Build Script

Three constraints, each of which fails in a way that points somewhere else.

- **It must not end with `astro sync`**: that runs draft-inclusive, so a draft which never ships once failed the deploy (PR #34).
- **Lab pages are built and then deleted** (`rm -rf dist/lab dist/lab.html`), so a broken one fails the deploy without ever shipping. Keep them compiling. The second path is not redundant: `lab/index.astro` emits to `dist/lab.html` at the dist root, outside the directory.
- The isolated `cacheDir` stops a build clobbering a running dev server's content store. Dropping it does clobber.

## URLs & Serving

- **A bare URL takes two settings, and either alone is a no-op.** `trailingSlash: "never"` governs only what astro emits, never how Netlify serves. `build.format: "file"` emits `dist/about.html`, and `[build.processing.html] pretty_urls = false` in netlify.toml stops Netlify rewriting that back to `/about/`. That format also puts `.html` in `Astro.url.pathname`, so canonical and `og:url` go through `src/lib/canonical.ts`; dropping that call is invisible to the unit tests and to lychee, which is why `scripts/check-canonicals.ts` guards it over built `dist/`.
- **There is no redirect layer left**: `/about`, `/about/` and `/about.html` all serve 200, so canonical tags and the sitemap are the only thing consolidating them. Redirect rules cannot restore it, measured rather than assumed: Netlify normalizes the trailing slash before matching, so a `/about/` rule matches the bare path too and loops the page to death. `astro preview` disagrees with Netlify here, 404ing `/about/`, so only a deploy preview tells the truth about URL shapes.

## Styling & Fonts

- `global.css` is an import index only, and the order matters: `reset`, `colors`, `base`, `layout`, `post-shell`, `prose`, `print`. Read its header before reordering.
- Newsreader is self-built (`scripts/build-fonts.py`) alongside `@fontsource/fira-code`. Base size 17px mobile, 20px desktop, because Newsreader runs small for its px size.

## Visual Verification

- Verify design work with the `chrome-devtools` MCP server and Read the screenshot. "The HTML looks right" is not verification.
- John's 1920px monitor presents as ~1000-1100 CSS px, so test there as well as 390 and 1400+. The TOC rail appears at >= 1020px.
- Before publishing, `lighthouse_audit` the affected pages. Drafts never reach the CI gate, so this is the only one they get.

## CI Gates

Everything that can fail a PR.

- **The Lighthouse gate** (`scripts/lighthouse.ts`) prints the performance score but never asserts it, because it flakes on shared runners; the byte budgets are the real performance gate. Both presets run because some audits exist on only one.
- **Budgets are enforced in-repo**, because Lighthouse 13 removed them outright and `--budget-path` is accepted and silently ignored. The checks read `resource-summary` instead.
- **Everything fails closed.** A budgeted resource type missing from the audit, an expected audit score, or a `URL_OVERRIDES` key matching no page all fail rather than pass quietly.
- `URL_OVERRIDES` keys are exact-match on the served URL (`/snapshot-fees`, `/404`) and merge over the defaults, so a page with no entry gets the tight ones. `/404` relaxes SEO to 0.60 *and* asserts `is-crawlable` still scores 0, so the noindex cannot silently vanish.
- **Font budget headroom is ~21 KiB and one Fira Code weight is ~23 KiB.** The first post to use bold monospace will trip it. That is the gate working.
- **lychee needs `fallback_extensions = ["html"]`**, since it remaps site URLs onto `file://` paths where `/about` is `about.html`.
- **Dependabot reads `pnpm-lock.yaml`**, so its alerts and security updates cover transitive packages. `pnpm audit` in `check.yml` gates PRs on high and critical advisories; an accepted advisory goes in `audit.ignore` in `pnpm-workspace.yaml` with why the site is not exposed and a revisit date.

## Dependencies

- **`pnpm-workspace.yaml` holds the install policy**, each setting commented there: the 7-day wait, the install-script allowlist (`allowBuilds`: nothing here needs a script, and esbuild's postinstall is denied), `trustPolicy: no-downgrade`, the audit gate. pnpm fails on an unknown top-level key in it (keys nested under `audit:` are not checked). `packageManager` names the pnpm version: CI installs it through `pnpm/action-setup`, Netlify through corepack (`scripts/netlify-build.sh`, the build command, fails the deploy if Netlify ran another version), and `nix/pnpm.nix` gives devenv the same release binary (its hashes need updating when the version moves). nixpkgs' `pnpm_12` (12.9.0) lacks later pnpm security fixes; ENG-383 tracks moving to it.
- **`minimumReleaseAge` (7 days) applies on every install**, CI and Netlify included, and to versions already in `pnpm-lock.yaml`. For a range, pnpm picks the newest release past the wait; an exact version inside it fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, and one already locked with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. To let a security fix in early, add the exact version to `minimumReleaseAgeExclude` with the date it turns 7 days old. Keep the wait and `cooldown.default-days` in `.github/dependabot.yml` at the same number of days.
- **`trustPolicy: no-downgrade` fails the install on a release published with weaker evidence than earlier ones.** `chromium-bidi` (through lighthouse) is excluded: its Chrome-milestone releases come from Chrome DevTools' npm account without the provenance its 17.x releases had.
- **npq checks dependency changes in CI.** On PRs, `check.yml` runs npq (a devDependency) on each direct dependency the PR adds or changes, at its locked version, and fails on an npq error unless `.npq-allow` lists that package, check and version (format, and what to do on a failure: `.claude/skills/npq-check/SKILL.md`, a copy of the `npq-check` skill in towardstypetwo/agent-skills that its sync doesn't reach here, so update it by copying).
- **Tools run from `node_modules`, never a package runner.** `scripts/check-no-downloaded-tools.sh` (in CI and `.githooks/pre-commit`) fails on the common spellings of running a downloaded tool (`npx`, `bunx`, `npm exec`, `pnpm dlx`, `@latest`, `curl | sh` and the like) in workflows, scripts and config. It matches a list of spellings, so it guards against mistakes only. A tool a script or `.mcp.json` runs is a pinned devDependency (esbuild, chrome-devtools-mcp), called by its `node_modules/.bin` path or `pnpm exec`.
- **pnpm's `node_modules` is strict**: code can import only what `package.json` lists, so a type or module that bun's flat layout made reachable must be declared (`@types/hast` for `src/markdown/katex.mjs`).
- **bun runs the tests and `scripts/`**, at the version in `.bun-version`, which `check.yml` (setup-bun) and `devenv.nix` both read.
- Workflows name actions by full version tag (`actions/checkout@v7.0.1`), and `.github/workflows/actions.lock` pins each tag, and each action those actions use, to a verified commit. `uses:` keeps the tag because Dependabot raises alerts only for semver-tagged actions (`zizmor.yml` overrides its hash-pin default). The lockfile is generated by `gh actions-lock`, never edited by hand. Install the extension at the version `check.yml` pins (`gh extension install github/gh-actions-lock --pin v0.4.1`), since a newer one can write a lockfile format CI's copy cannot read, and bump both together. After adding a workflow or changing a `uses:` line, run `gh actions-lock` and commit the lockfile with the workflow. `check.yml` runs `gh actions-lock --verify`, which fails when the two disagree.
- **GoatCounter's `count.js` is vendored, minified, in `src/assets/`**, regenerated by `scripts/build-goatcounter.sh [commit]`. Nothing tracks it: Dependabot and `pnpm audit` never see it, so updates are manual. Its `?url` import hashes the filename but does not minify, which is why the script does.
- **TypeScript is held on 6.x** by a Dependabot ignore: `astro check` reaches the TS programmatic API through `@astrojs/language-server`, and the native compiler (7.0+) does not ship it, so the step aborts before reporting a diagnostic. Lift the ignore once [withastro/roadmap#1321](https://github.com/withastro/roadmap/discussions/1321) lands.
