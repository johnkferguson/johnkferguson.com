#!/usr/bin/env -S uv run python
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.63.0"]
# ///
"""One-time font pipeline: instance Newsreader's weight axis down to the
range the site uses (400-700), keeping the full optical-size axis and
the complete glyph set (no subsetting; future posts stay safe).

Rerun only when upgrading Newsreader (fetch the fontsource
variable woff2s into node_modules or a temp dir first); fonttools is
pinned exactly so committed outputs stay byte-reproducible.
Outputs to src/assets/fonts/ and prints the metrics needed for the
CSS fallback overrides.

Instanced copies are modifications under OFL 1.1, so the license must
travel with the outputs: src/assets/fonts/OFL.txt is a compliance
requirement, not decoration. Keep it beside the woff2s, and refresh
its copyright notice if an upgrade changes upstream's.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = Path("node_modules/@fontsource-variable/newsreader/files")
OUT = Path("src/assets/fonts")
FILES = [
    "newsreader-latin-opsz-normal.woff2",
    "newsreader-latin-opsz-italic.woff2",
    "newsreader-latin-ext-opsz-normal.woff2",
    "newsreader-latin-ext-opsz-italic.woff2",
]

OUT.mkdir(parents=True, exist_ok=True)

for name in FILES:
    font = TTFont(SRC / name)
    before = (SRC / name).stat().st_size
    instantiateVariableFont(font, {"wght": (400, 700)}, inplace=True)
    font.flavor = "woff2"
    out_path = OUT / name
    font.save(out_path)
    after = out_path.stat().st_size
    print(f"{name}: {before / 1024:.0f}K -> {after / 1024:.0f}K")

# metrics for fallback overrides (from the roman latin face)
font = TTFont(SRC / FILES[0])
upm = font["head"].unitsPerEm
hhea = font["hhea"]
print(
    f"metrics: upm={upm} ascent={hhea.ascent} descent={hhea.descent} "
    f"lineGap={hhea.lineGap}"
)
print(
    f"overrides (÷ size-adjust 0.88): "
    f"ascent {hhea.ascent / upm / 0.88 * 100:.2f}% "
    f"descent {abs(hhea.descent) / upm / 0.88 * 100:.2f}% "
    f"line-gap {hhea.lineGap / upm / 0.88 * 100:.2f}%"
)
