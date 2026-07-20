/**
 * The site palette, for the places that cannot read CSS.
 *
 * src/styles/colors.css is the source of truth. Three consumers need the
 * same values in JavaScript and would otherwise hardcode them: the
 * theme-color meta tag (set before paint by an inline script, so no
 * computed style exists yet), and the OG card renderer (resvg resolves no
 * custom properties). Both used to carry their own copies, and nothing
 * failed when the CSS moved out from under them.
 *
 * Entries are keyed by custom property name so palette.test.ts can check
 * them against colors.css directly, with no translation table to keep in
 * step. Only the tokens JavaScript actually consumes live here — this is
 * a mirror of the parts that are needed, not a second palette.
 */

export const palette = {
	light: {
		"--bg": "#fdfcfb",
	},
	dark: {
		"--bg": "#1c1917",
		"--heading-color": "#e6e1db",
		"--date-color": "#98928b",
		"--code-color": "#d08770",
		"--accent-green": "#a3be8c",
		"--accent-blue": "#88c0d0",
	},
} as const;

/** the pair the theme-color meta tag switches between, for define:vars */
export const themeColors = {
	light: palette.light["--bg"],
	dark: palette.dark["--bg"],
} as const;
