"""Browser as referee: visual char order of strings under dir=rtl vs bidiRuns() from the built page."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "dist" / "Popeye_Gym_Sheet_Builder.html").as_uri()
CASES = sys.argv[1:] or ["بنش (Bench) 3 × 10", "كارديو (HIIT) x", "(30 ثانية) راحة", "يوم 12", "4 × 6-8", "راحة 2-3 دقائق", "Bench Press 3 × 10 كجم", "3 جولات", "2 × لحد الفشل"]
JS = r"""
(cases) => cases.map((text) => {
  const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
  const base = resolveDirection(text, "auto");
  const host = document.createElement("div");
  host.dir = base ? "rtl" : "ltr"; host.style.cssText = "position:absolute;top:0;left:0;font:16px Cairo;white-space:pre;";
  const chars = [...text];
  host.innerHTML = chars.map((c, i) => `<span data-i="${i}">${c.replace(/</g, "&lt;")}</span>`).join("");
  document.body.append(host);
  const order = [...host.querySelectorAll("span")].map((s) => ({ i: +s.dataset.i, x: s.getBoundingClientRect().left, c: s.textContent })).sort((a, b) => a.x - b.x);
  host.remove();
  const browser = order.map((o) => o.c).join("");
  const mine = bidiRuns(text, base).map((r) => (RTL.test(r.text) ? [...r.text].reverse().join("") : r.text)).join("");
  return { text, base, browser, mine, same: browser === mine };
})
"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge"); page = b.new_page()
    page.goto(APP); page.wait_for_timeout(600)
    sys.stdout.reconfigure(encoding="utf-8")
    for r in page.evaluate(JS, CASES):
        print(("SAME " if r["same"] else "DIFF ") + json.dumps(r["text"], ensure_ascii=False), "| browser:", json.dumps(r["browser"], ensure_ascii=False), "| mine:", json.dumps(r["mine"], ensure_ascii=False))
    # footer brand extents in the HTML print root
    page.locator('.start-card[data-key="arnold"]').click(); page.wait_for_timeout(500)
    page.evaluate("fillPrintRoot()")
    page.add_style_tag(content=".app{display:none!important}.print-root{display:block!important}")
    ext = page.evaluate("""() => {
      const root = document.querySelector('.print-root .sheet-page'); const R = root.getBoundingClientRect();
      const mm = (v) => +((v - R.left) / 3.779527).toFixed(2);
      const brand = root.querySelector('.foot__brand'); const out = [];
      for (const node of brand.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(node); const b = r.getBoundingClientRect(); out.push([node.textContent.trim(), mm(b.left), mm(b.right)]); }
        else if (node.nodeType === 1) { const b = node.getBoundingClientRect(); out.push(['dot', mm(b.left), mm(b.right)]); }
      }
      return out;
    }""")
    print("HTML footer brand extents (mm):", ext)
    b.close()
