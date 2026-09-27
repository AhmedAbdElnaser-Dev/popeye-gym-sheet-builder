"""Serves docs/ over HTTP and checks the PWA: service worker installs, the app reloads and
generates a PDF with the network cut, the manifest and icons resolve. Usage: .venv/Scripts/python tools/offline_check.py"""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
results = []


def check(label, ok):
    results.append((label, bool(ok)))


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def run():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(DOCS)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    try:
        time.sleep(0.8)
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge")
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(base)
            page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
            check("service worker controls the page after first visit", True)
            check("first-visit toast says it now works offline", "من غير نت" in page.locator("#toast").inner_text())
            manifest = page.evaluate("fetch('./manifest.webmanifest').then((r) => r.ok ? r.json() : null)")
            check("manifest served and valid", bool(manifest) and manifest.get("display") == "standalone" and manifest.get("dir") == "rtl")
            icons_ok = page.evaluate("Promise.all(['icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'].map((u) => fetch(u).then((r) => r.ok)))")
            check("all icons resolve", all(icons_ok))
            cache_names = page.evaluate("caches.keys()")
            check("versioned cache created", any(name.startswith("popeye-sheet-builder-") for name in cache_names))

            ctx.set_offline(True)
            page.reload()
            page.wait_for_timeout(1200)
            check("app reloads with the network cut", page.locator(".start-card").count() == 6)
            check("offline badge visible", page.locator("#net-badge").is_visible())
            page.locator('.start-card[data-key="ppl"]').click()
            page.wait_for_timeout(500)
            size = page.evaluate("generateProgramPdf(store.doc).then((b) => b.length)")
            check("PDF generated offline", size > 100_000)
            ctx.set_offline(False)
            page.wait_for_timeout(500)
            check("badge hides when back online", page.locator("#net-badge").is_hidden())
            check("no page errors", not errors)
            browser.close()
    finally:
        server.terminate()

    for label, ok in results:
        print(("PASS  " if ok else "FAIL  ") + label)
    return 1 if any(not ok for _, ok in results) else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(run())
