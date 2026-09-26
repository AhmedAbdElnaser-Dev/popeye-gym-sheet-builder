# Popeye Gym — Sheet Builder

A single offline HTML page. The trainer picks a training system, edits it, and downloads a print-ready PDF (A4 landscape, Arabic, RTL). The PDF carries the program data inside it, so opening that PDF in the builder restores the program for further editing.

**Live:** https://ahmedabdelnaser-dev.github.io/popeye-gym-sheet-builder/ (GitHub Pages, served from `docs/`).

**Offline:** save that page (or `dist/Popeye_Gym_Sheet_Builder.html`) and open it in Chrome or Edge. No install.

## Flow

1. **Start screen** — pick a program (Push/Pull/Legs, Upper/Lower, Full Body, Arnold, Bro Split, هجين + كارديو) or a blank page, or open a saved PDF.
2. **Edit** — pages, rows, groups, fields; live preview on the left.
3. **تنزيل PDF** — the red button asks for a file name, then downloads `name.pdf`. That also marks the work as saved.
4. **فتح PDF** — opens a PDF made by this builder (toolbar button, start screen, or drag a PDF onto the page). Files that aren't from the builder are refused with a message.
5. **إعادة ضبط** — wipes everything and returns to the start screen.

Work is kept per browser tab (`sessionStorage`): it survives a reload, not closing the tab. An amber dot on the download button means there are changes that haven't been downloaded yet, and closing the tab asks for confirmation in that state.

## How a sheet is modelled

- **Program (doc):** `name` + pages + custom fields.
- **Page:** title (a `/` renders as the red separator), chips, column count (1–14) and unit (يوم / أسبوع / جلسة / custom), base fields, optional notes box and trainee strip.
- **Exercise row:** logs one of four ways — `default` (page fields), `fields` (its own, e.g. cardio د · كم), `tick` (one checkbox per column), `blank` (free cell).
- **Group:** superset / circuit / section; `rounds > 0` adds a rounds row; `letters` numbers rows A1, A2 …
- **Row heights** auto-fit the page; the editor warns when a page is too crowded or a cell gets narrower than 5.5 mm.

## The PDF

`src/pdf.js` draws the same layout as the HTML preview with pdf-lib + fontkit: real vector text (selectable, searchable), subset-embedded Cairo and Lalezar, the band background rasterised from the same gradients. Arabic shaping comes from fontkit; run ordering (digits inside Arabic, brackets, mixed Latin) from `src/bidi.js`.

The program is stored twice in the file:
- `Info` dictionary key `PopeyeSheets` = `deflate:<base64 JSON>` (what the builder reads back), and
- an attachment `program.json` visible in Acrobat's attachments panel.

`readProgramFromPdf()` validates the payload (`app` id, format version, `normalizeDoc`) before loading it. `normalizeDoc` re-keys any custom field whose key is not our own `c_xxxx` shape, caps text lengths, flattens groups nested in groups, keeps valid ids (so the active page survives a reload) and never trusts prototype names (`constructor`, …) as lookups.

Text direction: content strings (names, targets, chips, titles) resolve direction from their first strong character, like `dir="auto"`, in both renderers — so `4 × 6-8` reads as sets × reps inside the RTL sheet. Numeric ranges use a hyphen-minus (`6-8`), not an en dash, because UAX#9 flips `6–8` in RTL text.

## Develop

```
python -m venv .venv
.venv/Scripts/python -m pip install playwright fonttools brotli pillow pymupdf
.venv/Scripts/python build.py         # src/ + assets/ -> dist/Popeye_Gym_Sheet_Builder.html
.venv/Scripts/python tools/e2e.py     # drives the built page in Edge: editing, download, re-open, reset, session
.venv/Scripts/python tools/compare.py ppl   # HTML preview vs generated PDF, side by side, per page
node tools/bidi_check.mjs             # bidi ordering cases (incl. N0 bracket pairs)
.venv/Scripts/python tools/bidi_oracle.py "نص"   # browser as referee for a string's visual order
```

- **`src/` in load order:** `model.js` (data, factories, normalisation) → `presets.js` (catalog) → `sheet.js` (layout math + HTML renderer) → `bidi.js` → `pdf.js` → `store.js` (undo, per-tab session) → `ui.js` (icons, toasts, menus, dialogs) → `editor.js` → `preview.js` → `main.js`.
- **Styles:** `sheet.css` is the printed design; `app.css` the builder UI. When you change a sheet size in one place, change it in `SHEET` (sheet.js) and `pdf.js` too.
- **Build:** subsets the fonts with fontTools (hinting stripped — pdf-lib's own subsetter chokes on Lalezar's instructions), inlines pdf-lib, fontkit, SortableJS and the banner. Output is ~2 MB and fully offline.
