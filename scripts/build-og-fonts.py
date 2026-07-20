#!/usr/bin/env -S uv run python
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.63.0"]
# ///
"""Static Newsreader instances for the OG-image renderer (resvg reads
ttf/otf, not woff2). Inputs are the site's committed variable woff2s;
outputs are build-time-only assets in src/assets/og-fonts/ (never
deployed). Rerun after regenerating the site fonts."""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = Path("src/assets/fonts/newsreader-latin-opsz-normal.woff2")
OUT = Path("src/assets/og-fonts")
OUT.mkdir(parents=True, exist_ok=True)

# (name, wght, opsz): display cut for the big title, text cut for the rest
INSTANCES = [
    ("newsreader-og-semibold.ttf", 600, 72),
    ("newsreader-og-regular.ttf", 400, 18),
]

for name, wght, opsz in INSTANCES:
    font = TTFont(SRC)
    instantiateVariableFont(font, {"wght": wght, "opsz": opsz}, inplace=True)
    font.flavor = None  # plain ttf
    out = OUT / name
    font.save(out)
    print(f"{out} {out.stat().st_size / 1024:.0f}K")
