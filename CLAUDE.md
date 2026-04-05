# CLAUDE.md

## Project Overview

Personal blog at johnkferguson.com. Static site built with Astro 6, Tailwind CSS v4, deployed on Netlify.

## Commands

- `bun run dev` - Start dev server (port 4321)
- `bun run build` - Production build to `dist/`
- `bun run preview` - Preview production build
- `bun run check` - Lint with Biome
- `bun run check:fix` - Auto-fix lint issues

## Architecture

- `src/content/posts/*.md` - Blog posts (Markdown with YAML frontmatter: title, date)
- `src/content.config.ts` - Content collection schema (Zod validation)
- `src/pages/` - Astro pages and API routes
- `src/layouts/` - BaseLayout.astro (all pages), PostLayout.astro (posts)
- `src/components/` - Astro components (Head, SiteHeader, SiteFooter, JsonLd, icons/)
- `src/styles/global.css` - Tailwind + custom CSS variables and article styles
- `public/images/posts/` - Post images referenced as `/images/posts/{slug}/`

## Key Patterns

- Content Collections with `glob()` loader for posts
- `syntaxHighlight: false` in astro.config.mjs (plain code blocks, no Shiki)
- Fonts via `@fontsource/pt-serif` and `@fontsource/fira-code` (self-hosted)
- Tailwind `--default-font-family` overridden to PT Serif in `@theme` block
- LLM-friendly: llms.txt, llms-full.txt, per-post .md endpoints, AI-friendly robots.txt
- URL structure: posts at `/{slug}` (root level, not /posts/ or /blog/)
- Netlify deployment: static output to `dist/`

## Git Conventions

- Commit on a feature branch, not main/master
- Conventional commits: `type(scope): description`
