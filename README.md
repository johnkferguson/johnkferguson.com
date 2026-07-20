# [johnkferguson.com](https://www.johnkferguson.com)

Personal site and blog of John K. Ferguson. Writing on markets, mechanism
design, and software development.

Built with [Astro](https://astro.build/), styled with Tailwind CSS v4,
run with [Bun](https://bun.sh/), deployed on Netlify as a fully static
site.

## Notable pieces

- **Generative art**: every post gets a deterministic, slug-seeded SVG
  artwork (four families) that appears as its page backdrop, its
  homepage thumbnail, and its OG/social card, all drawn by
  `src/lib/art/generate.ts` at build time. The homepage identity art
  reseeds on every visit, the one dynamic piece on the site.
- **Table of contents rail**: a sticky three-level accordion built at
  build time from the post's headings, with scrollspy, auto-reveal, and
  a footer-dodging Back-to-top control. Works without JavaScript (the
  client script adds behavior only).
- **Draft workflow**: posts in `src/content/posts/drafts/` with
  `draft: true` render in dev (with a badge) and are excluded from
  production builds at the content-loader level, so none of their
  modules can reach the deployed bundle.
- **Reading time** counts prose only (code, math, and interactive
  embeds stripped), at a per-post pace set in frontmatter.
- **Math**: remark-math + rehype-katex at build time, no client JS.
  Prose convention: formula variables are always inline math, literal
  dollar amounts are always escaped (`\$5`), both enforced by tests.
- **Self-built fonts**: Newsreader variable fonts instanced to the
  weight range the site uses (`scripts/build-fonts.py`), with
  metric-tuned fallbacks; OG cards render from static instances of the
  same font.
- **LLM-friendly**: `/llms.txt`, `/llms-full.txt`, per-post `/{slug}.md`
  raw-markdown endpoints, JSON-LD, and a robots.txt that welcomes AI
  crawlers.

## Development

```bash
bun install
bun run dev       # dev server on :4321 (drafts visible)
bun run build     # production build to dist/ (drafts excluded)
bun run preview   # preview the production build
bun test          # unit tests
bun run check     # lint with Biome
```

## Content

Posts are Markdown/MDX files in `src/content/posts/`:

```yaml
---
title: "Post Title"
date: 2026-01-01
pace: mixed        # optional: technical | mixed | non-technical
art:               # optional: override the generated artwork
  family: walk     # strata | field | walk | depth
---
```

Publishing a draft = move it up out of `drafts/` and remove
`draft: true`. Slugs are stable across that move.

## Architecture notes

See [CLAUDE.md](CLAUDE.md) for the working notes on layout systems,
build/dev cache isolation, and the visual-verification workflow.
