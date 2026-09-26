// ---------- preview: live scaled pages + the hidden root used by Ctrl+P ----------

const MM_TO_PX = 96 / 25.4;
const PAGE_PX = { width: 297 * MM_TO_PX, height: 210 * MM_TO_PX };
const PREVIEW_GUTTER_PX = 56;
const MIN_PREVIEW_SCALE = 0.25;

const previewRoot = () => document.getElementById("preview");
let previewFrame = 0;

function schedulePreview() {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(renderPreview);
}

function renderPreview() {
  const root = previewRoot();
  if (!hasPages()) {
    root.innerHTML = `<div class="pv-empty">${ICONS.file}<b>هنا هتشوف الصفحات زي ما هتتطبع</b><p>اختار نظام تدريب من لوحة التعديل، والمعاينة بتتحدث مع كل تعديل.</p></div>`;
    return;
  }
  const activeId = activePage().id;
  root.innerHTML = `<div class="pv-list">${paginateDoc(store.doc).map((sheet) => {
    const { page, layout } = sheet;
    const warn = layout.warnings.length
      ? `<span class="pv__warn" title="${esc(layout.warnings.join("\n"))}">${ICONS.warn}<span>${layout.warnings.length === 1 ? "تنبيه" : `${layout.warnings.length} تنبيهات`}</span></span>`
      : "";
    const part = sheet.sheetCount > 1 ? `<span class="pv__part">ورقة ${sheet.sheetIndex + 1} من ${sheet.sheetCount}</span>` : "";
    return `<figure class="pv${page.id === activeId ? " is-active" : ""}" data-page-id="${page.id}">
      <figcaption class="pv__cap"><span class="pv__num">${sheet.pageIndex + 1}</span><b>${esc(page.title) || "بدون عنوان"}</b>${part}${warn}</figcaption>
      <div class="pv__paper" role="button" tabindex="0" data-action="page-select" data-page-id="${page.id}" aria-label="تعديل صفحة ${sheet.pageIndex + 1}">
        <div class="pv__scale">${renderSheet(store.doc, sheet)}</div>
      </div>
    </figure>`;
  }).join("")}</div>`;

  if (ui.scrollPreviewTo) {
    root.querySelector(`.pv[data-page-id="${ui.scrollPreviewTo}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    ui.scrollPreviewTo = null;
  }
}

function fitPreview() {
  const root = previewRoot();
  const scale = Math.min(1, Math.max(MIN_PREVIEW_SCALE, (root.clientWidth - PREVIEW_GUTTER_PX) / PAGE_PX.width));
  root.style.setProperty("--pv-scale", scale.toFixed(4));
}

function fillPrintRoot() {
  document.getElementById("print-root").innerHTML = paginateDoc(store.doc).map((sheet) => renderSheet(store.doc, sheet)).join("");
}

function clearPrintRoot() {
  document.getElementById("print-root").innerHTML = "";
}
