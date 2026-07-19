# [johnkferguson.com](https://www.johnkferguson.com)

Personal blog of John K. Ferguson, built with [Astro](https://astro.build/) and deployed on [Netlify](https://www.netlify.com/).

## Tech Stack

- **Framework**: Astro 7
- **Styling**: Tailwind CSS v4
- **Fonts**: Newsreader (body; self-built weight-instanced variable files, see scripts/build-fonts.py), Fira Code (code) via @fontsource
- **Linting**: Biome
- **Package Manager**: Bun
- **Deployment**: Netlify (static)

## Development

```bash
bun install
bun run dev       # Start dev server
bun run build     # Build for production
bun run preview   # Preview production build
bun run check     # Lint with Biome
```

## Content

Blog posts are Markdown files in `src/content/posts/`. Add a new post by creating a `.md` file with frontmatter:

```yaml
---
title: "Post Title"
date: 2024-01-01
---
```

## LLM-Friendly Features

- `/llms.txt` - Plain-text site summary with links to all posts
- `/llms-full.txt` - Full content dump of all posts
- `/{slug}.md` - Per-post raw markdown endpoints
- `/robots.txt` - Explicitly allows AI crawlers
- JSON-LD structured data on all pages
- `<link rel="alternate">` for LLM discoverability
