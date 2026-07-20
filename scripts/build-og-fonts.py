#!/usr/bin/env -S uv run python
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.63.0"]
# ///
"""Static Newsreader instances for the OG-image renderer (resvg reads
ttf/otf, not woff2). Inputs are the site's committed variable woff2s;
outputs are build-time-only assets in src/assets/og-fonts/ (never
deployed). Rerun after regenerating the site fonts.

Both latin and latin-ext are instanced: the two subsets are DISJOINT
(latin-ext carries the Polish/Czech/Hungarian letters, latin carries the
accented Western set and the quotes), and resvg runs with system fonts
disabled, so any glyph missing from the files we hand it renders as an
empty box with no error.

The name table is rewritten deliberately to OG_FAMILY. Instancing leaves
the source's "Newsreader 16pt" in place, which is untrue once opsz is
pinned to 72/18, and the card SVGs select fonts by family name, so that
name is part of the contract with src/lib/og.ts (asserted by
src/lib/og.test.ts). Weight selection between the files still works:
they share a family and differ in usWeightClass.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

OG_FAMILY = "Newsreader OG"
SRC = Path("src/assets/fonts")
OUT = Path("src/assets/og-fonts")

# (output, source woff2, wght, opsz, subfamily)
INSTANCES = [
    ("newsreader-og-semibold.ttf", "newsreader-latin-opsz-normal.woff2", 600, 72, "SemiBold"),
    ("newsreader-og-regular.ttf", "newsreader-latin-opsz-normal.woff2", 400, 18, "Regular"),
    ("newsreader-og-semibold-ext.ttf", "newsreader-latin-ext-opsz-normal.woff2", 600, 72, "SemiBold"),
    ("newsreader-og-regular-ext.ttf", "newsreader-latin-ext-opsz-normal.woff2", 400, 18, "Regular"),
]


def set_names(font: TTFont, subfamily: str) -> None:
    """Stable family/subfamily/full/postscript names on every platform."""
    full = f"{OG_FAMILY} {subfamily}"
    for record in font["name"].names:
        if record.nameID == 1:
            record.string = OG_FAMILY
        elif record.nameID == 2:
            record.string = subfamily
        elif record.nameID == 4:
            record.string = full
        elif record.nameID == 6:
            record.string = full.replace(" ", "")


OUT.mkdir(parents=True, exist_ok=True)
for name, src, wght, opsz, subfamily in INSTANCES:
    font = TTFont(SRC / src)
    instantiateVariableFont(font, {"wght": wght, "opsz": opsz}, inplace=True)
    set_names(font, subfamily)
    font.flavor = None  # plain ttf
    out = OUT / name
    font.save(out)
    print(f"{out} {out.stat().st_size / 1024:.0f}K  {OG_FAMILY} {subfamily} wght={wght}")
