// ---------- editor panel: page tabs, page settings, exercise cards ----------

const ui = {
  settingsOpen: false,
  newFieldFor: null, // "page" or an exercise id while the "new field" form is open
  focusNext: null,
  scrollPreviewTo: null,
};

const CARDIO_DEFAULT_FIELDS = ["min", "km"];
const ADD_KINDS = {
  strength: { label: "تمرين حديد", icon: "dumbbell", make: () => newExercise() },
  cardio:   { label: "كارديو",     icon: "run",      make: () => newExercise({ mode: "fields", fields: [...CARDIO_DEFAULT_FIELDS] }) },
  tick:     { label: "علامة ✓",    icon: "check",    make: () => newExercise({ mode: "tick" }) },
  superset: { label: "سوبر سيت",   icon: "link",     make: () => newGroup("superset") },
  circuit:  { label: "دايرة بجولات", icon: "repeat", make: () => newGroup("circuit") },
  section:  { label: "قسم",        icon: "section",  make: () => newGroup("section") },
};
const ROOT_ADD_KINDS = ["strength", "cardio", "tick", "superset", "circuit", "section"];
const GROUP_ADD_KINDS = ["strength", "cardio", "tick"];

const editorRoot = () => document.getElementById("editor");

// ---------- render ----------

function renderEditor() {
  const root = editorRoot();
  if (!hasPages()) {
    root.innerHTML = renderStart();
    return;
  }
  const saved = captureFocus(root);
  const page = activePage();
  const layout = layoutPage(store.doc, page);

  root.innerHTML = `${renderTabs()}${renderProgramPanel()}${renderSettings(page, layout)}${renderItemsPanel(page, layout)}`;
  root.querySelector("details[data-panel=settings]").addEventListener("toggle", (event) => {
    ui.settingsOpen = event.target.open;
  });
  bindSortables(root);

  if (ui.focusNext) {
    const target = root.querySelector(`[data-focus="${CSS.escape(ui.focusNext)}"]`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    ui.focusNext = null;
  } else {
    restoreFocus(root, saved);
  }
}

function renderStart() {
  const cards = PROGRAM_PRESETS.map((preset) => {
    const pages = preset.pages.map((key) => pagePreset(key).build().title);
    const count = pages.length === 1 ? "صفحة واحدة" : pages.length === 2 ? "صفحتين" : `${pages.length} صفحات`;
    return `<button type="button" class="start-card" data-action="program-load" data-key="${preset.key}">
      <b>${esc(preset.title)}</b><span>${esc(preset.hint)}</span>
      <small>${count} · ${esc(pages.join(" · "))}</small></button>`;
  }).join("");
  return `<section class="start" aria-labelledby="start-title">
    <div class="start__hero">
      <h2 id="start-title">ابدأ برنامج جديد</h2>
      <p>اختار نظام تدريب جاهز وعدّل عليه براحتك، أو ابدأ من صفحة فاضية.</p>
    </div>
    <div class="start__grid">${cards}</div>
    <div class="start__alt">
      <button type="button" class="btn btn--ghost" data-action="page-add" data-key="blank">${ICONS.plus}<span>صفحة فاضية</span></button>
      <button type="button" class="btn btn--ghost" data-action="open">${ICONS.open}<span>فتح PDF محفوظ</span></button>
    </div>
  </section>`;
}

function renderTabs() {
  const tabs = store.doc.pages.map((page, index) => {
    const selected = page.id === store.activePageId;
    const layout = layoutPage(store.doc, page);
    const warned = layout.warnings.length > 0;
    const sheets = layout.sheetCount > 1 ? `<span class="tab__sheets" title="بتتطبع على ${esc(sheetsLabel(layout.sheetCount))}">×${layout.sheetCount}</span>` : "";
    return `<button type="button" class="tab${selected ? " is-active" : ""}"${selected ? ' aria-current="true"' : ""}
      data-action="page-select" data-page-id="${page.id}" data-focus="tab:${page.id}" title="${esc(page.title)}">
      <span class="tab__num">${index + 1}</span><span class="tab__title" data-tab-title="${page.id}">${esc(page.title) || "بدون عنوان"}</span>${sheets}
      ${warned ? `<span class="tab__warn" role="img" aria-label="في تنبيه على الصفحة دي" title="في تنبيه على الصفحة دي">${ICONS.warn}</span>` : ""}</button>`;
  }).join("");
  return `<div class="tabs-bar">
    <nav class="tabs" aria-label="صفحات الجدول">${tabs}</nav>
    <div class="menu" data-menu="add-page">
      <button type="button" class="btn btn--ghost btn--sm" data-menu-trigger aria-expanded="false"${store.doc.pages.length >= MAX_PAGES ? " disabled" : ""}>${ICONS.plus}<span>صفحة</span></button>
      <div class="menu__panel"></div>
    </div>
  </div>`;
}

function renderProgramPanel() {
  const field = (prop, label, placeholder) => `<label class="fld">
      <span class="fld__label">${label}</span>
      <input class="in in--sm" dir="auto" data-scope="doc" data-prop="${prop}" data-focus="doc:${prop}" value="${esc(store.doc[prop])}" maxlength="${TEXT_LIMIT.person}" placeholder="${placeholder}" autocomplete="off">
    </label>`;
  const date = (prop, label) => `<label class="fld">
      <span class="fld__label">${label}</span>
      <input class="in in--sm in--date" type="date" data-scope="doc" data-prop="${prop}" data-focus="doc:${prop}" value="${esc(store.doc[prop])}">
    </label>`;
  return `<section class="panel panel--program" aria-label="بيانات البرنامج">
    <div class="program">
      ${field("trainee", "اسم المتدرب", "يتطبع على كل الصفحات")}
      ${field("coach", "اسم المدرب", "اختياري")}
      ${date("startDate", "بداية البرنامج")}
      ${date("endDate", "نهاية البرنامج")}
    </div>
    <p class="fld__hint">بتتطبع في سطر فوق الجدول في كل صفحة. اللي تسيبه فاضي مش بيتطبع — ولو سبت الكل فاضي تقدر تطبع خطوط للكتابة بالإيد من إعدادات الصفحة.</p>
  </section>`;
}

/** Typing names doesn't re-render the editor; keep the info-strip checkbox honest anyway. */
function syncInfoToggle() {
  const box = editorRoot().querySelector("[data-prop=showTrainee]");
  const page = activePage();
  if (!box || !page) return;
  const automatic = showsInfo(store.doc, page) && !page.showTrainee;
  box.disabled = automatic;
  box.title = automatic ? "بيظهر تلقائيًا لأن الأسماء مكتوبة" : "";
}

function renderSettings(page, layout) {
  const pageIndex = store.doc.pages.indexOf(page);
  const pageCount = store.doc.pages.length;
  const unit = dayUnitOf(page);
  const firstSheet = layout.sheets[0];
  const summary = [formatDayCount(page), firstSheet.hasSubHead ? firstSheet.columns.map((column) => column.abbr).join(" · ") : "من غير خانات"];
  if (layout.sheetCount > 1) summary.push(sheetsLabel(layout.sheetCount));
  const rowRange = [...new Set(layout.rowHeights.map((h) => h.toFixed(1)))].sort((a, b) => a - b);

  return `<details class="panel" data-panel="settings"${ui.settingsOpen ? " open" : ""}>
    <summary class="panel__head">
      <h2>إعدادات الصفحة</h2>
      <span class="panel__meta">${summary.map(esc).join(" — ")}</span>
      <span class="panel__chev">${ICONS.chevron}</span>
    </summary>
    <div class="panel__body">
      <label class="fld">
        <span class="fld__label">العنوان</span>
        <input class="in" dir="auto" data-scope="page" data-prop="title" data-focus="page:title" value="${esc(page.title)}" maxlength="${TEXT_LIMIT.title}" placeholder="مثلاً شيست / ظهر">
        <span class="fld__hint">اكتب <b>/</b> بين الكلمتين عشان يظهر الفاصل الأحمر</span>
      </label>

      <div class="fld">
        <span class="fld__label">الشارات تحت العنوان</span>
        <div class="chips-edit">
          <label class="check check--pill"><input type="checkbox" data-scope="page" data-prop="showDaysChip"${page.showDaysChip ? " checked" : ""}><span>${esc(formatDayCount(page))}</span></label>
          ${page.chips.map((chip, index) => `<span class="tchip">
            <input class="tchip__in" dir="auto" data-scope="chip" data-index="${index}" data-focus="chip:${index}" value="${esc(chip)}" placeholder="اكتب الشارة" aria-label="شارة ${index + 1}">
            <button type="button" class="icon-btn icon-btn--xs" data-action="chip-remove" data-index="${index}" data-focus="chip-remove:${index}" aria-label="شيل الشارة">${ICONS.x}</button>
          </span>`).join("")}
          <button type="button" class="btn btn--ghost btn--xs" data-action="chip-add">${ICONS.plus}<span>شارة</span></button>
        </div>
      </div>

      <div class="fld-row">
        <div class="fld">
          <span class="fld__label">عدد الأعمدة</span>
          ${stepper({ scope: "page", prop: "days", value: page.days, min: MIN_DAYS, max: MAX_DAYS, label: "عدد الأعمدة" })}
        </div>
        <div class="fld">
          <span class="fld__label">العمود بيتسمى</span>
          <div class="inline">
            <select class="sel" data-scope="page" data-prop="dayUnit" data-focus="page:dayUnit" aria-label="اسم العمود">
              ${[["day", "يوم"], ["week", "أسبوع"], ["session", "جلسة"], ["custom", "اسم تاني…"]].map(([value, label]) =>
                `<option value="${value}"${page.dayUnit === value ? " selected" : ""}>${label}</option>`).join("")}
            </select>
            ${page.dayUnit === "custom" ? `<input class="in in--sm" data-scope="page" data-prop="customDayLabel" data-focus="page:customDayLabel" value="${esc(page.customDayLabel)}" placeholder="مثلاً تمرين" aria-label="اسم العمود">` : ""}
          </div>
        </div>
      </div>

      <div class="fld">
        <span class="fld__label">خانات كل ${esc(unit.head)} <small>(الأساسية لكل التمارين)</small></span>
        ${fieldPicker("page", "", page.fields)}
      </div>

      <div class="fld">
        <span class="fld__label">أقل ارتفاع للصف <small>(مم)</small></span>
        <div class="inline">
          ${stepper({ scope: "page", prop: "minRowHeight", value: page.minRowHeight, min: MIN_ROW_HEIGHT, max: MAX_ROW_HEIGHT, label: "أقل ارتفاع للصف بالمليمتر" })}
          <span class="fld__hint">لو التمارين ما لحقتش، الصفحة بتكمل على ورقة تانية لوحدها بنفس العنوان.</span>
        </div>
      </div>

      <div class="fld">
        <span class="fld__label">أجزاء الصفحة</span>
        <div class="toggles">
          <label class="check"><input type="checkbox" data-scope="page" data-prop="notes"${page.notes ? " checked" : ""}><span>مربع الملاحظات</span></label>
          ${page.notes ? `<input class="in in--sm" data-scope="page" data-prop="notesTitle" data-focus="page:notesTitle" value="${esc(page.notesTitle)}" aria-label="عنوان الملاحظات">` : ""}
          <label class="check"><input type="checkbox" data-scope="page" data-prop="showTrainee"${page.showTrainee ? " checked" : ""}${showsInfo(store.doc, page) && !page.showTrainee ? ' disabled title="بيظهر تلقائيًا لأن الأسماء مكتوبة"' : ""}><span>سطر الأسماء والتاريخ</span></label>
        </div>
      </div>

      <div class="metrics" aria-live="polite">
        <span>عرض ${esc(unit.head)}: <b>${layout.dayWidth.toFixed(1)} مم</b></span>
        <span>أضيق خانة: <b>${layout.narrowest.toFixed(1)} مم</b></span>
        <span>ارتفاع الصف: <b>${rowRange.join("–")} مم</b></span>
        <span>الطباعة: <b>${esc(sheetsLabel(layout.sheetCount))}</b></span>
      </div>
      ${layout.warnings.length ? `<ul class="warns">${layout.warnings.map((warning) => `<li>${ICONS.warn}<span>${esc(warning)}</span></li>`).join("")}</ul>` : ""}

      <div class="page-tools">
        <button type="button" class="btn btn--ghost btn--sm" data-action="page-duplicate"${pageCount >= MAX_PAGES ? " disabled" : ""}>${ICONS.copy}<span>نسخ الصفحة</span></button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="page-move" data-dir="-1" data-focus="page:before"${pageIndex === 0 ? " disabled" : ""}>${ICONS.up}<span>قبل</span></button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="page-move" data-dir="1" data-focus="page:after"${pageIndex === pageCount - 1 ? " disabled" : ""}>${ICONS.down}<span>بعد</span></button>
        <button type="button" class="btn btn--danger btn--sm" data-action="page-delete">${ICONS.trash}<span>حذف الصفحة</span></button>
      </div>
    </div>
  </details>`;
}

function renderItemsPanel(page, layout) {
  const badges = new Map(layout.rows.filter((row) => row.kind === "exercise").map((row) => [row.exercise.id, row.badge]));
  const letters = new Map(layout.rows.filter((row) => row.kind === "groupHead").map((row) => [row.group.id, row.letter]));
  const exerciseCount = badges.size;
  const cards = page.items.map((item, index) => item.type === "group"
    ? renderGroupCard(page, item, index, page.items.length, badges, letters.get(item.id))
    : renderExerciseCard(page, item, index, page.items.length, badges.get(item.id))).join("");

  return `<section class="panel panel--items" aria-labelledby="items-title">
    <header class="panel__head panel__head--static">
      <h2 id="items-title">التمارين</h2>
      <span class="panel__meta">${exerciseCount ? countLabel(exerciseCount) : ""}</span>
    </header>
    <ol class="items" data-container="root">${cards}</ol>
    ${page.items.length ? "" : `<p class="empty">لسه مفيش تمارين في الصفحة دي — اختار نوع من تحت وابدأ.</p>`}
    <div class="add-bar" role="group" aria-label="إضافة للصفحة">
      ${ROOT_ADD_KINDS.map((kind) => addButton(kind, "")).join("")}
    </div>
  </section>`;
}

function addButton(kind, into) {
  const { label, icon } = ADD_KINDS[kind];
  return `<button type="button" class="add-btn" data-action="item-add" data-kind="${kind}" data-into="${into}">${ICONS[icon]}<span>${label}</span></button>`;
}

function itemTools(id, index, count, extra = "") {
  return `<div class="tools">
    <button type="button" class="icon-btn" data-action="item-move" data-id="${id}" data-dir="-1" data-focus="${id}:up" aria-label="لفوق" title="لفوق"${index === 0 ? " disabled" : ""}>${ICONS.up}</button>
    <button type="button" class="icon-btn" data-action="item-move" data-id="${id}" data-dir="1" data-focus="${id}:down" aria-label="لتحت" title="لتحت"${index === count - 1 ? " disabled" : ""}>${ICONS.down}</button>
    ${extra}
    <button type="button" class="icon-btn" data-action="item-duplicate" data-id="${id}" data-focus="${id}:copy" aria-label="نسخ" title="نسخ">${ICONS.copy}</button>
    <button type="button" class="icon-btn icon-btn--danger" data-action="item-delete" data-id="${id}" data-focus="${id}:delete" aria-label="حذف" title="حذف">${ICONS.trash}</button>
  </div>`;
}

function bindAttrs(id, prop) {
  return `dir="auto" data-scope="item" data-id="${id}" data-prop="${prop}" data-focus="${id}:${prop}"`;
}

function countLabel(n) {
  if (n === 1) return "تمرين واحد";
  if (n === 2) return "تمرينين";
  return `${n} ${n <= 10 ? "تمارين" : "تمرين"}`;
}

function renderExerciseCard(page, exercise, index, count, badge) {
  const { id } = exercise;
  const compact = exercise.mode === "tick";
  const pageFieldsLabel = resolveFields(store.doc, page.fields).map((field) => field.abbr).join(" · ") || "خانة واحدة";
  const modeOptions = Object.entries(ROW_MODES).map(([value, label]) =>
    `<option value="${value}"${exercise.mode === value ? " selected" : ""}>${value === "default" ? `${label}: ${esc(pageFieldsLabel)}` : label}</option>`).join("");

  return `<li class="card${compact ? " is-compact" : ""}" data-item-id="${id}" data-type="ex">
    <div class="card__main">
      <span class="grip" title="اسحب عشان ترتب" aria-hidden="true">${ICONS.grip}</span>
      <span class="badge${compact ? " badge--outline" : ""}">${esc(badge)}</span>
      <input class="in in--name" ${bindAttrs(id, "name")} value="${esc(exercise.name)}" placeholder="اسم التمرين" aria-label="اسم التمرين" enterkeyhint="next">
      ${itemTools(id, index, count)}
    </div>
    <div class="card__sub">
      <input class="in in--sm" ${bindAttrs(id, "detail")} value="${esc(exercise.detail)}" placeholder="تفاصيل — مثلاً وايد جريب" aria-label="تفاصيل التمرين">
      <input class="in in--sm in--target" ${bindAttrs(id, "target")} value="${esc(exercise.target)}" placeholder="الهدف — 4 × 12" aria-label="الهدف">
      <select class="sel sel--sm sel--mode" ${bindAttrs(id, "mode")} aria-label="بيسجل إيه كل يوم" title="بيسجل إيه كل يوم">${modeOptions}</select>
    </div>
    ${exercise.mode === "fields" ? `<div class="card__mode">${fieldPicker("item", id, exercise.fields)}</div>` : ""}
  </li>`;
}

function renderGroupCard(page, group, index, count, badges, letter) {
  const { id } = group;
  const children = group.items.map((child, childIndex) =>
    renderExerciseCard(page, child, childIndex, group.items.length, badges.get(child.id))).join("");
  const kindOptions = Object.entries(GROUP_KINDS).map(([value, kind]) =>
    `<option value="${value}"${group.kind === value ? " selected" : ""}>${kind.label}</option>`).join("");
  const ungroup = `<button type="button" class="icon-btn" data-action="group-ungroup" data-id="${id}" aria-label="فك المجموعة" title="فك المجموعة وخلي التمارين">${ICONS.ungroup}</button>`;

  return `<li class="card card--group" data-item-id="${id}" data-type="group">
    <div class="card__main">
      <span class="grip" title="اسحب عشان ترتب" aria-hidden="true">${ICONS.grip}</span>
      <select class="sel sel--kind" ${bindAttrs(id, "kind")} aria-label="نوع المجموعة">${kindOptions}</select>
      ${letter ? `<span class="badge badge--letter" title="بيتضاف للاسم في الجدول">${letter}</span>` : ""}
      <span class="card__spacer"></span>
      ${itemTools(id, index, count, ungroup)}
    </div>
    <div class="group-opts">
      <input class="in in--sm" ${bindAttrs(id, "label")} value="${esc(group.label)}" placeholder="الاسم في الجدول: ${esc(GROUP_KINDS[group.kind].label)}" aria-label="اسم المجموعة">
      <input class="in in--sm" ${bindAttrs(id, "note")} value="${esc(group.note)}" placeholder="ملاحظة — مثلاً راحة 90 ث" aria-label="ملاحظة المجموعة">
      <div class="fld fld--inline">
        <span class="fld__label">الجولات</span>
        ${stepper({ scope: "item", id, prop: "rounds", value: group.rounds, min: 0, max: MAX_ROUNDS, label: "عدد الجولات" })}
      </div>
      <label class="check"><input type="checkbox" ${bindAttrs(id, "letters")}${group.letters ? " checked" : ""}><span>ترقيم A1 · A2</span></label>
      <p class="card__hint group-opts__hint">${esc(GROUP_KINDS[group.kind].hint)}</p>
    </div>
    <ol class="items items--nested" data-container="${id}">${children}</ol>
    <div class="add-bar add-bar--nested" role="group" aria-label="إضافة جوه المجموعة">
      ${GROUP_ADD_KINDS.map((kind) => addButton(kind, id)).join("")}
    </div>
  </li>`;
}

function stepper({ scope, id = "", prop, value, min, max, label }) {
  const data = `data-scope="${scope}" data-id="${id}" data-prop="${prop}"`;
  return `<div class="stepper" role="group" aria-label="${label}">
    <button type="button" class="stepper__btn" data-action="step" ${data} data-delta="1" data-focus="${scope}:${id}:${prop}:+" aria-label="زوّد"${value >= max ? " disabled" : ""}>${ICONS.plus}</button>
    <input class="stepper__in" type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}" ${data} data-numeric data-focus="${scope}:${id}:${prop}" aria-label="${label}">
    <button type="button" class="stepper__btn" data-action="step" ${data} data-delta="-1" data-focus="${scope}:${id}:${prop}:-" aria-label="قلّل"${value <= min ? " disabled" : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
  </div>`;
}

function fieldPicker(scope, id, keys) {
  const chosen = resolveFields(store.doc, keys);
  const remaining = allFieldKeys(store.doc).filter((key) => !keys.includes(key));
  const formOwner = scope === "page" ? "page" : id;
  const data = `data-scope="${scope}" data-id="${id}"`;
  return `<div class="fpick">
    ${chosen.map((field) => `<span class="fchip"><b>${esc(field.abbr)}</b><span>${esc(field.name)}</span>
      <button type="button" class="icon-btn icon-btn--xs" data-action="field-remove" ${data} data-key="${esc(field.key)}" data-focus="${scope}:${id}:field:${esc(field.key)}" aria-label="شيل خانة ${esc(field.name)}">${ICONS.x}</button></span>`).join("")}
    <select class="sel sel--sm sel--add" data-field-add ${data} aria-label="إضافة خانة">
      <option value="">+ خانة</option>
      ${remaining.map((key) => {
        const field = getField(store.doc, key);
        return `<option value="${esc(key)}">${esc(field.abbr)} — ${esc(field.name)}</option>`;
      }).join("")}
      <option value="__new">+ خانة جديدة…</option>
    </select>
    ${ui.newFieldFor === formOwner ? `<div class="fnew" role="group" aria-label="خانة جديدة">
      <input class="in in--sm" data-new-field="abbr" data-focus="new-field:abbr" maxlength="6" placeholder="الاختصار — مثلاً نبض" aria-label="اختصار الخانة">
      <input class="in in--sm" data-new-field="name" placeholder="الاسم الكامل — مثلاً النبض بعد التمرين" aria-label="اسم الخانة">
      <button type="button" class="btn btn--primary btn--sm" data-action="field-create" ${data}>إضافة</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="field-cancel">إلغاء</button>
    </div>` : ""}
  </div>`;
}

// ---------- mutations ----------

function targetOf(page, scope, id) {
  return scope === "page" ? page : locate(page, id)?.item;
}

function setText(scope, id, prop, value) {
  change((doc, page) => {
    const target = scope === "doc" ? doc : targetOf(page, scope, id);
    if (target) target[prop] = value;
  }, { typing: true });
}

function setChoice(scope, id, prop, value) {
  change((doc, page) => {
    const target = targetOf(page, scope, id);
    if (!target) return;
    if (prop === "mode" && value === "fields" && !target.fields.length) target.fields = [...CARDIO_DEFAULT_FIELDS];
    if (prop === "kind") switchGroupKind(target, value);
    else target[prop] = value;
  });
}

function switchGroupKind(group, kind) {
  if (group.label.trim() === GROUP_KINDS[group.kind].label) group.label = "";
  group.kind = kind;
  group.letters = kind === "superset";
  if (kind === "circuit" && !group.rounds) group.rounds = 3;
  if (kind !== "circuit") group.rounds = 0;
}

const NUMBER_LIMITS = { days: [MIN_DAYS, MAX_DAYS], rounds: [0, MAX_ROUNDS], minRowHeight: [MIN_ROW_HEIGHT, MAX_ROW_HEIGHT] };

function setNumber(scope, id, prop, raw) {
  const [min, max] = NUMBER_LIMITS[prop];
  const target = targetOf(activePage(), scope, id);
  const value = String(raw).trim() === "" ? target[prop] : clampInt(raw, min, max, target[prop]);
  if (value === target[prop]) {
    renderEditor(); // snap an out-of-range typed value back
    return;
  }
  change((doc, page) => {
    targetOf(page, scope, id)[prop] = value;
  });
}

function addItem(kind, into) {
  const item = ADD_KINDS[kind].make();
  ui.focusNext = item.type === "group" ? `${item.id}:label` : `${item.id}:name`;
  change((doc, page) => {
    const list = into ? locate(page, into).item.items : page.items;
    list.push(item);
  });
}

/** Enter on a name field: next exercise, same logging style, same container. */
function addExerciseAfter(id) {
  const next = newExercise();
  ui.focusNext = `${next.id}:name`;
  change((doc, page) => {
    const { item, list, index } = locate(page, id);
    Object.assign(next, { mode: item.mode, fields: [...item.fields] });
    list.splice(index + 1, 0, next);
  });
}

function removeItem(id) {
  const found = locate(activePage(), id);
  if (!found) return;
  const label = found.item.type === "group" ? "المجموعة" : "التمرين";
  change((doc, page) => {
    const { list, index } = locate(page, id);
    list.splice(index, 1);
  });
  showToast(`اتمسح ${label}`, { label: "تراجع", run: undo });
}

function duplicateItem(id) {
  const copy = cloneWithNewIds(locate(activePage(), id).item);
  ui.focusNext = `${copy.id}:${copy.type === "group" ? "label" : "name"}`;
  change((doc, page) => {
    const { list, index } = locate(page, id);
    list.splice(index + 1, 0, copy);
  });
}

function moveItem(id, dir) {
  change((doc, page) => {
    const { list, index } = locate(page, id);
    const to = index + dir;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
  });
}

function ungroup(id) {
  change((doc, page) => {
    const index = page.items.findIndex((item) => item.id === id);
    if (index === -1) return;
    page.items.splice(index, 1, ...page.items[index].items);
  });
  showToast("اتفكت المجموعة والتمارين فضلت مكانها", { label: "تراجع", run: undo });
}

function toggleField(scope, id, key, on) {
  change((doc, page) => {
    const target = targetOf(page, scope, id);
    const list = target.fields;
    if (on && !list.includes(key)) list.push(key);
    if (!on) target.fields = list.filter((existing) => existing !== key);
  });
}

function createField(scope, id) {
  const root = editorRoot();
  const abbr = root.querySelector("[data-new-field=abbr]").value.trim();
  const name = root.querySelector("[data-new-field=name]").value.trim() || abbr;
  if (!abbr) {
    root.querySelector("[data-new-field=abbr]").focus();
    showToast("اكتب اختصار الخانة الأول");
    return;
  }
  const key = `c_${uid()}`;
  ui.newFieldFor = null;
  change((doc, page) => {
    doc.customFields.push({ key, abbr, name, weight: 1.1 });
    targetOf(page, scope, id).fields.push(key);
  });
}

function updateChip(index, value) {
  change((doc, page) => {
    page.chips[index] = value;
  }, { typing: true });
}

function syncOrderFromDom() {
  const root = editorRoot().querySelector('[data-container="root"]');
  const readIds = (list) => [...list.children].map((el) => el.dataset.itemId).filter(Boolean);
  const order = readIds(root).map((id) => {
    const nested = root.querySelector(`[data-container="${CSS.escape(id)}"]`);
    return { id, children: nested ? readIds(nested) : null };
  });

  const page = activePage();
  const current = JSON.stringify(page.items.map((item) => [item.id, item.type === "group" ? item.items.map((child) => child.id) : null]));
  if (current === JSON.stringify(order.map(({ id, children }) => [id, children]))) return;

  change((doc, livePage) => {
    const byId = new Map();
    for (const item of livePage.items) {
      byId.set(item.id, item);
      if (item.type === "group") item.items.forEach((child) => byId.set(child.id, child));
    }
    livePage.items = order.map(({ id, children }) => {
      const item = byId.get(id);
      if (item.type === "group") item.items = children.map((childId) => byId.get(childId));
      return item;
    });
  });
}

function bindSortables(root) {
  root.querySelectorAll("[data-container]").forEach((list) => {
    Sortable.create(list, {
      group: {
        name: "items",
        // groups can't nest inside other groups
        put: (to, _from, dragged) => to.el.dataset.container === "root" || dragged.dataset.type !== "group",
      },
      handle: ".grip",
      animation: 160,
      ghostClass: "is-ghost",
      chosenClass: "is-chosen",
      fallbackOnBody: true,
      swapThreshold: 0.6,
      emptyInsertThreshold: 16,
      onEnd: syncOrderFromDom,
    });
  });
}

// ---------- page-level actions ----------

function addPage(presetKey) {
  if (store.doc.pages.length >= MAX_PAGES) {
    showToast(`أقصى عدد ${MAX_PAGES} صفحة في الملف الواحد`);
    return;
  }
  const page = pagePreset(presetKey).build();
  const current = activePage();
  if (current) {
    page.days = current.days;
    page.dayUnit = current.dayUnit;
    page.customDayLabel = current.customDayLabel;
  }
  ui.scrollPreviewTo = page.id;
  change((doc) => {
    doc.pages.splice(current ? doc.pages.indexOf(current) + 1 : 0, 0, page);
    store.activePageId = page.id;
  });
  if (current) showToast(`اتضافت صفحة «${page.title}»`);
}

function duplicatePage() {
  if (store.doc.pages.length >= MAX_PAGES) {
    showToast(`أقصى عدد ${MAX_PAGES} صفحة في الملف الواحد`);
    return;
  }
  const current = activePage();
  const copy = { ...JSON.parse(JSON.stringify(current)), id: uid() };
  copy.items = copy.items.map(cloneWithNewIds);
  ui.scrollPreviewTo = copy.id;
  change((doc) => {
    doc.pages.splice(doc.pages.indexOf(current) + 1, 0, copy);
    store.activePageId = copy.id;
  });
}

function movePage(dir) {
  change((doc, page) => {
    const index = doc.pages.indexOf(page);
    const to = index + dir;
    if (to < 0 || to >= doc.pages.length) return;
    [doc.pages[index], doc.pages[to]] = [doc.pages[to], doc.pages[index]];
  });
}

function deletePage() {
  const current = activePage();
  if (!current) return;
  const index = store.doc.pages.indexOf(current);
  change((doc) => {
    doc.pages.splice(index, 1);
    store.activePageId = doc.pages[Math.max(0, index - 1)]?.id ?? null;
  });
  showToast(`اتمسحت صفحة «${current.title}»`, { label: "تراجع", run: undo });
}

// ---------- events (delegated once) ----------

const EDITOR_ACTIONS = {
  "item-add": (el) => addItem(el.dataset.kind, el.dataset.into),
  "item-delete": (el) => removeItem(el.dataset.id),
  "item-duplicate": (el) => duplicateItem(el.dataset.id),
  "item-move": (el) => moveItem(el.dataset.id, Number(el.dataset.dir)),
  "group-ungroup": (el) => ungroup(el.dataset.id),
  "field-remove": (el) => toggleField(el.dataset.scope, el.dataset.id, el.dataset.key, false),
  "field-create": (el) => createField(el.dataset.scope, el.dataset.id),
  "field-cancel": () => {
    ui.newFieldFor = null;
    renderEditor();
  },
  "chip-add": () => {
    ui.focusNext = `chip:${activePage().chips.length}`;
    change((doc, page) => page.chips.push(""));
  },
  "chip-remove": (el) => change((doc, page) => page.chips.splice(Number(el.dataset.index), 1)),
  step: (el) => {
    const target = targetOf(activePage(), el.dataset.scope, el.dataset.id);
    setNumber(el.dataset.scope, el.dataset.id, el.dataset.prop, target[el.dataset.prop] + Number(el.dataset.delta));
  },
  "page-duplicate": duplicatePage,
  "page-move": (el) => movePage(Number(el.dataset.dir)),
  "page-delete": deletePage,
};

function bindEditorEvents() {
  const root = editorRoot();

  root.addEventListener("input", (event) => {
    const el = event.target;
    if (el.dataset.scope === "chip") return updateChip(Number(el.dataset.index), el.value);
    if (!el.dataset.prop || el.matches("select, [type=checkbox], [data-numeric]")) return;
    setText(el.dataset.scope, el.dataset.id, el.dataset.prop, el.value);
    if (el.type === "date") syncInfoToggle();
  });

  root.addEventListener("change", (event) => {
    const el = event.target;
    if (el.matches("[data-field-add]")) {
      if (el.value === "__new") {
        ui.newFieldFor = el.dataset.scope === "page" ? "page" : el.dataset.id;
        ui.focusNext = "new-field:abbr";
        renderEditor();
      } else if (el.value) {
        toggleField(el.dataset.scope, el.dataset.id, el.value, true);
      }
      return;
    }
    if (!el.dataset.prop) return;
    if (el.type === "checkbox") return setChoice(el.dataset.scope, el.dataset.id, el.dataset.prop, el.checked);
    if (el.matches("[data-numeric]")) return setNumber(el.dataset.scope, el.dataset.id, el.dataset.prop, el.value);
    if (el.tagName === "SELECT") return setChoice(el.dataset.scope, el.dataset.id, el.dataset.prop, el.value);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    const el = event.target;
    if (el.matches("[data-new-field]")) {
      event.preventDefault();
      root.querySelector("[data-action=field-create]").click();
    } else if (el.matches(".in--name") && el.closest(".card:not(.card--group)")) {
      event.preventDefault();
      addExerciseAfter(el.dataset.id);
    } else if (el.matches(".tchip__in")) {
      event.preventDefault();
      EDITOR_ACTIONS["chip-add"]();
    }
  });
}
