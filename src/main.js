// ---------- app shell: toolbar, menus, download / open PDF, keyboard, boot ----------

const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
const FILENAME_MAX = 80;
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
const DEFAULT_FILENAME = "برنامج تمرين";

const FILE_ERRORS = {
  "not-pdf": "الملف ده مش PDF سليم.",
  encrypted: "الملف ده محمي بكلمة سر — الصانع مش بيطلّع ملفات محمية، فده مش ملف منه.",
  "not-ours": "الملف ده مش متنزّل من صانع الجداول — مفيش بيانات برنامج جواه.",
  corrupt: "بيانات البرنامج جوه الملف بايظة أو اتعدلت.",
  newer: "الملف ده متعمول بنسخة أحدث من الصانع.",
};

const MENUS = {
  templates: renderTemplatesMenu,
  "add-page": renderAddPageMenu,
};

/** Isolates a name inside Arabic copy so Latin titles and digits don't get pulled around by bidi. */
const iso = (value) => `\u2068${value}\u2069`;

function menuItem(action, key, title, hint) {
  return `<button type="button" class="menu__item" data-action="${action}" data-key="${key}"><b>${esc(title)}</b><span>${esc(hint)}</span></button>`;
}

function renderTemplatesMenu() {
  return `<div class="menu__section"><h3>قوالب الصفحات${hasPages() ? " — بتتضاف بعد الصفحة الحالية" : ""}</h3>
      ${PAGE_PRESETS.map((preset) => menuItem("page-add", preset.key, preset.title, preset.hint)).join("")}</div>`;
}

function renderAddPageMenu() {
  const blank = pagePreset("blank");
  const rest = PAGE_PRESETS.filter((preset) => preset !== blank);
  return `<div class="menu__section"><h3>صفحة جديدة بعد الحالية</h3>
    ${[blank, ...rest].map((preset) => menuItem("page-add", preset.key, preset.title, preset.hint)).join("")}</div>`;
}

// ---------- programs ----------

async function loadProgram(key) {
  const preset = programPreset(key);
  if (!preset) return;
  if (hasPages() && store.dirty) {
    const ok = await confirmDialog({
      title: `تفتح «${iso(preset.title)}»؟`,
      body: "البرنامج الحالي فيه تعديلات لسه متنزلتش. لو كملت هيتستبدل، وتقدر ترجعه بزرار تراجع.",
      okLabel: "استبدل",
      okIcon: "layers",
      danger: false,
    });
    if (!ok) return;
  }
  replaceDoc(buildProgram(preset));
  showToast(`اتفتح «${iso(preset.title)}» — ${preset.pages.length === 1 ? "صفحة واحدة" : `${preset.pages.length} صفحات`}`, { label: "تراجع", run: undo });
}

async function resetAll() {
  if (!hasPages()) return;
  const ok = await confirmDialog({
    title: "تبدأ من الأول؟",
    body: store.dirty
      ? "كل الصفحات والتعديلات الحالية هتتمسح، ومفيش تراجع بعدها. لو عايز تحتفظ بالبرنامج نزّله PDF الأول."
      : "كل الصفحات الحالية هتتمسح، ومفيش تراجع بعدها. النسخة اللي نزّلتها PDF لسه عندك.",
    okLabel: "امسح وابدأ من الأول",
    okIcon: "reset",
  });
  if (!ok) return;
  resetStore();
  showToast("اتمسح كل حاجة — اختار نظام تدريب أو صفحة فاضية");
}

// ---------- open PDF ----------

async function importPdf(file) {
  if (!file) return;
  if (document.getElementById("dialog").open) {
    showToast("اقفل النافذة المفتوحة الأول");
    return;
  }
  if (file.size > MAX_IMPORT_BYTES) {
    showToast("الملف كبير أوي — مش شكل ملف من الصانع");
    return;
  }
  showToast(`جارٍ فتح «${iso(file.name)}»…`);
  let program;
  try {
    program = await readProgramFromPdf(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    showToast(FILE_ERRORS[error.code] || "مقدرتش أقرأ الملف ده.");
    return;
  }
  if (hasPages() && store.dirty) {
    const ok = await confirmDialog({
      title: `تفتح «${iso(file.name)}»؟`,
      body: "البرنامج الحالي فيه تعديلات لسه متنزلتش. لو كملت هيتستبدل، وتقدر ترجعه بزرار تراجع.",
      okLabel: "افتح",
      okIcon: "open",
      danger: false,
    });
    if (!ok) return;
  }
  replaceDoc(program.doc, { dirty: false });
  const count = program.doc.pages.length;
  showToast(`اتفتح «${iso(program.doc.name || file.name)}» — ${count === 1 ? "صفحة واحدة" : `${count} صفحات`}`, { label: "تراجع", run: undo });
}

// ---------- download PDF ----------

function cleanFilename(raw) {
  const name = String(raw ?? "").replace(ILLEGAL_FILENAME_CHARS, " ").replace(/\s+/g, " ").trim().replace(/\.pdf$/i, "").slice(0, FILENAME_MAX).trim();
  return name || DEFAULT_FILENAME;
}

function suggestedFilename() {
  const program = store.doc.name || store.doc.pages.map((page) => page.title).join(" - ");
  return cleanFilename([store.doc.trainee.trim(), program].filter(Boolean).join(" - "));
}

async function openDownloadDialog() {
  if (!hasPages()) return;
  const crowded = store.doc.pages.filter((page) => layoutPage(store.doc, page).warnings.length);
  const warnings = crowded.length
    ? `<ul class="warns">${crowded.map((page) => `<li>${ICONS.warn}<span>صفحة «${esc(page.title)}»: ${esc(layoutPage(store.doc, page).warnings[0])}</span></li>`).join("")}</ul>`
    : "";
  const total = paginateDoc(store.doc).length;
  const spread = store.doc.pages.filter((page) => layoutPage(store.doc, page).sheetCount > 1);
  const sheetsNote = `<p class="dlg__hint">الملف: ${esc(sheetsLabel(total))}${spread.length ? ` — ${spread.map((page) => `«${esc(page.title)}» على ${esc(sheetsLabel(layoutPage(store.doc, page).sheetCount))}`).join("، ")}` : ""}.</p>`;
  const result = await openDialog({
    title: "تنزيل PDF",
    body: `
      <label class="fld"><span class="fld__label">اسم الملف</span>
        <span class="file-name"><input class="in" name="filename" value="${esc(suggestedFilename())}" maxlength="${FILENAME_MAX}" autocomplete="off" spellcheck="false"><span class="file-name__ext">.pdf</span></span>
      </label>
      ${warnings}
      ${sheetsNote}
      <p class="dlg__hint">الملف جاهز للطباعة، وجواه بيانات البرنامج — تقدر تفتحه تاني من «فتح PDF» وتكمل تعديل.</p>`,
    actions: [
      { value: "cancel", label: "إلغاء" },
      { value: "preview", label: "عرض الملف", icon: "eye" },
      { value: "download", label: "تنزيل", icon: "download", primary: true, autofocus: true },
    ],
    onOpen: (dialog) => {
      const input = dialog.querySelector("[name=filename]");
      input.focus();
      input.select();
    },
  });
  if (result.value === "cancel") return;
  const filename = cleanFilename(result.form.querySelector("[name=filename]").value);
  if (filename !== store.doc.name) setDocName(filename);
  await producePdf(filename, result.value === "preview");
}

function setDocName(name) {
  store.doc.name = name;
  writeSession();
}

let producing = false;

async function producePdf(filename, preview) {
  if (producing) return;
  producing = true;
  const button = document.querySelector("[data-action=download]");
  const label = button.querySelector("span:not(.dirty-dot)");
  const originalLabel = label.textContent;
  button.disabled = true;
  label.textContent = "جارٍ التجهيز…";
  try {
    const bytes = await generateProgramPdf(store.doc);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (preview) {
      const opened = window.open(url, "_blank");
      if (!opened) showToast("المتصفح منع فتح التبويب — اسمح بالنوافذ المنبثقة أو نزّل الملف");
    } else {
      const link = Object.assign(document.createElement("a"), { href: url, download: `${filename}.pdf` });
      document.body.append(link);
      link.click();
      link.remove();
      markSaved();
      showToast(`اتنزّل «${iso(`${filename}.pdf`)}» — ${(blob.size / 1024).toFixed(0)} كيلوبايت`);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    console.error(error);
    showToast("حصلت مشكلة وإحنا بنجهز الملف — جرب تاني");
  } finally {
    producing = false;
    button.disabled = !hasPages();
    label.textContent = originalLabel;
  }
}

// ---------- actions ----------

const APP_ACTIONS = {
  undo: () => undo() || showToast("مفيش حاجة ترجعلها"),
  redo: () => redo() || showToast("مفيش حاجة تعيدها"),
  download: openDownloadDialog,
  open: () => document.getElementById("file-input").click(),
  reset: resetAll,
  "page-select": (el) => {
    if (el.classList.contains("tab")) ui.scrollPreviewTo = el.dataset.pageId;
    setActivePage(el.dataset.pageId);
  },
  "page-add": (el) => {
    closeMenus();
    addPage(el.dataset.key);
  },
  "program-load": (el) => {
    closeMenus();
    loadProgram(el.dataset.key);
  },
  view: (el) => setView(el.dataset.view),
};

function setView(view) {
  document.querySelector(".workspace").dataset.view = view;
  document.querySelectorAll("[data-action=view]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.view === view)));
  if (view === "preview") fitPreview();
}

function updateChrome() {
  document.querySelector("[data-action=undo]").disabled = !store.past.length && !store.burstSnapshot;
  document.querySelector("[data-action=redo]").disabled = !store.future.length;
  document.querySelector("[data-action=download]").disabled = !hasPages() || producing;
  document.querySelector("[data-action=reset]").disabled = !hasPages();
  const dirty = store.dirty && hasPages();
  document.querySelector(".app").classList.toggle("is-dirty", dirty);
  const download = document.querySelector("[data-action=download]");
  download.setAttribute("aria-label", dirty ? "تنزيل PDF — في تعديلات لسه متنزلتش" : "تنزيل PDF");
}

function updateTabTitles() {
  document.querySelectorAll("[data-tab-title]").forEach((el) => {
    const page = store.doc.pages.find((candidate) => candidate.id === el.dataset.tabTitle);
    if (page) el.textContent = page.title || "بدون عنوان";
  });
}

function bindAppEvents() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-menu-trigger]");
    if (trigger) {
      const menu = trigger.closest("[data-menu]");
      toggleMenu(menu, MENUS[menu.dataset.menu]);
      return;
    }
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    (EDITOR_ACTIONS[el.dataset.action] || APP_ACTIONS[el.dataset.action])?.(el);
  });

  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === "Enter" || event.key === " ") {
      if (event.target.matches("[role=button][data-action]")) {
        event.preventDefault();
        event.target.click();
      }
      return;
    }
    if (!mod || event.altKey || document.getElementById("dialog").open) return;
    // event.code is layout-independent: an Arabic keyboard reports "ئ" for the Z key
    if (event.code === "KeyS") {
      event.preventDefault();
      openDownloadDialog();
    } else if (event.code === "KeyO") {
      event.preventDefault();
      APP_ACTIONS.open();
    } else if (event.code === "KeyZ" || event.code === "KeyY") {
      // app-level history everywhere, including inside inputs: a typing burst is one step
      event.preventDefault();
      if (event.code === "KeyY" || event.shiftKey) APP_ACTIONS.redo();
      else APP_ACTIONS.undo();
    }
  });

  document.getElementById("file-input").addEventListener("change", (event) => {
    importPdf(event.target.files[0]);
    event.target.value = "";
  });

  // dropping a downloaded PDF anywhere opens it
  document.addEventListener("dragover", (event) => {
    if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    importPdf(file);
  });

  window.addEventListener("beforeunload", (event) => {
    if (!store.dirty || !hasPages()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("beforeprint", fillPrintRoot);
  window.addEventListener("afterprint", clearPrintRoot);
  new ResizeObserver(fitPreview).observe(previewRoot());
}

// ---------- offline: service worker for the hosted build, network badge everywhere ----------

function updateNetworkBadge() {
  document.getElementById("net-badge").hidden = navigator.onLine;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const firstVisit = !navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || firstVisit) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register("./sw.js").then((registration) => {
    const offerUpdate = (worker) => showToast("في نسخة أحدث من الصانع", { label: "تحديث", run: () => worker.postMessage("skip-waiting") });
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
  }).catch(() => {});

  if (firstVisit) {
    navigator.serviceWorker.ready.then(() => showToast("الصانع بقى شغال من غير نت على الجهاز ده — وتقدر تضيفه للشاشة الرئيسية"));
  }
}

/** The same font bytes feed the screen (FontFace) and the PDF (pdf-lib). */
async function loadFonts() {
  const faces = Object.entries(FONT_SPECS).map(([key, [family, weight]]) => new FontFace(family, fontBytes(key), { weight: String(weight) }));
  faces.forEach((face) => document.fonts.add(face));
  await Promise.all(faces.map((face) => face.load()));
}

async function boot() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.outerHTML = ICONS[el.dataset.icon];
  });
  document.getElementById("brand-logo").src = BANNER_SRC;
  await loadFonts();

  initStore();
  subscribe((kind) => {
    updateChrome();
    if (kind === "saved") return;
    if (kind === "text") {
      updateTabTitles();
      syncInfoToggle();
      schedulePreview();
      return;
    }
    renderEditor();
    renderPreview();
  });

  bindEditorEvents();
  bindAppEvents();
  renderEditor();
  renderPreview();
  fitPreview();
  updateChrome();
  setView("editor");

  window.addEventListener("online", updateNetworkBadge);
  window.addEventListener("offline", updateNetworkBadge);
  updateNetworkBadge();
  registerServiceWorker();
}

boot();
