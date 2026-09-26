"""Bundles src/ + assets/ into one offline HTML file: dist/Popeye_Gym_Sheet_Builder.html."""
import base64
import io
import json
from pathlib import Path

from fontTools import subset
from PIL import Image

ROOT = Path(__file__).parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
OUT = ROOT / "dist" / "Popeye_Gym_Sheet_Builder.html"
PAGES_OUT = ROOT / "docs" / "index.html"  # what GitHub Pages serves

# concatenation order matters: later files use globals from earlier ones
JS_FILES = ["model.js", "presets.js", "sheet.js", "bidi.js", "pdf.js", "store.js", "ui.js", "editor.js", "preview.js", "main.js"]
FONTS = {
    "cairo400": "Cairo-400.ttf",
    "cairo600": "Cairo-600.ttf",
    "cairo700": "Cairo-700.ttf",
    "cairo800": "Cairo-800.ttf",
    "lalezar": "Lalezar.ttf",
}
# Latin, Arabic (+ presentation forms), general punctuation, ×, ÷, bullets
FONT_UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x600, 0x700)) + list(range(0x750, 0x780))
    + list(range(0xFB50, 0xFE00)) + list(range(0xFE70, 0xFF00)) + list(range(0x2000, 0x2070)) + [0x2212, 0x2022, 0x2026, 0x2713, 0x2714]
)
BANNER_QUALITY = 90


def subset_font(path):
    """Strips hinting (pdf-lib's subsetter chokes on Lalezar's instructions) and unused scripts."""
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.hinting = False
    options.glyph_names = False
    font = subset.load_font(str(path), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=FONT_UNICODES)
    subsetter.subset(font)
    buffer = io.BytesIO()
    subset.save_font(font, buffer, options)
    return buffer.getvalue()


def font_data():
    return {key: base64.b64encode(subset_font(ASSETS / "fonts" / file)).decode() for key, file in FONTS.items()}


def banner_data_url():
    buffer = io.BytesIO()
    Image.open(ASSETS / "banner.png").save(buffer, "WEBP", quality=BANNER_QUALITY, method=6)
    return f"data:image/webp;base64,{base64.b64encode(buffer.getvalue()).decode()}"


def read(path):
    return path.read_text(encoding="utf-8")


def build():
    html = read(SRC / "index.html")
    replacements = {
        "{{SHEET_CSS}}": read(SRC / "sheet.css"),
        "{{APP_CSS}}": read(SRC / "app.css"),
        "{{PDFLIB_JS}}": read(ASSETS / "lib" / "pdf-lib.min.js"),
        "{{FONTKIT_JS}}": read(ASSETS / "lib" / "fontkit.umd.min.js"),
        "{{SORTABLE_JS}}": read(ASSETS / "sortable.min.js"),
        "{{BANNER_SRC}}": banner_data_url(),
        "{{FONT_DATA}}": json.dumps(font_data()),
        "{{APP_JS}}": "\n".join(read(SRC / name) for name in JS_FILES),
    }
    for token, value in replacements.items():
        html = html.replace(token, value, 1)
    for target in (OUT, PAGES_OUT):
        target.parent.mkdir(exist_ok=True)
        target.write_text(html, encoding="utf-8")
    print(f"{OUT} ({OUT.stat().st_size / 1024:.0f} KB) + {PAGES_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
