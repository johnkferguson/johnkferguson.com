# CLAUDE.md

## Project Overview

Personal blog at johnkferguson.com. Static site built with Astro 7, Tailwind CSS v4, deployed on Netlify.

## Commands

- `bun run dev` - Start dev server (port 4321) with hot reload
- `bun run build` - Production build to `dist/`
- `bun run preview` - Preview production build (no hot reload)
- `bun test` - Run unit tests (bun:test, `src/**/*.test.ts`)
- `bun run check` - Lint with Biome
- `bun run check:fix` - Auto-fix lint issues

When previewing changes locally, prefer `bun run dev` over `build + preview` — it watches for file changes and reloads automatically.

## Architecture

- `src/content/posts/*.md` - Blog posts (Markdown with YAML frontmatter: title, date)
- `src/content.config.ts` - Content collection schema (Zod validation)
- `src/pages/` - Astro pages and API routes
- `src/layouts/` - BaseLayout.astro (all pages), PostLayout.astro (posts)
- `src/components/` - Astro components (Head, SiteHeader, SiteFooter, JsonLd, icons/)
- `src/components/labs/` - Interactive Preact islands for posts (theme via `--lab-*` CSS vars)
- `src/lib/` - Pure TS modules (e.g. `snapshot-fees/engine.ts` — mechanism logic, unit-tested; components only render)
- `src/pages/lab/` - Unpublished playground pages for in-progress interactive work (noindex, excluded from sitemap)
- `src/styles/global.css` - Tailwind + custom CSS variables and article styles
- `public/images/posts/` - Post images referenced as `/images/posts/{slug}/`

## Key Patterns

- Content Collections with `glob()` loader for posts
- Preact with `compat: true` — components can import from `"react"` (aliased in vite and tsconfig paths); write labs as React-style TSX
- Markdown pinned to the remark/rehype pipeline (`processor: unified()`) and `compressHTML: true` — Astro 7 changed both defaults (Sätteri, jsx whitespace); keep pinned unless output is re-verified
- `syntaxHighlight: false` in astro.config.mjs (plain code blocks, no Shiki)
- Fonts via `@fontsource/pt-serif` and `@fontsource/fira-code` (self-hosted)
- Tailwind `--default-font-family` overridden to PT Serif in `@theme` block
- LLM-friendly: llms.txt, llms-full.txt, per-post .md endpoints, AI-friendly robots.txt
- URL structure: posts at `/{slug}` (root level, not /posts/ or /blog/)
- Netlify deployment: static output to `dist/`

## Git Conventions

- Commit on a feature branch, not main
- Conventional commits: `type(scope): description`
