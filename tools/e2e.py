"""End-to-end check of the built page in real Edge. Usage: .venv/Scripts/python tools/e2e.py"""
import sys
from pathlib import Path

import pymupdf
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "dist" / "Popeye_Gym_Sheet_Builder.html").as_uri()
SHOTS = ROOT / "tools" / "shots"
SHOTS.mkdir(exist_ok=True)

results = []


def check(label, ok):
    results.append((label, bool(ok)))


def drag(page, handle, to_x, to_y, steps=40):
    """Sortable needs a real pointer path; Playwright's drag_to teleports and gets ignored."""
    box = handle.bounding_box()
    x0, y0 = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(x0 + (to_x - x0) * i / steps, y0 + (to_y - y0) * i / steps)
        page.wait_for_timeout(16)
    page.mouse.up()
    page.wait_for_timeout(450)


def root_names(editor):
    cards = editor.locator('[data-container="root"] > .card').all()
    return [card.locator("[data-prop=name], [data-prop=label]").first.input_value() for card in cards]


def download_pdf(page, name, target):
    page.locator("[data-action=download]").click()
    page.wait_for_timeout(300)
    page.locator("#dialog [name=filename]").fill(name)
    with page.expect_download(timeout=60000) as download:
        page.locator("#dialog button[value=download]").click()
    download.value.save_as(str(target))
    page.wait_for_timeout(400)
    return download.value.suggested_filename


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        errors = []
        ctx = browser.new_context(viewport={"width": 1440, "height": 1600}, accept_downloads=True)
        page = ctx.new_page()
        page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(APP)
        page.wait_for_timeout(800)
        ed = page.locator("#editor")

        # start screen
        check("start screen shows program cards", ed.locator(".start-card").count() == 6)
        check("download disabled with no pages", page.locator("[data-action=download]").is_disabled())
        check("no library button anymore", page.locator("[data-menu=library]").count() == 0)
        check("no tagline under brand", page.locator(".brand__text").count() == 0)
        ed.locator('.start-card[data-key="ppl"]').click()
        page.wait_for_timeout(600)
        check("PPL loads 3 pages", page.locator(".pv").count() == 3)
        check("first page is Push", "صدر" in ed.locator(".tab.is-active").inner_text())
        check("dirty dot shows after loading", page.locator(".app").evaluate("el => el.classList.contains('is-dirty')"))

        # superset + custom field row
        ed.locator('[data-action=item-add][data-kind=superset][data-into=""]').click()
        page.wait_for_timeout(250)
        check("focus lands on new group name", page.evaluate("document.activeElement.dataset.prop") == "label")
        kids = lambda: ed.locator(".card--group .items--nested > .card")
        kids().nth(0).locator(".in--name").fill("دمبل بنش برس")
        kids().nth(1).locator(".in--name").fill("سيتد رو كابل")
        kids().nth(1).locator("select[data-prop=mode]").select_option("fields")
        page.wait_for_timeout(200)
        check("custom mode defaults to د · كم", kids().nth(1).locator(".fchip").count() == 2)
        kids().nth(1).locator("select[data-field-add]").select_option("__new")
        page.wait_for_timeout(200)
        ed.locator("[data-new-field=abbr]").fill("نبض")
        ed.locator("[data-new-field=name]").fill("النبض")
        ed.locator("[data-new-field=name]").press("Enter")
        page.wait_for_timeout(200)
        check("new custom field attached", kids().nth(1).locator(".fchip").count() == 3)
        first_sheet = page.locator(".pv").first
        check("sheet shows «سوبر سيت A»", "سوبر سيت A" in first_sheet.inner_text())
        check("sheet numbers A1", first_sheet.locator(".num", has_text="A1").count() == 1)
        check("legend lists custom field", "النبض" in first_sheet.locator(".legend").inner_text())
        kids().nth(1).locator(".in--name").press("Enter")
        page.wait_for_timeout(250)
        check("Enter adds next exercise in group", kids().count() == 3)

        # drag reorder + undo
        ed.evaluate("el => el.scrollTop = 0")
        before = root_names(ed)
        target = ed.locator('[data-container="root"] > .card').nth(1).bounding_box()
        drag(page, ed.locator('[data-container="root"] > .card').nth(5).locator("> .card__main .grip"), target["x"] + target["width"] - 20, target["y"] + 10)
        check("drag reorders root list", root_names(ed)[1] == before[5])
        page.locator("[data-action=undo]").click()
        page.wait_for_timeout(300)
        check("undo restores order", root_names(ed) == before)

        # page settings
        ed.locator("details[data-panel=settings] > summary").click()
        ed.locator('[data-action=step][data-prop=days][data-delta="1"]').click()
        page.wait_for_timeout(250)
        check("days stepper → 9 columns", first_sheet.locator("th.day").count() == 9)
        ed.locator("select[data-prop=dayUnit]").select_option("week")
        page.wait_for_timeout(250)
        check("column unit → أسبوع", "أسبوع" in first_sheet.locator("th.day").first.inner_text())
        page.screenshot(path=str(SHOTS / "desktop-page1.png"))

        # download through the dialog → real PDF with the program inside
        pdf_path = SHOTS / "e2e-program.pdf"
        suggested = download_pdf(page, 'اختبار: أحمد/برنامج*1', pdf_path)
        check("illegal filename characters cleaned", suggested == "اختبار أحمد برنامج 1.pdf")
        check("dirty dot clears after download", not page.locator(".app").evaluate("el => el.classList.contains('is-dirty')"))
        doc = pymupdf.open(pdf_path)
        check("PDF has 3 pages", doc.page_count == 3)
        check("PDF page is A4 landscape", abs(doc[0].rect.width - 841.9) < 1 and abs(doc[0].rect.height - 595.3) < 1)
        check("PDF title carries the file name", "اختبار أحمد برنامج 1" in (doc.metadata.get("title") or ""))
        check("PDF has the program attachment", doc.embfile_count() == 1 and doc.embfile_names()[0] == "program.json")
        text = doc[0].get_text()
        check("PDF text is real, selectable Arabic", "بار فلات بنش برس" in text.replace("‏", ""))
        fonts = {f[3].split("+")[-1] for pg in doc for f in pg.get_fonts()}
        check("fonts embedded (Cairo + Lalezar)", any("Cairo" in f for f in fonts) and any("Lalezar" in f for f in fonts))
        check("PDF text has no notdef boxes", "�" not in text)

        # preview action opens the PDF in a new tab; Ctrl+S opens the dialog
        page.keyboard.press("Control+s")
        page.wait_for_timeout(300)
        check("Ctrl+S opens the download dialog", page.locator("#dialog[open]").count() == 1)
        with ctx.expect_page(timeout=60000) as popup:
            page.locator("#dialog button[value=preview]").click()
        preview_tab = popup.value
        preview_tab.wait_for_load_state()
        check("preview opens a blob PDF tab", preview_tab.url.startswith("blob:"))
        preview_tab.close()
        page.wait_for_timeout(300)

        # reset → start screen, session cleared
        page.locator("[data-action=reset]").click()
        page.wait_for_timeout(200)
        page.locator("#dialog button[value=ok]").click()
        page.wait_for_timeout(400)
        check("reset returns to start screen", ed.locator(".start").count() == 1)
        check("reset clears the session", page.evaluate("sessionStorage.getItem('popeye-sheet-builder:session')") is None)

        # open the PDF back
        page.locator("#file-input").set_input_files(str(pdf_path))
        page.wait_for_timeout(1200)
        check("opening the PDF restores 3 pages", page.locator(".pv").count() == 3)
        check("restored superset kept its rows", ed.locator(".card--group .items--nested > .card").count() == 3)
        check("restored page kept 9 weeks", first_sheet.locator("th.day").count() == 9 and "أسبوع" in first_sheet.locator("th.day").first.inner_text())
        check("opened file is not dirty", not page.locator(".app").evaluate("el => el.classList.contains('is-dirty')"))

        # foreign / broken files are refused with a message
        foreign = SHOTS / "foreign.pdf"
        blank = pymupdf.open()
        blank.new_page()
        blank.save(str(foreign))
        page.locator("#file-input").set_input_files(str(foreign))
        page.wait_for_timeout(800)
        check("foreign PDF refused", "مش متنزّل من صانع الجداول" in page.locator("#toast").inner_text())
        junk = SHOTS / "junk.pdf"
        junk.write_bytes(b"%PDF-1.4 not really a pdf")
        page.locator("#file-input").set_input_files(str(junk))
        page.wait_for_timeout(800)
        check("junk file refused", "PDF" in page.locator("#toast").inner_text())
        check("program still intact after refusals", page.locator(".pv").count() == 3)

        # session: survives reload in the same tab, gone in a new tab
        page.reload()
        page.wait_for_timeout(800)
        check("reload keeps the program (per-tab session)", page.locator(".pv").count() == 3)
        fresh = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        fresh.goto(APP)
        fresh.wait_for_timeout(600)
        check("new tab starts clean", fresh.locator(".start").count() == 1)

        # templates menu adds a page after the current one
        page.locator("[data-menu=templates] [data-menu-trigger]").click()
        page.locator('[data-action=page-add][data-key="hiit"]').click()
        page.wait_for_timeout(500)
        check("template page appended", page.locator(".pv").count() == 4)
        ed.locator(".tab").nth(3).click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS / "desktop-hiit.png"))

        # delete every page → back to start
        for _ in range(4):
            closed = ed.locator("details[data-panel=settings]:not([open]) > summary")
            if closed.count():
                closed.click()
            ed.locator("[data-action=page-delete]").click()
            page.wait_for_timeout(250)
        check("deleting the last page returns to start", ed.locator(".start").count() == 1)
        page.locator("[data-action=undo]").click()
        page.wait_for_timeout(300)
        check("undo brings the page back", page.locator(".pv").count() == 1)

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
        mobile.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
        mobile.goto(APP)
        mobile.wait_for_timeout(600)
        mobile.screenshot(path=str(SHOTS / "mobile-start.png"))
        mobile.locator('.start-card[data-key="full-body"]').click()
        mobile.wait_for_timeout(500)
        mobile.screenshot(path=str(SHOTS / "mobile-editor.png"))
        check("no sideways scroll on phone", mobile.evaluate("document.documentElement.scrollWidth") <= 390)
        mobile.locator("[data-action=view][data-view=preview]").click()
        mobile.wait_for_timeout(300)
        mobile.screenshot(path=str(SHOTS / "mobile-preview.png"))
        browser.close()

    for label, ok in results:
        print(("PASS  " if ok else "FAIL  ") + label)
    print("console errors:", errors or "none")
    failed = [label for label, ok in results if not ok]
    return 1 if failed or errors else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(run())
