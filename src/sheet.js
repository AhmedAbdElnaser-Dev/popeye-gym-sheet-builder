// ---------- sheet: shared layout math + the HTML renderer (screen preview) ----------
// A page (one workout) prints on one or more sheets; pdf.js draws the same sheets. Keep the two in step.

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
const ROW_HEIGHT = { max: 16.5, maxWithoutNotes: 20, groupHeadMin: 6.5, twoLineMin: 9.4 };
const MIN_CELL_MM = 5.5;
const DOT = { size: 3.4, gap: 1.2, min: 2.2 };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PLACEHOLDER_COLUMN = { key: "_", abbr: "", name: "", weight: 1 };
const INFO_FIELDS = [["اسم المتدرب", "trainee"], ["اسم المدرب", "coach"], ["بداية البرنامج", "startDate"], ["نهاية البرنامج", "endDate"]];

/** What the strip prints for a field: the typed value, or "" when the line should stay blank. */
function infoValue(doc, key) {
  return key.endsWith("Date") ? formatDate(doc[key]) : doc[key].trim();
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function resolveFields(doc, keys) {
  return keys.map((key) => {
    const field = getField(doc, key);
    return field && { key, ...field, weight: field.weight > 0 ? field.weight : 1 };
  }).filter(Boolean);
}

function roundsLabel(n) {
  if (n === 1) return "جولة واحدة";
  if (n === 2) return "جولتين";
  return `${n} ${n <= 10 ? "جولات" : "جولة"}`;
}

function sheetsLabel(n) {
  if (n === 1) return "ورقة واحدة";
  if (n === 2) return "ورقتين";
  return `${n} ${n <= 10 ? "ورقات" : "ورقة"}`;
}

function titleParts(page) {
  return page.title.split("/").map((part) => part.trim()).filter(Boolean);
}

function bandChips(page) {
  return [...(page.showDaysChip ? [formatDayCount(page)] : []), ...page.chips.map((chip) => chip.trim()).filter(Boolean)];
}

function sheetChips(sheet) {
  const chips = bandChips(sheet.page);
  if (sheet.sheetCount > 1) chips.push(`ورقة ${sheet.sheetIndex + 1} من ${sheet.sheetCount}`);
  return chips;
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
        letter,
        badge: letter ? `${letter}${i + 1}` : pad(++number),
        last: !item.rounds && i === item.items.length - 1,
      });
    });
    if (item.rounds > 0) rows.push({ kind: "rounds", group: item, letter, last: true });
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

/** The least a row may take: the page's minimum scaled by row kind, never below what its text needs. */
function rowFloor(page, row) {
  const scaled = page.minRowHeight * rowWeight(row);
  if (row.kind === "groupHead") return Math.max(ROW_HEIGHT.groupHeadMin, scaled);
  return hasSecondLine(row) ? Math.max(ROW_HEIGHT.twoLineMin, scaled) : scaled;
}

function rowHeightMm(layout, row) {
  return Math.max(rowFloor(layout.page, row), layout.rowHeight * rowWeight(row));
}

function rowFields(doc, exercise) {
  return exercise.mode === "fields" ? resolveFields(doc, exercise.fields) : [];
}

function groupHeadLabel(row) {
  const label = [groupTitle(row.group), row.letter].filter(Boolean).join(" ");
  return row.continued ? `${label} — تابع` : label;
}

function groupHeadMeta(group) {
  return [group.rounds > 0 ? roundsLabel(group.rounds) : "", group.note.trim()].filter(Boolean);
}

function cellWidths(dayWidth, fields) {
  if (!fields.length) return dayWidth;
  const total = fields.reduce((sum, field) => sum + field.weight, 0);
  return Math.min(...fields.map((field) => (dayWidth * field.weight) / total));
}

/** Height of everything on a sheet that is not a body row. */
function fixedHeight(page, hasSubHead, first, info) {
  const trainee = first && info;
  const blocks = 3 + (page.notes ? 1 : 0) + (trainee ? 1 : 0);
  return SHEET.band + SHEET.dayHead + (hasSubHead ? SHEET.subHead : 0) + SHEET.tableBorder * 2 + SHEET.footer
    + (blocks - 1) * SHEET.gap + (trainee ? SHEET.trainee : 0) + (page.notes ? SHEET.notesMin : 0);
}

/**
 * Cuts the rows into sheets. A group head never ends a sheet, a rounds tracker never starts one
 * on its own (it takes the group's last exercise along), and a group that spills gets a "تابع" head.
 */
function splitRows(page, rows, hasSubHead, info) {
  const sheets = [];
  let current = [];
  let used = 0;
  let available = SHEET.innerHeight - fixedHeight(page, hasSubHead, true, info);

  for (const row of rows) {
    const height = rowFloor(page, row);
    if (current.length && used + height > available + 0.01) {
      const carried = [];
      const previous = current.at(-1);
      if (row.kind === "rounds" && previous.kind === "exercise" && previous.group === row.group) carried.push(current.pop());
      const orphan = current.at(-1)?.kind === "groupHead" ? current.pop() : null;
      if (current.length) sheets.push(current);
      current = [];
      used = 0;
      available = SHEET.innerHeight - fixedHeight(page, hasSubHead, false, info);
      const lead = carried[0] || row;
      const head = orphan || (lead.group && lead.kind !== "groupHead" ? { kind: "groupHead", group: lead.group, letter: lead.letter, continued: true } : null);
      for (const opener of [head, ...carried].filter(Boolean)) {
        current.push(opener);
        used += rowFloor(page, opener);
      }
    }
    current.push(row);
    used += height;
  }
  if (current.length || !sheets.length) sheets.push(current);
  return sheets;
}

function bodyHeightAt(page, rows, rowHeight) {
  return rows.reduce((sum, row) => sum + rowHeightMm({ page, rowHeight }, row), 0);
}

function layoutSheet(doc, page, rows, first) {
  const pageColumns = resolveFields(doc, page.fields);
  const columns = pageColumns.length ? pageColumns : [PLACEHOLDER_COLUMN];
  const hasSubHead = pageColumns.length > 0;
  const info = showsInfo(doc, page);
  const units = rows.reduce((sum, row) => sum + rowWeight(row), 0);
  const available = SHEET.innerHeight - fixedHeight(page, hasSubHead, first, info);
  const ceiling = Math.max(page.minRowHeight, page.notes ? ROW_HEIGHT.max : ROW_HEIGHT.maxWithoutNotes);

  // rows grow to fill the sheet, between the page's minimum and the ceiling
  let rowHeight = Math.max(page.minRowHeight, Math.min(ceiling, units ? available / units : ceiling));
  // rows pinned at their floor take space from the others; settle in a couple of passes
  for (let pass = 0; pass < 3 && bodyHeightAt(page, rows, rowHeight) > available && rowHeight > page.minRowHeight; pass++) {
    const pinned = rows.filter((row) => rowFloor(page, row) > rowHeight * rowWeight(row));
    const pinnedHeight = pinned.reduce((sum, row) => sum + rowFloor(page, row), 0);
    const freeUnits = rows.filter((row) => !pinned.includes(row)).reduce((sum, row) => sum + rowWeight(row), 0);
    rowHeight = Math.max(page.minRowHeight, Math.min(rowHeight, freeUnits ? (available - pinnedHeight) / freeUnits : rowHeight));
  }
  const bodyHeight = bodyHeightAt(page, rows, rowHeight);

  const dayWidth = (SHEET.innerWidth - SHEET.exerciseCol) / page.days;
  const narrowest = Math.min(
    cellWidths(dayWidth, columns),
    ...rows.filter((row) => row.kind === "exercise" && row.exercise.mode === "fields")
      .map((row) => cellWidths(dayWidth, rowFields(doc, row.exercise))),
  );
  const warnings = [];
  if (narrowest < MIN_CELL_MM) warnings.push(`أضيق خانة ${narrowest.toFixed(1)} مم بس — قلل الأيام أو عدد الخانات عشان الكتابة تبقى مريحة.`);

  const headHeight = SHEET.dayHead + (hasSubHead ? SHEET.subHead : 0);
  const tableHeight = headHeight + bodyHeight + SHEET.tableBorder * 2;
  return { page, first, info: first && info, columns, hasSubHead, rows, rowHeight, dayWidth, narrowest, headHeight, tableHeight, warnings };
}

/** Everything the renderers and the editor need to know about how a page lands on paper. */
function layoutPage(doc, page) {
  const rows = flattenRows(page);
  const hasSubHead = resolveFields(doc, page.fields).length > 0;
  const sheets = splitRows(page, rows, hasSubHead, showsInfo(doc, page)).map((chunk, index) => layoutSheet(doc, page, chunk, index === 0));
  return {
    rows,
    sheets,
    sheetCount: sheets.length,
    dayWidth: sheets[0].dayWidth,
    narrowest: Math.min(...sheets.map((sheet) => sheet.narrowest)),
    rowHeights: sheets.map((sheet) => sheet.rowHeight),
    warnings: [...new Set(sheets.flatMap((sheet) => sheet.warnings))],
  };
}

/** The printed sheets of the whole program, numbered across pages. */
function paginateDoc(doc) {
  const sheets = [];
  doc.pages.forEach((page, pageIndex) => {
    const { sheets: layouts } = layoutPage(doc, page);
    layouts.forEach((layout, sheetIndex) => sheets.push({ page, pageIndex, sheetIndex, sheetCount: layouts.length, layout, first: sheetIndex === 0 }));
  });
  sheets.forEach((sheet, index) => Object.assign(sheet, { number: index + 1, total: sheets.length }));
  return sheets;
}

/** Legend entries for the footer: every field used on the sheet, then tick/dot glyphs when present. */
function legendItems(doc, layout) {
  const seen = new Map();
  const add = (field) => field.abbr && !seen.has(field.key) && seen.set(field.key, field);
  layout.columns.forEach(add);
  layout.rows.filter((row) => row.kind === "exercise").forEach((row) => rowFields(doc, row.exercise).forEach(add));
  const items = [...seen.values()].map((field) => ({ kind: "field", abbr: field.abbr, name: field.name }));
  if (layout.rows.some((row) => row.kind === "exercise" && row.exercise.mode === "tick")) items.push({ kind: "tick", name: "تم" });
  if (layout.rows.some((row) => row.kind === "rounds")) items.push({ kind: "dot", name: "جولة منجزة" });
  return items;
}

// ---------- HTML sheet parts ----------

function renderBand(sheet) {
  const title = titleParts(sheet.page).map((part) => `<span class="band__word">${esc(part)}</span>`).join('<span class="sep"></span>');
  const chips = sheetChips(sheet);
  return `
    <header class="band">
      <div class="band__text">
        <h1>${title || "&nbsp;"}</h1>
        ${chips.length ? `<ul class="chips">${chips.map((chip) => `<li>${esc(chip)}</li>`).join("")}</ul>` : ""}
      </div>
      <img class="band__banner" src="${BANNER_SRC}" alt="Popeye Gym — Factory Of Lions">
    </header>`;
}

function renderInfo(doc) {
  return `<div class="info">${INFO_FIELDS.map(([label, key]) => {
    const value = infoValue(doc, key);
    const blankDate = key.endsWith("Date") && !value;
    // a printed value needs no writing line under it
    return `<div class="field"><span>${label}</span><span class="line${blankDate ? " date" : ""}${value ? " is-filled" : ""}">${blankDate ? "<i>/</i><i>/</i>" : `<b>${esc(value)}</b>`}</span></div>`;
  }).join("")}</div>`;
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
  return `<tr class="grp-head in-grp" style="height:${height}mm"><td colspan="${1 + page.days * layout.columns.length}">
    <div class="grp"><b>${esc(groupHeadLabel(row))}</b>${groupHeadMeta(row.group).map((text) => `<span>${esc(text)}</span>`).join("")}</div></td></tr>`;
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

function renderLegend(doc, layout) {
  return legendItems(doc, layout).map((item) => {
    if (item.kind === "field") return `<b>${esc(item.abbr)}</b> ${esc(item.name)}`;
    return `<span class="${item.kind}"></span> ${esc(item.name)}`;
  }).join(" <i></i> ");
}

function renderSheet(doc, sheet) {
  const { page, layout } = sheet;
  return `
  <section class="sheet-page" data-page-id="${page.id}" data-sheet="${sheet.sheetIndex}">
    ${renderBand(sheet)}
    ${layout.info ? renderInfo(doc) : ""}
    <div class="table-wrap"><table class="log">
      ${renderColgroup(page, layout)}
      ${renderHead(page, layout)}
      <tbody>${renderBody(doc, page, layout)}</tbody>
    </table></div>
    ${page.notes ? `<section class="notes"><h2><span>${esc(page.notesTitle)}</span></h2><div class="notes__lines">${"<i></i>".repeat(30)}</div></section>` : ""}
    <footer class="foot">
      <span class="legend">${renderLegend(doc, layout)}</span>
      <span class="foot__brand">POPEYE GYM <i></i> FACTORY OF LIONS <i></i> ${sheet.number} / ${sheet.total}</span>
    </footer>
  </section>`;
}
