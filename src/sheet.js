// ---------- sheet: shared layout math + the HTML renderer (screen preview) ----------
// pdf.js draws the same layout into the downloaded file; keep the two in step.

// all sizes in mm, matching sheet.css
const SHEET = {
  pageWidth: 297,
  pageHeight: 210,
  padX: 9,
  padY: 8,
  innerHeight: 194,
  innerWidth: 279,
  band: 30,
  bandRadius: 3,
  bandPadStart: 9,
  bandGap: 4,
  gap: 2.8,
  footer: 4,
  dayHead: 7.5,
  subHead: 5,
  tableBorder: 0.5,
  tableRadius: 2.4,
  trainee: 8,
  notesMin: 28,
  notesLine: 6.6,
  exerciseCol: 56,
};
const ROW_WEIGHT = { exercise: 1, compact: 0.72, groupHead: 0.52, rounds: 0.85 };
const ROW_HEIGHT = { min: 8, max: 16.5, maxWithoutNotes: 20, groupHeadMin: 6.5, twoLineMin: 9.4 };
const MIN_CELL_MM = 5.5;
const DOT = { size: 3.4, gap: 1.2, min: 2.2 };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PLACEHOLDER_COLUMN = { key: "_", abbr: "", name: "", weight: 1 };
const TRAINEE_FIELDS = [["اسم المتدرب", false], ["اسم المدرب", false], ["بداية البرنامج", true], ["نهاية البرنامج", true]];

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function resolveFields(doc, keys) {
  return keys.map((key) => {
    const field = getField(doc, key);
    return field && { key, ...field };
  }).filter(Boolean);
}

function roundsLabel(n) {
  if (n === 1) return "جولة واحدة";
  if (n === 2) return "جولتين";
  return `${n} ${n <= 10 ? "جولات" : "جولة"}`;
}

function titleParts(page) {
  return page.title.split("/").map((part) => part.trim()).filter(Boolean);
}

function bandChips(page) {
  return [...(page.showDaysChip ? [formatDayCount(page)] : []), ...page.chips.map((chip) => chip.trim()).filter(Boolean)];
}

function flattenRows(page) {
  const rows = [];
  let number = 0;
  let letterIndex = 0;
  for (const item of page.items) {
    if (item.type === "ex") {
      rows.push({ kind: "exercise", exercise: item, badge: pad(++number) });
      continue;
    }
    const letter = item.letters ? LETTERS[letterIndex++ % LETTERS.length] : "";
    rows.push({ kind: "groupHead", group: item, letter });
    item.items.forEach((exercise, i) => {
      rows.push({
        kind: "exercise",
        exercise,
        group: item,
        badge: letter ? `${letter}${i + 1}` : pad(++number),
        last: !item.rounds && i === item.items.length - 1,
      });
    });
    if (item.rounds > 0) rows.push({ kind: "rounds", group: item, last: true });
  }
  return rows;
}

function rowWeight(row) {
  if (row.kind === "groupHead") return ROW_WEIGHT.groupHead;
  if (row.kind === "rounds") return ROW_WEIGHT.rounds;
  return row.exercise.mode === "tick" ? ROW_WEIGHT.compact : ROW_WEIGHT.exercise;
}

function hasSecondLine(row) {
  if (row.kind === "rounds") return true;
  return row.kind === "exercise" && Boolean(row.exercise.detail.trim() || row.exercise.target.trim());
}

/** Rows never shrink below what their text needs, whatever the page's row height says. */
function rowHeightMm(layout, row) {
  const scaled = layout.rowHeight * rowWeight(row);
  if (row.kind === "groupHead") return Math.max(ROW_HEIGHT.groupHeadMin, scaled);
  return hasSecondLine(row) ? Math.max(ROW_HEIGHT.twoLineMin, scaled) : scaled;
}

function bodyHeightAt(rows, rowHeight) {
  return rows.reduce((sum, row) => sum + rowHeightMm({ rowHeight }, row), 0);
}

function rowFields(doc, exercise) {
  return exercise.mode === "fields" ? resolveFields(doc, exercise.fields) : [];
}

function groupHeadMeta(group) {
  return [group.rounds > 0 ? roundsLabel(group.rounds) : "", group.note.trim()].filter(Boolean);
}

function cellWidths(dayWidth, fields) {
  if (!fields.length) return dayWidth;
  const total = fields.reduce((sum, field) => sum + field.weight, 0);
  return Math.min(...fields.map((field) => (dayWidth * field.weight) / total));
}

/** Everything the renderers and the editor need to know about how a page fits on paper. */
function layoutPage(doc, page) {
  const pageColumns = resolveFields(doc, page.fields);
  const columns = pageColumns.length ? pageColumns : [PLACEHOLDER_COLUMN];
  const hasSubHead = pageColumns.length > 0;
  const rows = flattenRows(page);
  const units = rows.reduce((sum, row) => sum + rowWeight(row), 0);

  const blocks = 3 + (page.notes ? 1 : 0) + (page.showTrainee ? 1 : 0);
  const fixed = SHEET.band + SHEET.dayHead + (hasSubHead ? SHEET.subHead : 0) + SHEET.tableBorder * 2 + SHEET.footer
    + (blocks - 1) * SHEET.gap + (page.showTrainee ? SHEET.trainee : 0) + (page.notes ? SHEET.notesMin : 0);
  const available = SHEET.innerHeight - fixed;
  const ceiling = page.notes ? ROW_HEIGHT.max : ROW_HEIGHT.maxWithoutNotes;
  let rowHeight = Math.max(ROW_HEIGHT.min, Math.min(ceiling, units ? available / units : ROW_HEIGHT.max));
  // rows pinned at their minimum take space from the others; settle in a couple of passes
  for (let pass = 0; pass < 3 && bodyHeightAt(rows, rowHeight) > available && rowHeight > ROW_HEIGHT.min; pass++) {
    const pinned = rows.filter((row) => rowHeightMm({ rowHeight }, row) > rowHeight * rowWeight(row));
    const pinnedHeight = pinned.reduce((sum, row) => sum + rowHeightMm({ rowHeight }, row), 0);
    const freeUnits = rows.filter((row) => !pinned.includes(row)).reduce((sum, row) => sum + rowWeight(row), 0);
    rowHeight = Math.max(ROW_HEIGHT.min, Math.min(rowHeight, freeUnits ? (available - pinnedHeight) / freeUnits : rowHeight));
  }
  const bodyHeight = bodyHeightAt(rows, rowHeight);
  const overflow = bodyHeight > available + 0.05;

  const dayWidth = (SHEET.innerWidth - SHEET.exerciseCol) / page.days;
  const narrowest = Math.min(
    cellWidths(dayWidth, columns),
    ...rows.filter((row) => row.kind === "exercise" && row.exercise.mode === "fields")
      .map((row) => cellWidths(dayWidth, rowFields(doc, row.exercise))),
  );

  const warnings = [];
  if (overflow) warnings.push("الصفوف كتير على صفحة واحدة — انقل جزء منها لصفحة جديدة أو اقفل الملاحظات.");
  if (narrowest < MIN_CELL_MM) warnings.push(`أضيق خانة ${narrowest.toFixed(1)} مم بس — قلل الأيام أو عدد الخانات عشان الكتابة تبقى مريحة.`);

  const headHeight = SHEET.dayHead + (hasSubHead ? SHEET.subHead : 0);
  const tableHeight = headHeight + bodyHeight + SHEET.tableBorder * 2;

  return { columns, hasSubHead, rows, rowHeight, dayWidth, narrowest, headHeight, tableHeight, overflow, warnings };
}

/** Legend entries for the footer: every field used on the page, then tick/dot glyphs when present. */
function legendItems(doc, page, layout) {
  const seen = new Map();
  const add = (field) => field.abbr && !seen.has(field.key) && seen.set(field.key, field);
  layout.columns.forEach(add);
  layout.rows.filter((row) => row.kind === "exercise").forEach((row) => rowFields(doc, row.exercise).forEach(add));
  const items = [...seen.values()].map((field) => ({ kind: "field", abbr: field.abbr, name: field.name }));
  if (layout.rows.some((row) => row.kind === "exercise" && row.exercise.mode === "tick")) items.push({ kind: "tick", name: "تم" });
  if (layout.rows.some((row) => row.kind === "rounds")) items.push({ kind: "dot", name: "جولة منجزة" });
  return items;
}

// ---------- HTML page parts ----------

function renderBand(page) {
  const title = titleParts(page).map((part) => `<span class="band__word">${esc(part)}</span>`).join('<span class="sep"></span>');
  const chips = bandChips(page);
  return `
    <header class="band">
      <div class="band__text">
        <h1>${title || "&nbsp;"}</h1>
        ${chips.length ? `<ul class="chips">${chips.map((chip) => `<li>${esc(chip)}</li>`).join("")}</ul>` : ""}
      </div>
      <img class="band__banner" src="${BANNER_SRC}" alt="Popeye Gym — Factory Of Lions">
    </header>`;
}

function renderTrainee() {
  return `<div class="info">${TRAINEE_FIELDS.map(([label, isDate]) =>
    `<div class="field"><span>${label}</span><span class="line${isDate ? " date" : ""}">${isDate ? "<i>/</i><i>/</i>" : ""}</span></div>`).join("")}</div>`;
}

function renderHead(page, layout) {
  const unit = dayUnitOf(page);
  const span = layout.columns.length;
  const days = Array.from({ length: page.days }, (_, i) =>
    `<th colspan="${span}" class="day ds"><span>${esc(unit.head)}</span><b>${i + 1}</b></th>`).join("");
  const subs = layout.hasSubHead
    ? `<tr class="subs">${Array.from({ length: page.days }, () =>
      layout.columns.map((column, i) => `<th class="${i === 0 ? "ds" : ""}">${esc(column.abbr)}</th>`).join("")).join("")}</tr>`
    : "";
  return `<thead><tr><th rowspan="${layout.hasSubHead ? 2 : 1}" class="ex-head" scope="col">التمرين</th>${days}</tr>${subs}</thead>`;
}

function renderColgroup(page, layout) {
  // the table sits inside a 0.5 mm border, so columns share 278 mm — same basis as pdf.js
  const scale = (SHEET.innerWidth - SHEET.tableBorder * 2) / SHEET.innerWidth;
  const total = layout.columns.reduce((sum, column) => sum + column.weight, 0);
  const perDay = layout.columns.map((column) => `<col style="width:${((layout.dayWidth * scale * column.weight) / total).toFixed(2)}mm">`).join("");
  return `<colgroup><col style="width:${(SHEET.exerciseCol * scale).toFixed(2)}mm">${perDay.repeat(page.days)}</colgroup>`;
}

function renderExerciseHeader(row) {
  const { exercise } = row;
  const compact = exercise.mode === "tick";
  const detail = exercise.detail.trim();
  const target = exercise.target.trim();
  const sub = detail || target
    ? `<small>${detail ? `<span class="ex__detail">${esc(detail)}</span>` : ""}${target ? `<em>${esc(target)}</em>` : ""}</small>`
    : "";
  return `<th scope="row" class="ex"><div class="ex__inner">
    <span class="num${compact ? " num--outline" : ""}">${esc(row.badge)}</span>
    <span class="name"><b class="ex__title">${esc(exercise.name) || "&nbsp;"}</b>${sub}</span></div></th>`;
}

function renderDayCells(doc, page, layout, exercise) {
  const span = layout.columns.length;
  const repeatDays = (cell) => cell.repeat(page.days);

  if (exercise.mode === "tick") return repeatDays(`<td colspan="${span}" class="ds"><span class="tick"></span></td>`);
  if (exercise.mode === "default") return repeatDays(layout.columns.map((_, i) => `<td class="${i === 0 ? "ds" : ""}"></td>`).join(""));

  const fields = rowFields(doc, exercise);
  if (exercise.mode === "blank" || !fields.length) return repeatDays(`<td colspan="${span}" class="ds"></td>`);
  const boxes = fields.map((field) => `<span style="flex:${field.weight}"><b>${esc(field.abbr)}</b></span>`).join("");
  return repeatDays(`<td colspan="${span}" class="ds mini-cell"><div class="mini">${boxes}</div></td>`);
}

function renderGroupHead(page, layout, row, height) {
  const { group } = row;
  const label = [groupTitle(group), row.letter].filter(Boolean).join(" ");
  return `<tr class="grp-head in-grp" style="height:${height}mm"><td colspan="${1 + page.days * layout.columns.length}">
    <div class="grp"><b>${esc(label)}</b>${groupHeadMeta(group).map((text) => `<span>${esc(text)}</span>`).join("")}</div></td></tr>`;
}

function dotSize(layout, rounds) {
  return Math.min(DOT.size, (layout.dayWidth - 3) / rounds - DOT.gap);
}

function renderRoundsRow(page, layout, row, height) {
  const { rounds } = row.group;
  const size = dotSize(layout, rounds);
  const tracker = size >= DOT.min
    ? `<span class="dots" style="--dot:${size.toFixed(2)}mm">${'<span class="dot"></span>'.repeat(rounds)}</span>`
    : `<span class="of">/ ${rounds}</span>`;
  const cells = `<td colspan="${layout.columns.length}" class="ds">${tracker}</td>`.repeat(page.days);
  return `<tr class="rounds in-grp grp-last" style="height:${height}mm">
    <th scope="row" class="ex"><div class="ex__inner"><span class="num num--spacer"></span>
    <span class="name"><b class="ex__title">الجولات المنجزة</b><small>من ${roundsLabel(rounds)}</small></span></div></th>${cells}</tr>`;
}

function renderBody(doc, page, layout) {
  return layout.rows.map((row) => {
    const height = rowHeightMm(layout, row).toFixed(2);
    if (row.kind === "groupHead") return renderGroupHead(page, layout, row, height);
    if (row.kind === "rounds") return renderRoundsRow(page, layout, row, height);
    const classes = [
      row.exercise.mode === "tick" ? "is-compact" : "",
      row.group ? "in-grp" : "",
      row.last ? "grp-last" : "",
    ].filter(Boolean).join(" ");
    return `<tr class="${classes}" style="height:${height}mm">${renderExerciseHeader(row)}${renderDayCells(doc, page, layout, row.exercise)}</tr>`;
  }).join("");
}

function renderLegend(doc, page, layout) {
  return legendItems(doc, page, layout).map((item) => {
    if (item.kind === "field") return `<b>${esc(item.abbr)}</b> ${esc(item.name)}`;
    return `<span class="${item.kind}"></span> ${esc(item.name)}`;
  }).join(" <i></i> ");
}

function renderPage(doc, page, index) {
  const layout = layoutPage(doc, page);
  const html = `
  <section class="sheet-page" data-page-id="${page.id}">
    ${renderBand(page)}
    ${page.showTrainee ? renderTrainee() : ""}
    <div class="table-wrap"><table class="log">
      ${renderColgroup(page, layout)}
      ${renderHead(page, layout)}
      <tbody>${renderBody(doc, page, layout)}</tbody>
    </table></div>
    ${page.notes ? `<section class="notes"><h2><span>${esc(page.notesTitle)}</span></h2><div class="notes__lines">${"<i></i>".repeat(30)}</div></section>` : ""}
    <footer class="foot">
      <span class="legend">${renderLegend(doc, page, layout)}</span>
      <span class="foot__brand">POPEYE GYM <i></i> FACTORY OF LIONS <i></i> ${index + 1} / ${doc.pages.length}</span>
    </footer>
  </section>`;
  return { html, layout };
}
