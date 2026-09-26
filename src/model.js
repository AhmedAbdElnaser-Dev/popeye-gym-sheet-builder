// ---------- model: field library, factories, tree helpers ----------

const MIN_DAYS = 1;
const MAX_DAYS = 14;
const MAX_ROUNDS = 12;
const MAX_PAGES = 12;
const MIN_ROW_HEIGHT = 8;
const MAX_ROW_HEIGHT = 20;
const DEFAULT_ROW_HEIGHT = 12;

const FIELD_LIBRARY = {
  sets:    { abbr: "م",     name: "مجموعات",        weight: 0.8 },
  reps:    { abbr: "ع",     name: "عدات",           weight: 1 },
  kg:      { abbr: "كجم",   name: "الوزن المستخدم", weight: 1.2 },
  min:     { abbr: "د",     name: "دقائق",          weight: 1 },
  sec:     { abbr: "ث",     name: "ثواني",          weight: 1 },
  km:      { abbr: "كم",    name: "المسافة",        weight: 1.1 },
  speed:   { abbr: "سرعة",  name: "السرعة",         weight: 1.2 },
  incline: { abbr: "ميل",   name: "الميل",          weight: 1 },
  level:   { abbr: "مستوى", name: "مستوى المقاومة", weight: 1.2 },
  cal:     { abbr: "سعرات", name: "السعرات",        weight: 1.3 },
  rpe:     { abbr: "مجهود", name: "المجهود من 10",  weight: 1.2 },
  bpm:     { abbr: "نبض",   name: "النبض",          weight: 1.1 },
};

const DAY_UNITS = {
  day:     { head: "يوم",   one: "يوم واحد",   two: "يومين",   few: "أيام",   many: "يوم" },
  week:    { head: "أسبوع", one: "أسبوع واحد", two: "أسبوعين", few: "أسابيع", many: "أسبوع" },
  session: { head: "جلسة",  one: "جلسة واحدة", two: "جلستين",  few: "جلسات",  many: "جلسة" },
};

const ROW_MODES = {
  default: "الأساسية",
  fields:  "خانات خاصة",
  tick:    "علامة ✓ بس",
  blank:   "خانة كتابة حرة",
};

const GROUP_KINDS = {
  superset: { label: "سوبر سيت", hint: "تمارين ورا بعض من غير راحة — بتترقم A1 و A2" },
  circuit:  { label: "دايرة",    hint: "محطات بتتكرر كذا جولة — بيتضاف صف لعلامات الجولات" },
  section:  { label: "قسم",      hint: "عنوان يجمع تمارين زي إحماء أو تبريد" },
};

const DEFAULT_NOTES_TITLE = "ملاحظات المدرب والتقدم";
const CUSTOM_KEY = /^c_[a-z0-9]{1,16}$/;
const TEXT_LIMIT = { title: 80, chip: 80, name: 120, detail: 120, target: 60, label: 80, note: 80, abbr: 8, fieldName: 40, unit: 20, person: 60 };

const ID_SHAPE = /^[a-z0-9]{1,12}$/;

const own = (table, key) => typeof key === "string" && Object.hasOwn(table, key);
const keepId = (value, seen) => {
  const id = typeof value === "string" && ID_SHAPE.test(value) && !seen.has(value) ? value : uid();
  seen.add(id);
  return id;
};
const text = (value, limit) => String(value ?? "").slice(0, limit);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newExercise(overrides = {}) {
  return { id: uid(), type: "ex", name: "", detail: "", target: "", mode: "default", fields: [], ...overrides };
}

function newGroup(kind, overrides = {}) {
  return {
    id: uid(),
    type: "group",
    kind,
    label: "",
    rounds: kind === "circuit" ? 3 : 0,
    note: "",
    letters: kind === "superset",
    items: kind === "section" ? [newExercise()] : [newExercise(), newExercise()],
    ...overrides,
  };
}

function newPage(overrides = {}) {
  return {
    id: uid(),
    title: "صفحة جديدة",
    chips: [],
    showDaysChip: true,
    days: 8,
    dayUnit: "day",
    customDayLabel: "",
    fields: ["sets", "reps", "kg"],
    notes: true,
    notesTitle: DEFAULT_NOTES_TITLE,
    showTrainee: false,
    minRowHeight: DEFAULT_ROW_HEIGHT,
    items: [],
    ...overrides,
  };
}

/** A program: named set of pages for one trainee. Zero pages = the start screen. */
function newDoc(pages = [], name = "") {
  return { v: 1, name, trainee: "", coach: "", customFields: [], pages };
}

/** The info strip prints when a page asks for it or when names were typed. */
function showsInfo(doc, page) {
  return page.showTrainee || Boolean(doc.trainee.trim() || doc.coach.trim());
}

function getField(doc, key) {
  if (own(FIELD_LIBRARY, key)) return FIELD_LIBRARY[key];
  return doc.customFields.find((field) => field.key === key) || null;
}

function allFieldKeys(doc) {
  return [...Object.keys(FIELD_LIBRARY), ...doc.customFields.map((field) => field.key)];
}

function dayUnitOf(page) {
  if (page.dayUnit !== "custom") return own(DAY_UNITS, page.dayUnit) ? DAY_UNITS[page.dayUnit] : DAY_UNITS.day;
  const label = page.customDayLabel.trim() || "يوم";
  return { head: label, one: `${label} واحد`, two: `2 ${label}`, few: label, many: label };
}

function groupTitle(group) {
  return group.label.trim() || GROUP_KINDS[group.kind].label;
}

function formatDayCount(page) {
  const unit = dayUnitOf(page);
  const n = page.days;
  if (n === 1) return unit.one;
  if (n === 2) return unit.two;
  return `${n} ${n <= 10 ? unit.few : unit.many}`;
}

/** Locate an item anywhere in the page tree: returns its containing list and index. */
function locate(page, id) {
  for (let i = 0; i < page.items.length; i++) {
    const item = page.items[i];
    if (item.id === id) return { list: page.items, index: i, item, group: null };
    if (item.type === "group") {
      const index = item.items.findIndex((child) => child.id === id);
      if (index !== -1) return { list: item.items, index, item: item.items[index], group: item };
    }
  }
  return null;
}

function cloneWithNewIds(item) {
  const copy = JSON.parse(JSON.stringify(item));
  copy.id = uid();
  if (copy.type === "group") copy.items = copy.items.map(cloneWithNewIds);
  return copy;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// ---------- import normalisation: never trust a file blindly ----------

function normalizeExercise(raw, seen) {
  const source = raw && typeof raw === "object" ? raw : {};
  return newExercise({
    id: keepId(source.id, seen),
    name: text(source.name, TEXT_LIMIT.name),
    detail: text(source.detail, TEXT_LIMIT.detail),
    target: text(source.target, TEXT_LIMIT.target),
    mode: own(ROW_MODES, source.mode) ? source.mode : "default",
    fields: Array.isArray(source.fields) ? source.fields.map(String) : [],
  });
}

/** A group inside a group is not a thing here: its exercises join the parent. */
function flattenExercises(items, seen) {
  return items.flatMap((item) => (item?.type === "group" && Array.isArray(item.items) ? flattenExercises(item.items, seen) : [normalizeExercise(item, seen)]));
}

function normalizeItem(raw, seen) {
  if (raw?.type !== "group") return normalizeExercise(raw, seen);
  const kind = own(GROUP_KINDS, raw.kind) ? raw.kind : "section";
  return newGroup(kind, {
    id: keepId(raw.id, seen),
    label: text(raw.label, TEXT_LIMIT.label),
    rounds: clampInt(raw.rounds, 0, MAX_ROUNDS, 0),
    note: text(raw.note, TEXT_LIMIT.note),
    letters: Boolean(raw.letters),
    items: Array.isArray(raw.items) ? flattenExercises(raw.items, seen) : [],
  });
}

function normalizePage(raw, seen) {
  const source = raw && typeof raw === "object" ? raw : {};
  return newPage({
    id: keepId(source.id, seen),
    title: text(source.title ?? "صفحة", TEXT_LIMIT.title),
    chips: Array.isArray(source.chips) ? source.chips.slice(0, 8).map((chip) => text(chip, TEXT_LIMIT.chip)) : [],
    showDaysChip: source.showDaysChip !== false,
    days: clampInt(source.days, MIN_DAYS, MAX_DAYS, 8),
    dayUnit: own(DAY_UNITS, source.dayUnit) || source.dayUnit === "custom" ? source.dayUnit : "day",
    customDayLabel: text(source.customDayLabel, TEXT_LIMIT.unit),
    fields: Array.isArray(source.fields) ? source.fields.map(String) : ["sets", "reps", "kg"],
    notes: source.notes !== false,
    notesTitle: text(source.notesTitle ?? DEFAULT_NOTES_TITLE, TEXT_LIMIT.label),
    showTrainee: Boolean(source.showTrainee),
    minRowHeight: clampInt(source.minRowHeight, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT, DEFAULT_ROW_HEIGHT),
    items: Array.isArray(source.items) ? source.items.map((item) => normalizeItem(item, seen)) : [],
  });
}

function normalizeDoc(raw) {
  if (!raw || !Array.isArray(raw.pages)) throw new Error("not a program");
  // custom keys reach markup and lookups, so anything outside our own c_xxxx shape gets a fresh key
  const rekey = new Map();
  const customFields = [];
  for (const field of Array.isArray(raw.customFields) ? raw.customFields : []) {
    if (!field || typeof field.key !== "string" || !text(field.abbr, TEXT_LIMIT.abbr).trim() || rekey.has(field.key)) continue;
    const key = CUSTOM_KEY.test(field.key) && !own(FIELD_LIBRARY, field.key) ? field.key : `c_${uid()}`;
    rekey.set(field.key, key);
    customFields.push({ key, abbr: text(field.abbr, TEXT_LIMIT.abbr).trim(), name: text(field.name ?? field.abbr, TEXT_LIMIT.fieldName).trim() || text(field.abbr, TEXT_LIMIT.abbr).trim(), weight: 1.1 });
  }
  const seen = new Set();
  const doc = {
    v: 1,
    name: text(raw.name, TEXT_LIMIT.title),
    trainee: text(raw.trainee, TEXT_LIMIT.person),
    coach: text(raw.coach, TEXT_LIMIT.person),
    customFields,
    pages: raw.pages.map((page) => normalizePage(page, seen)),
  };
  const known = new Set(allFieldKeys(doc));
  const resolve = (keys) => keys.map((key) => (own(FIELD_LIBRARY, key) ? key : rekey.get(key))).filter((key) => known.has(key));
  // remap re-keyed fields and drop references to fields that no longer exist
  for (const page of doc.pages) {
    page.fields = resolve(page.fields);
    for (const item of page.items) {
      for (const exercise of item.type === "group" ? item.items : [item]) exercise.fields = resolve(exercise.fields);
    }
  }
  return doc;
}
