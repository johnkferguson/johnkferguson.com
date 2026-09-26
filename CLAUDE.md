# CLAUDE.md

Personal blog at johnkferguson.com. Astro 7, hand-written CSS, Bun, static on Netlify.

Commands are in `package.json`. Two that aren't obvious: `bun run lighthouse` needs a build first, and prefer `bun run dev` over build-and-preview when iterating.

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
- **Bumping `katex` means re-running `scripts/build-katex.py` in the same commit**, because `public/katex/` is a committed copy and 0.18.0 renamed every internal class. It sits outside Dependabot's `markdown` group for that reason: its PR can never merge unaided.
- **KaTeX parse errors fail production builds but only warn in dev**, so a bad formula looks fine locally.
- Keep `@astrojs/markdown-satteri` pinned exact to astro's own dependency and bump them in lockstep. `satteri` is ungrouped, so its breaking 0.x minors arrive alone.

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
- **`bun.lock` is invisible to GitHub's dependency graph**, so Dependabot alerts resolve only from `package.json` ranges. `bun audit`, via `scripts/audit.sh`, is the only thing that sees the transitive tree.
- **`scripts/audit.sh` is the source of truth for accepted advisories**, not the workflows. Each ignore documents its exposure class. It runs from `check.yml` and from a daily `security.yml` sweep that catches advisories newly published against unchanged deps.
- The audit gate is cooldown-aware: an advisory whose only in-range fix is younger than `minimumReleaseAge` is waived with the date it starts failing by itself. Criticals are never waived.

## Dependencies

- **bun is pinned to what Dependabot runs** (1.3.14, `ARG BUN_VERSION` in dependabot-core `bun/Dockerfile`), because a newer bun writes a `bun.lock` format Dependabot cannot parse, and it installs with `--ignore-scripts` so nothing here catches it. The pin lives in `packageManager` (read by setup-bun), `netlify.toml` `BUN_VERSION`, and `devenv.nix` for local shells via direnv. The root `preinstall` (`scripts/check-bun-version.ts`) fails any install where the running bun or netlify.toml disagrees with `packageManager`.
- **Two cooldown numbers must stay in sync**: `minimumReleaseAge` in `bunfig.toml` and `cooldown.default-days` in `.github/dependabot.yml`, both 7 days.
- **A `minimumReleaseAge` failure reads like a missing version.** `No version matching "<pkg>" found for specifier` means younger than 7 days; escape via `minimumReleaseAgeExcludes`. `bun update` can pull inside the window, which Netlify's plain `bun install` then refuses even though CI's `--frozen-lockfile` glosses over it.
- Actions are **tag-pinned deliberately** (`zizmor.yml` overrides its hash-pin default), because Dependabot only raises alerts for semver-tagged actions.
- **`trustedDependencies` replaces bun's 368-package allowlist rather than extending it**, so it must list everything needing install scripts. Only `esbuild` and `sharp` do.
- **TypeScript is held on 6.x** by a Dependabot ignore: `astro check` reaches the TS programmatic API through `@astrojs/language-server`, and the native compiler (7.0+) does not ship it, so the step aborts before reporting a diagnostic. Lift the ignore once [withastro/roadmap#1321](https://github.com/withastro/roadmap/discussions/1321) lands.
- **Editing `bun.lock` at all re-resolves the whole tree**, so the audit gate's advice to drop an entry and reinstall is a full refresh, not a targeted bump. `bun update <pkg>` is not the alternative: for a transitive-only package it adds a new direct dependency at the latest major and leaves the vulnerable copy pinned.
