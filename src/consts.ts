import { palette } from "./lib/palette";

export const SITE_NAME = "John K. Ferguson";
export const SITE_TAGLINE =
	"Markets, mechanism design, and software development";
/* the markup default; the inline theme script corrects it to the light
 * value before paint when that is the resolved theme */
export const THEME_COLOR = palette.dark["--bg"];
export const SITE_DESCRIPTION =
	"Personal website and blog of John K. Ferguson. Writing on markets, mechanism design, and software development.";
export const TWITTER_HANDLE = "@johnkferguson";
/* Card pixel size, declared here rather than in lib/og.ts so Head.astro
 * can advertise og:image:width/height without importing the renderer
 * (og.ts loads the native resvg binding at module top). lib/og.ts folds
 * this into its OG object, so the two cannot drift. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
/* Where the two card routes live, as URL paths. The classifier in
 * lib/card-meta.ts matches against these rather than repeating the
 * literals, so renaming a route cannot silently drop a card's alt text
 * and dimensions. card-meta.test.ts asserts each still resolves to a
 * real file under src/pages/. */
export const SITE_CARD_PATH = "/assets/og-image.png";
export const POST_CARD_PREFIX = "/assets/og/";
