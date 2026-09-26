import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "dist" / "Popeye_Gym_Sheet_Builder.html").as_uri()
JS = """
() => {
  const mm = (v) => +(v / 3.779527).toFixed(2);
  const root = document.querySelector('.print-root .sheet-page');
  const R = root.getBoundingClientRect();
  const rect = (sel) => { const el = root.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: mm(r.top - R.top), bottom: mm(r.bottom - R.top), left: mm(r.left - R.left), right: mm(r.right - R.left), h: mm(r.height) }; };
  const baseline = (sel) => { const el = root.querySelector(sel); const range = document.createRange(); range.selectNodeContents(el); const rects = [...range.getClientRects()]; return rects.length ? mm(rects[0].bottom - R.top) : null; };
  return {
    band: rect('.band'), bandText: rect('.band__text'), h1: rect('.band h1'), chips: rect('.chips'), chip1: rect('.chips li'), chip2: rect('.chips li:nth-child(2)'),
    sep: rect('.band h1 .sep'),
    exHead: rect('.ex-head'), day1: rect('.log .day'), dayNum: rect('.log .day b'), dayLabel: rect('.log .day span'), subs: rect('.log .subs th'),
    row1: rect('tbody tr'), row1title: rect('tbody tr .ex__title'), row1small: rect('tbody tr small'), row1em: rect('tbody tr small em'), num1: rect('tbody tr .num'),
    grpHead: rect('.grp-head'), grpB: rect('.grp b'), grpPill: rect('.grp span'),
    notes: rect('.notes'), notesH2: rect('.notes h2'), notesLine: rect('.notes__lines i'),
    foot: rect('.foot'), legend: rect('.legend'), brand: rect('.foot__brand'), footDot: rect('.foot__brand i'),
    tableWrap: rect('.table-wrap'),
    lineBoxes: { h1Text: baseline('.band h1'), title: baseline('tbody tr .ex__title'), dayNum: baseline('.log .day b'), dayLabel: baseline('.log .day span'), exHead: baseline('.ex-head'), grpB: baseline('.grp b') },
  };
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge"); page = b.new_page(viewport={"width": 1500, "height": 1000})
    page.goto(APP); page.wait_for_timeout(500)
    page.locator('.start-card[data-key="' + (sys.argv[1] if len(sys.argv) > 1 else "arnold") + '"]').click(); page.wait_for_timeout(500)
    page.evaluate("fillPrintRoot()")
    page.add_style_tag(content=".app{display:none!important}.print-root{display:block!important}")
    print(json.dumps(page.evaluate(JS), ensure_ascii=False, indent=0))
    b.close()
