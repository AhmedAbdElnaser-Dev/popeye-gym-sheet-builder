"""Loads a program in the built page, downloads its PDF through the real UI, then renders
HTML preview and PDF side by side per page so the two renderers can be compared."""
import sys
from pathlib import Path

import pymupdf
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "dist" / "Popeye_Gym_Sheet_Builder.html").as_uri()
PROGRAM = sys.argv[1] if len(sys.argv) > 1 else "ppl"
STRESS = int(sys.argv[2]) if len(sys.argv) > 2 else 0  # extra exercises added to page 1
OUT = ROOT / "tools" / "shots" / (("compare" if PROGRAM == "ppl" else f"compare-{PROGRAM}") + ("-stress" if STRESS else ""))
OUT.mkdir(parents=True, exist_ok=True)
DPI = 110


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1500, "height": 1000}, accept_downloads=True, device_scale_factor=1)
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(APP)
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "00-start.png"))
        page.locator(f'.start-card[data-key="{PROGRAM}"]').click()
        page.wait_for_timeout(700)
        if STRESS:
            # overload the first page so it splits across sheets
            for _ in range(STRESS):
                page.locator('#editor [data-action=item-add][data-kind=strength][data-into=""]').click()
            page.locator('#editor [data-action=item-add][data-kind=circuit][data-into=""]').click()
            page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "01-editor.png"))

        # HTML render of every page at PDF size via the print root
        page.evaluate("fillPrintRoot()")
        page.add_style_tag(content=".app{display:none!important}.print-root{display:block!important}.print-root .sheet-page{margin:0}body{background:#fff}")
        sheets = page.locator(".print-root .sheet-page")
        count = sheets.count()
        for i in range(count):
            sheets.nth(i).screenshot(path=str(OUT / f"html-p{i + 1}.png"))
        page.evaluate("clearPrintRoot()")
        page.reload()
        page.wait_for_timeout(700)

        # PDF through the real download dialog
        page.locator("[data-action=download]").click()
        page.wait_for_timeout(300)
        page.locator("#dialog [name=filename]").fill("مقارنة")
        with page.expect_download(timeout=60000) as download:
            page.locator('#dialog button[value=download]').click()
        pdf_path = OUT / "program.pdf"
        download.value.save_as(str(pdf_path))
        print("downloaded as:", download.value.suggested_filename, f"({pdf_path.stat().st_size / 1024:.0f} KB)")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "02-after-download.png"))
        print("console:", errors or "clean")
        browser.close()

    doc = pymupdf.open(pdf_path)
    print("pdf pages:", doc.page_count, "| title:", doc.metadata.get("title"), "| embedded files:", doc.embfile_count())
    for i, pdf_page in enumerate(doc):
        pdf_page.get_pixmap(dpi=DPI).save(OUT / f"pdf-p{i + 1}.png")
        html_img = Image.open(OUT / f"html-p{i + 1}.png").convert("RGB")
        pdf_img = Image.open(OUT / f"pdf-p{i + 1}.png").convert("RGB").resize(html_img.size)
        side = Image.new("RGB", (html_img.width, html_img.height * 2 + 12), "#ff00ff")
        side.paste(html_img, (0, 0))
        side.paste(pdf_img, (0, html_img.height + 12))
        side.save(OUT / f"side-p{i + 1}.png")
    print("text sample:", doc[0].get_text()[:160].replace("\n", " | "))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    run()
