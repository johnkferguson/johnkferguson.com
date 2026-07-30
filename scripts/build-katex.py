#!/usr/bin/env -S uv run python
"""Copy KaTeX's stylesheet and woff2 fonts into public/katex/.

PostLayout links /katex/katex.min.css on math-bearing posts (issue #20);
the stylesheet references its faces via relative url(fonts/...), so the
layout must be preserved. Only woff2 is copied: modern browsers never
fetch the woff/ttf fallbacks listed after it in each @font-face src.
@font-face is lazy, so hosting all faces costs a visitor nothing - a
page fetches only the faces its own formulas use (see issue #23 for the
deferred subsetting analysis).

Outputs are committed. Rerun when upgrading the katex package, in the same
commit as the bump: katex 0.18.0 renamed every internal CSS class, so a stale
copy styles nothing and every formula collapses into loose characters with no
build error. src/markdown/katex-assets.test.ts fails until this is rerun.
"""

import shutil
from pathlib import Path

SRC = Path("node_modules/katex/dist")
OUT = Path("public/katex")

shutil.rmtree(OUT, ignore_errors=True)
(OUT / "fonts").mkdir(parents=True)

shutil.copy2(SRC / "katex.min.css", OUT / "katex.min.css")
fonts = sorted((SRC / "fonts").glob("*.woff2"))
for font in fonts:
    shutil.copy2(font, OUT / "fonts" / font.name)

total = sum(f.stat().st_size for f in (OUT / "fonts").iterdir())
print(f"copied katex.min.css + {len(fonts)} woff2 faces ({total / 1024:.0f} KB)")
