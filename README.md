# [johnkferguson.com](https://johnkferguson.com)

This is the source code for my personal site and blog.

It's a static site built with [Astro](https://astro.build/), [Bun](https://bun.com/), vanilla CSS, and is deployed on [Netlify](https://www.netlify.com/).

Some of the cool and noteworthy features of the blog itself:

- [Light and dark mode](src/components/ThemeToggle.astro)
- [Fonts](src/styles/fonts.css), [styling](src/styles) and interface built to enhance readability
- A [Table of Contents](src/components/TableOfContents.astro) sidebar for each post making it easy to navigate
- [Custom generated art](src/lib/art) for each post
- LLM friendly content: [`/llms.txt`](src/pages/llms.txt.ts), [`/llms-full.txt`](src/pages/llms-full.txt.ts) and all post content can be viewed in [markdown format](src/pages/[slug].md.ts) by appending `.md` to the URL. [Example](https://johnkferguson.com/refactoring-with-love.md)
- Built in [copy button](src/components/block-copy.ts) for code blocks and latex
- [Reading time estimates](src/lib/reading-time.ts) for each post
- [Interactive labs](src/components/Lab.astro) embedded in posts, like the ones in [Snapshot Fees](src/components/posts/snapshot-fees)
- [Math rendered at build time](src/markdown/katex.mjs), so no KaTeX JavaScript ships
- [Social cards](src/lib/og.ts) generated per post
- [Share and copy-link controls](src/components/ShareControls.astro) at the end of each post

## Writing Process

Any blog posts currently in process live in the `src/content/posts/drafts/` dir. This directory is gitignored and is tracked in a separate private repo so I can iterate on new posts in private and commit changes as they evolve.

Astro handles these draft posts normally when developing locally so they can still be viewed in the browser. When viewing in dev, each post will have a DRAFT badge attached to it.

Any additional components or other styling that are being actively developed for a draft post aren't gitignored and go in this repo directly. This can include custom generative art for the post.

For creating custom generative art, create the code for the new piece to be generated within the [pieces dir](src/lib/art/pieces/).

Then visit the post's page from the dev server and click the [art picker](src/components/ArtDevPicker.astro) button in the bottom right corner of the page. This will bring up various controls to shuffle and tune the art. For deciding between art versions, save any to favorites to make it easier to pick one at the end.

Once you have the one you like, click the copy-frontmatter button and add its frontmatter to the post. Going forward, it will have this same art every time you visit the post's page.

The art will also be used for the social link card and for the homepage list of posts. The art code for the piece itself can be adjusted further so that it animates when hovering above its thumbnail on the homepage.

Finally, when a post is ready to be made public, the file itself needs to be moved up to the parent [posts dir](src/content/posts) and the `draft` field in the frontmatter should be set to false.

## Development

Bun is used for local development. Some of the noteworthy commands include:

```bash
bun install
bun run dev        # dev server on :4321 (drafts visible)
bun run build      # production build to dist/ (drafts excluded)
bun run preview    # serve the production build
bun test           # unit tests (bun:test)
bun run check      # lint with Biome
bun run lighthouse # Lighthouse gate over dist/ (build first)
```

There are several dev related niceties in place to keep everything in order and the blog itself running smoothly:

- A [Lighthouse check](scripts/lighthouse.ts) runs in CI over every built page, ensuring no changes degrade performance
- Running the local commands `bun run lighthouse --save baseline` and then `bun run lighthouse --compare baseline` produces a per-file byte delta after changing fonts or CSS
- Broken links are checked for the [built site](.github/workflows/check.yml) and for [this README](src/lib/doc-links.test.ts)
- For security reasons, any new dependencies must wait through a 7 day [cooldown](bunfig.toml) before they can be installed
- [Fonts](scripts/build-fonts.py) are slimmed down to the weight range the site actually uses
- [KaTeX](scripts/build-katex.py) is served from `public/` so its stylesheet and font faces only load on posts that contain math
- [Generated art](src/lib/art/pinned-art.test.ts) is tested on published posts to ensure no code changes cause a drift in appearance
- [Pre-push hook](.githooks/pre-push) to block any push containing a draft post, enabled from CLI via: `git config core.hooksPath .githooks`

## License

Code is [MIT](LICENSE).

All post content, meaning [`src/content/posts/`](src/content/posts/) and `public/images/posts/`, is licensed under [CC BY 4.0](LICENSE-CONTENT).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
