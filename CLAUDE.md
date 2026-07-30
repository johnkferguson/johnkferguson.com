# CLAUDE.md

## Project Overview

Personal blog at johnkferguson.com. Static site built with Astro 7, styled with hand-written CSS (no framework), deployed on Netlify.

## Commands

- `bun run dev` - Start dev server (port 4321) with hot reload
- `bun run build` - Production build to `dist/`
- `bun run preview` - Preview production build (no hot reload)
- `bun test` - Run unit tests (bun:test, `src/**/*.test.ts`)
- `bun run check` - Lint with Biome
- `bun run check:fix` - Auto-fix lint issues
- `bun run lighthouse` - Lighthouse gate over `dist/` (needs a build first)

When previewing changes locally, prefer `bun run dev` over `build + preview` — it watches for file changes and reloads automatically.

Draft posts (`src/content/posts/drafts/`, `draft: true`) render in dev only; production builds glob-exclude them (keyed on `ASTRO_BUILD`, set by the build script) so none of their modules reach the bundle. The isolated `cacheDir` in `astro.config.mjs` is the thing that stops a build clobbering a running dev server's content store (dev uses `node_modules/.astro`, builds `node_modules/.astro-build`); dropping it does clobber, so keep it.

The build script must not end with `astro sync`: that runs draft-inclusive, so a malformed draft which never ships failed the Netlify deploy (PR #34). Drafts stay schema-validated by `bunx astro check`, which runs before the build in `check.yml`.

## Architecture

- `src/content/posts/*.md` - Blog posts (Markdown with YAML frontmatter: title, date)
- `src/content.config.ts` - Content collection schema (Zod validation)
- `src/pages/` - Astro pages and API routes
- `src/layouts/` - BaseLayout.astro (all pages), PostLayout.astro (posts)
- `src/components/` - Astro components (Head, SiteHeader, SiteFooter, JsonLd, icons/)
- `src/components/posts/{slug}/` - Post-owned components (interactive Preact lab islands, charts; labs theme via `--lab-*` CSS vars). The generic `Lab.astro` frame (title strip, deep-link anchor, TOC discovery via `src/markdown/labs.mjs`) lives in `src/components/`
- `src/markdown/` - Sätteri pipeline plugins (`external-links`, `katex`, `labs`), plain `.mjs` so `astro.config.mjs` loads them through Node's own loader rather than falling back to vite
- `src/lib/` - Pure TS modules (e.g. `snapshot-fees/engine.ts` — mechanism logic, unit-tested; components only render)
- `src/pages/lab/` - Unpublished playground pages for in-progress interactive work (noindex, excluded from sitemap). They are still **built** in production and then deleted: the build script is `astro build && rm -rf dist/lab`. So a broken page here fails the Netlify deploy even though it never ships, the same footgun as the draft incident in PR #34. Keep them compiling.
- `src/styles/global.css` - import index only; the CSS lives in siblings it pulls in, in this order: `reset.css` (vendored preflight, imported into `@layer base`), `colors.css` (`:root` then `.dark` palette), `base.css` (type tokens + element defaults), `layout.css` (prose measures, shell, sticky system), `post-shell.css`, `prose.css` (article body), `print.css`. Order is meaningful — see the header comment before reordering
- `public/images/posts/` - Post images referenced as `/images/posts/{slug}/`

## Key Patterns

- Content Collections with `glob()` loader for posts
- Preact with `compat: true` — components can import from `"react"` (aliased in vite and tsconfig paths); write labs as React-style TSX
- Markdown runs on the **Sätteri** processor (`processor: satteri()`). Its plugins go in `mdastPlugins`/`hastPlugins`; `remarkPlugins`/`rehypePlugins` still typecheck but are **silently ignored**, so a plugin moved back into them stops running with no error. `compressHTML: true` is still pinned to v6 whitespace rules (Astro 7 defaults to `'jsx'`, which strips whitespace between elements) and is independent of the processor
- `@astrojs/markdown-satteri` is pinned to an **exact** version matching `astro`'s own dependency on it, so only one copy resolves; bump it in lockstep with astro (Dependabot's `@astrojs/*` group does this). `satteri` is intentionally in no group, so its 0.x minors (which carry breaking changes) arrive as their own PR. Drift is quiet, because `@astrojs/mdx` identifies the processor by `p.name === "satteri"` and would accept a second copy, so `src/markdown/satteri-pin.test.ts` asserts the match instead
- **A hast plugin's `ctx.report()` goes nowhere.** Satteri collects hast diagnostics on the visitor context but nothing reads them back: `compile.js` calls `visitHastHandle` for its dropped-patch count only, and neither `@astrojs/markdown-satteri` nor `@astrojs/mdx` touches `getDiagnostics()`. Plugins that need to be heard use `console.warn`, or throw. (mdast plugins differ: `visitMdastHandle` does return diagnostics.)
- **A raw hast node is not an escape hatch for HTML.** `{ type: "raw" }` serializes as markup through `markdownToHtml`, so `.md` pages look right, but MDX compiles it to a plain **string** child in the JSX tree, which JSX escapes when it renders. Parse HTML into real hast (`hast-util-from-html`) instead. Because the escaping happens at render time, the compile-time tell is `className: "katex"` JSX props vs a `"<span class=..."` string literal, which is what `src/markdown/katex.test.ts` asserts
- **A formula KaTeX cannot parse fails a production build** and only warns in dev (`ASTRO_BUILD` is the switch). The lenient render succeeds and returns red `katex-error` markup, so without the strict pass first there is no signal at all and the error ships to readers
- Math via Sätteri's `features: { math: true }` parser plus `src/markdown/katex.mjs` (build-time, no client JS; KaTeX CSS gated per post by the layout, issue 20). The parser emits exactly what remark-math did (`code.language-math`), and the plugin renders it with the same `katex` package rehype-katex used, so the markup is unchanged. Prose convention: formula variables are ALWAYS inline math (`$M$`, `$k_1$`, `$q_i$`, `$M \pm B/2$`), which page CSS dresses like a code span (prose-sized, code color/background); backticks are reserved for actual code; standalone formulas use `$$ ... $$` display blocks; literal dollar amounts in prose are ALWAYS escaped (`\$5`) — the processor pairs any two unescaped `$` in a paragraph, garbling money and neighboring math alike (enforced by `src/lib/literal-dollars.test.ts`, which pins the pairing rules to Sätteri itself)
- `syntaxHighlight: false` in astro.config.mjs (plain code blocks, no Shiki)
- Fonts: Newsreader self-built (weight-instanced variable woff2s in `src/assets/fonts/`, regenerated by `scripts/build-fonts.py`) and `@fontsource/fira-code`
- `--font-serif` / `--font-mono` defined in a `:root` block in `base.css`; `reset.css` reads them with literal fallbacks so it depends on nothing. Base size 17px mobile / 20px desktop (Newsreader runs small for its px size)
- LLM-friendly: llms.txt, llms-full.txt, per-post .md endpoints, AI-friendly robots.txt
- URL structure: posts at `/{slug}` (root level, not /posts/ or /blog/)
- Heading hierarchy in posts is enforced by test (`src/lib/heading-structure.test.ts`): levels step down one at a time, never h2 -> h4. The TOC rail nests h2/h3/h4 on this assumption
- Netlify deployment: static output to `dist/`

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
  fragments, epigrams, mirror constructions, or snap colon payoffs
  ("the one thing that accumulates: what you traded").
- Forward references name and link the target section ("covered in
  [The Dual-Flow Fit](#the-dual-flow-fit)"), never a bare "later".
- A precise formulation lives in exactly one place; don't repeat the
  same phrasing in the lede and the body.

## Visual Verification

- The `chrome-devtools` MCP server (project `.mcp.json`, drives its own Chrome instance) is the way to verify design and layout work: navigate to the dev server, `take_screenshot` (or `take_snapshot` for structure), and Read the image before calling a visual change done. "The HTML looks right" is not verification.
- Test at realistic CSS viewport widths with `resize_page`. John's 1920px monitor presents as roughly 1000-1100 CSS px due to zoom/display scaling, so always check ~1000-1100 as well as 390 (mobile) and 1400+. The post TOC rail appears at >= 1020 CSS px.
- Before publishing changes, `lighthouse_audit` on the affected pages.

## Lighthouse Gate (`scripts/lighthouse.ts`)

- Runs over **every** `dist/**/*.html` under **both** presets, in its own `check.yml` job. Pages are globbed, not listed, so a new post is covered the moment it builds; `dist/sitemap-0.xml` is not used because it omits `404.html`.
- Gates accessibility, best-practices and SEO at >= 0.95, plus per-resource-type transfer budgets. The **performance score is printed but never asserted** — it flakes on shared runners, and the byte budgets are the real performance gate. Every page scores 0 on `render-blocking-insight` and `network-dependency-tree-insight` (fonts and CSS in `<head>`); that is the standing baseline, not a regression.
- **Budgets are enforced in-repo, not by Lighthouse.** Lighthouse 13 removed budgets outright — no `performance-budget` audit, and `--budget-path` is accepted and silently ignored. The checks read the still-present `resource-summary` audit instead. This is also why `@lhci/cli` is not used: it is 13 months stale, carries 7 high advisories with no fix path, and its budget support only works via its pinned Lighthouse 12.
- **Both presets run because some audits exist on only one.** `list`/`listitem` score on desktop and are not applicable on mobile, since the TOC rail is desktop-only DOM (>= 1020px). Transfer bytes are identical across presets, so budgets are asserted on the mobile run alone.
- **`/404.html` is an override that asserts in both directions**: its SEO threshold drops to 0.60 for the intentional `noindex`, *and* `is-crawlable` is asserted to still score 0, so the `noindex` cannot silently vanish. New per-page exceptions go in `URL_OVERRIDES` with the same discipline — a raise to the shared budgets is the wrong fix for one heavy page.
- **Every gate dimension is per-page overridable** via `URL_OVERRIDES` (category thresholds, size budgets, request-count budgets, expected audit scores). Entries **merge over** the defaults, so relaxing `font` leaves that page's other ceilings intact, and a page with no entry gets the tight defaults — new posts are covered without an allow-list to forget. Keys are exact-match on the URL (`/snapshot-fees`, `/404.html`); there is no glob, which is fine at four pages and is the thing to revisit if most posts ever need the same raise. A key matching no audited page **fails the gate** rather than sitting there dead.
- **Watch the font budget**: headroom is ~21 KiB and one Fira Code weight is ~23 KiB. `BaseLayout.astro` imports 400/500/700 but 700 never downloads, because `@font-face` is lazy and nothing uses bold monospace yet. The first post that does will trip the budget. That is the gate working, not a false alarm.
- **Local before/after for asset work**: `bun run lighthouse --save baseline`, change fonts or CSS, rebuild, then `bun run lighthouse --compare baseline` for a per-file byte delta. Snapshots land in gitignored `.lighthouse/`. Save and compare take a 3-run median because they report LCP/CLS; the gate runs once, since nothing it asserts on varies between runs. `--runs N` overrides that; it is a save/compare knob (raising it for the gate is multiplied runtime for an identical result), and the useful direction is usually down — `--compare --runs 1` gives the deterministic byte deltas in a third of the time.
- **Budgets and expected audits fail closed.** A budgeted resource type absent from `resource-summary` is a violation, not a zero: Lighthouse emits all nine types on every page including zeros, so absent means a typo'd budget key or a changed audit shape, both of which would otherwise leave the gate asserting nothing while reporting clean. Same reason `URL_OVERRIDES` keys matching no page fail.
- **The gate reads back the port astro actually bound** rather than assuming it got the one it asked for. `astro preview` does not fail on a busy port, it increments, so polling the requested port would silently audit whatever else was holding it — most plausibly a preview leaked from an interrupted run serving a stale `dist/`. `--host 127.0.0.1` is also deliberate: preview otherwise binds IPv6-only, so connectivity would depend on how `localhost` resolves, for the readiness poll and for Chrome alike.
- Everything the script spawns is tracked and killed by one `cleanup()`, from the `finally` and from SIGINT/SIGTERM (audits first, then the server, so stragglers are killed rather than left failing on connection-refused). An interactive Ctrl-C needs none of it, since it signals the whole process group.
- Drafts are invisible to this gate — `getVisiblePosts` filters on `import.meta.env.DEV`, so no build of any kind emits them. The manual MCP `lighthouse_audit` above stays the pre-publish gate for drafts.

## Dependency Management & CI Hardening

- **`bun.lock` is invisible to GitHub's dependency graph** — Dependabot alerts only ever resolve from the `package.json` ranges, so the transitive tree is uncovered. `bun audit` (via `scripts/audit.sh`) is the only thing that sees it. This is why the audit gate carries more weight here than on an npm project.
- **`scripts/audit.sh` is the single source of truth for accepted advisories** — not the workflows. It pipes `bun audit --json` through `scripts/audit-gate.ts` with an `--ignore` list; each entry documents its exposure class (not dependency paths, which churn). Called from both `check.yml` (PR gate) and `security.yml` (daily scheduled sweep — catches advisories newly published against unchanged deps). Add or drop ignores there; a moderate deliberately left un-ignored is recorded in the same comment so a future re-score to high fails loudly with context.
- **The audit gate is cooldown-aware** (`scripts/audit-gate.ts`, window read from bunfig's `minimumReleaseAge`): an advisory whose only in-range fix is younger than the window is WAIVED with the date it becomes actionable and starts failing by itself once the fix ages in — no temporary ignore entries. Criticals are never waived (bypass the cooldown via `minimumReleaseAgeExcludes` instead). An advisory with no in-range fix fails and needs a documented ignore. After any lockfile change, `bun scripts/verify-lock-ages.ts` confirms every added version clears the window (what Netlify's plain `bun install` will enforce).
- **Two cooldown numbers must stay in sync**: `minimumReleaseAge` in `bunfig.toml` (seconds) and `cooldown.default-days` in `.github/dependabot.yml` (both 7 days). `bunfig.toml` also covers manual `bun add`/`bun update` and Netlify's `bun install`, which Dependabot's server-side cooldown does not.
- **`minimumReleaseAge` failure mode**: a too-new version fails resolution with `No version matching "<pkg>" found for specifier (minimum-release-age: ...)` — it reads like the version doesn't exist but means it's younger than 7 days. Escape hatch: add the package to `minimumReleaseAgeExcludes` in `bunfig.toml`. Consequence to remember: `bun update` grabs newest-compatible and can pull versions younger than the window, which a plain `bun install` (Netlify) then refuses even though CI's `--frozen-lockfile` glosses over it — keep the lockfile within the cooldown.
- **Actions are tag-pinned (`ref-pin`), deliberately** — `zizmor.yml` overrides zizmor's default `hash-pin`. Dependabot only raises security alerts for actions using semantic versioning, so hash-pinning would trade that alerting away. Bare refs / floating branches are still rejected.
- **`trustedDependencies` (`package.json`) replaces bun's built-in 368-package allowlist** rather than extending it — so it must list every dependency that needs install scripts. Only `esbuild` and `sharp` declare lifecycle scripts here (verified from a `node_modules`-removed install; a re-run over an existing tree proves nothing). `bun-version` is pinned in both workflows and `BUN_VERSION` in `netlify.toml`.

## Git Conventions

- Commit on a feature branch, not main
- Conventional commits: `type(scope): description`
