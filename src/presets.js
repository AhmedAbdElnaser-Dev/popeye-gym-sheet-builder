// ---------- ready-made pages and programs; each build() returns fresh ids ----------

const ex = (name, target = "", extra = {}) => newExercise({ name, target, ...extra });
const timed = (name, fields, target = "", extra = {}) => ex(name, target, { mode: "fields", fields, ...extra });
const tick = (name, extra = {}) => newExercise({ name, mode: "tick", ...extra });
const REST = { short: "راحة 60 ث بين المجموعات", medium: "راحة 90 ث بين المجموعات", long: "راحة 2-3 دقائق في التمارين الأساسية" };

const PAGE_PRESETS = [
  // ---- Push / Pull / Legs ----
  {
    key: "push",
    title: "بوش — صدر · كتف · تراي",
    hint: "Push",
    build: () => newPage({
      title: "صدر / كتف / تراي",
      chips: ["Push", REST.long],
      items: [
        ex("بار فلات بنش برس", "4 × 6-8"),
        ex("دمبل إنكلاين برس", "3 × 8-10"),
        ex("ماشين شيست فلاي", "3 × 12"),
        ex("دمبل شولدر برس", "3 × 8-10"),
        ex("دمبل لاترل ريزس", "3 × 12-15", { detail: "رفرفة جانبي" }),
        ex("كابل تراي بوش داون", "3 × 10-12"),
        ex("أوفر هيد تراي إكستنشن", "3 × 12"),
      ],
    }),
  },
  {
    key: "pull",
    title: "بول — ظهر · باي",
    hint: "Pull",
    build: () => newPage({
      title: "ظهر / باي",
      chips: ["Pull", REST.long],
      items: [
        ex("بار ديدليفت", "3 × 5"),
        ex("لات بول داون", "3 × 10", { detail: "وايد جريب" }),
        ex("سيتد كابل رو", "3 × 10-12"),
        ex("وان آرم دمبل رو", "3 × 10"),
        ex("فيس بول", "3 × 15", { detail: "كتف خلفي" }),
        ex("بار كيرل", "3 × 10"),
        ex("هامر كيرل", "3 × 12"),
      ],
    }),
  },
  {
    key: "legs",
    title: "رجل",
    hint: "Legs",
    build: () => newPage({
      title: "رجل",
      chips: ["Legs", REST.long],
      items: [
        ex("بار سكوات", "4 × 6-8"),
        ex("رومانيان ديدليفت", "3 × 8-10"),
        ex("ليج برس", "3 × 10-12"),
        ex("ليج إكستنشن", "3 × 12-15"),
        ex("ليج كيرل", "3 × 12-15"),
        ex("ووكينج لانجز", "3 × 10", { detail: "لكل رجل" }),
        ex("كاف ريزس", "4 × 15", { detail: "سمانة" }),
      ],
    }),
  },
  // ---- Upper / Lower ----
  {
    key: "upper",
    title: "الجزء العلوي",
    hint: "Upper",
    build: () => newPage({
      title: "الجزء العلوي",
      chips: ["Upper", REST.medium],
      items: [
        ex("بار فلات بنش برس", "4 × 6-8"),
        ex("بار رو", "4 × 6-8"),
        ex("دمبل شولدر برس", "3 × 10"),
        ex("لات بول داون", "3 × 10"),
        ex("دمبل إنكلاين برس", "3 × 10"),
        ex("سيتد كابل رو", "3 × 12"),
        ex("بار كيرل", "3 × 12"),
        ex("كابل تراي بوش داون", "3 × 12"),
      ],
    }),
  },
  {
    key: "lower",
    title: "الجزء السفلي",
    hint: "Lower",
    build: () => newPage({
      title: "الجزء السفلي",
      chips: ["Lower", REST.medium],
      items: [
        ex("بار سكوات", "4 × 6-8"),
        ex("رومانيان ديدليفت", "3 × 8"),
        ex("ليج برس", "3 × 12"),
        ex("ليج كيرل", "3 × 12"),
        ex("ووكينج لانجز", "3 × 10", { detail: "لكل رجل" }),
        ex("كاف ريزس", "4 × 15", { detail: "سمانة" }),
        timed("بلانك", ["sec"], "3 جولات"),
      ],
    }),
  },
  // ---- Full body ----
  {
    key: "full-body",
    title: "فل بادي",
    hint: "Full Body",
    build: () => newPage({
      title: "فل بادي",
      chips: ["Full Body", REST.medium],
      items: [
        newGroup("section", { label: "إحماء", items: [timed("مشي سريع على المشاية", ["min", "incline"], "5 دقايق")] }),
        ex("بار سكوات", "3 × 8"),
        ex("بار فلات بنش برس", "3 × 8"),
        ex("بار رو", "3 × 8"),
        ex("دمبل شولدر برس", "3 × 10"),
        ex("رومانيان ديدليفت", "3 × 10"),
        ex("لات بول داون", "3 × 10"),
        timed("بلانك", ["sec"], "3 جولات"),
      ],
    }),
  },
  // ---- Bro split ----
  {
    key: "chest",
    title: "صدر",
    hint: "Chest",
    build: () => newPage({
      title: "صدر",
      chips: ["Chest", REST.medium],
      items: [
        ex("بار فلات بنش برس", "4 × 8"),
        ex("دمبل إنكلاين برس", "3 × 10"),
        ex("ماشين شيست برس", "3 × 10", { detail: "ديكلاين" }),
        ex("كابل كروس أوفر", "3 × 12"),
        ex("ماشين شيست فلاي", "3 × 12"),
        timed("بوش أب", ["reps"], "2 × لحد الفشل"),
      ],
    }),
  },
  {
    key: "back",
    title: "ظهر",
    hint: "Back",
    build: () => newPage({
      title: "ظهر",
      chips: ["Back", REST.medium],
      items: [
        ex("بار ديدليفت", "3 × 5"),
        ex("لات بول داون", "4 × 10", { detail: "وايد جريب" }),
        ex("بار رو", "3 × 8"),
        ex("سيتد كابل رو", "3 × 12", { detail: "في جريب" }),
        ex("وان آرم دمبل رو", "3 × 10"),
        ex("ستريت آرم بول داون", "3 × 12"),
      ],
    }),
  },
  {
    key: "shoulders",
    title: "كتف",
    hint: "Shoulders",
    build: () => newPage({
      title: "كتف",
      chips: ["Shoulders", REST.short],
      items: [
        ex("دمبل شولدر برس", "4 × 8"),
        ex("دمبل لاترل ريزس", "4 × 12", { detail: "رفرفة جانبي" }),
        ex("دمبل فرونت ريزس", "3 × 12", { detail: "رفرفة أمامي" }),
        ex("ريفرس بيك ديك", "3 × 15", { detail: "كتف خلفي" }),
        ex("فيس بول", "3 × 15"),
        ex("بار شرج", "3 × 12", { detail: "ترابيس" }),
      ],
    }),
  },
  {
    key: "arms",
    title: "ذراع",
    hint: "Arms",
    build: () => newPage({
      title: "ذراع",
      chips: ["Arms", REST.short],
      items: [
        newGroup("superset", { items: [ex("بار كيرل", "4 × 10"), ex("كلوز جريب بنش برس", "4 × 8")] }),
        newGroup("superset", { items: [ex("إنكلاين دمبل كيرل", "3 × 12"), ex("سكال كراشر", "3 × 12")] }),
        newGroup("superset", { items: [ex("هامر كيرل", "3 × 12"), ex("كابل تراي بوش داون", "3 × 15")] }),
      ],
    }),
  },
  // ---- Arnold split ----
  {
    key: "chest-back",
    title: "صدر / ظهر",
    hint: "Arnold split — يوم 1",
    build: () => newPage({
      title: "صدر / ظهر",
      chips: ["Arnold Split", REST.medium],
      items: [
        newGroup("superset", { items: [ex("بار فلات بنش برس", "4 × 8"), ex("بار رو", "4 × 8")] }),
        newGroup("superset", { items: [ex("دمبل إنكلاين برس", "3 × 10"), ex("لات بول داون", "3 × 10")] }),
        newGroup("superset", { items: [ex("ماشين شيست فلاي", "3 × 12"), ex("سيتد كابل رو", "3 × 12")] }),
      ],
    }),
  },
  {
    key: "shoulders-arms",
    title: "كتف / ذراع",
    hint: "Arnold split — يوم 2",
    build: () => newPage({
      title: "كتف / ذراع",
      chips: ["Arnold Split", REST.short],
      items: [
        ex("دمبل شولدر برس", "4 × 8"),
        ex("دمبل لاترل ريزس", "3 × 12", { detail: "رفرفة جانبي" }),
        ex("ريفرس بيك ديك", "3 × 15", { detail: "كتف خلفي" }),
        newGroup("superset", { items: [ex("بار كيرل", "3 × 10"), ex("كلوز جريب بنش برس", "3 × 8")] }),
        newGroup("superset", { items: [ex("هامر كيرل", "3 × 12"), ex("كابل تراي بوش داون", "3 × 12")] }),
      ],
    }),
  },
  // ---- conditioning ----
  {
    key: "circuit",
    title: "تدريب هجين",
    hint: "دايرة 5 جولات — حديد + كارديو",
    build: () => newPage({
      title: "تدريب هجين",
      chips: ["Circuit", "30 ثانية لكل محطة", "راحة 3 دقائق بين الجولات"],
      fields: ["reps", "kg"],
      items: [
        newGroup("circuit", {
          rounds: 5,
          items: [
            ex("كيتل بل جوبلت سكوات"),
            tick("جري في المكان"),
            ex("كيتل بل سوينج"),
            tick("ماونتن كلايمبرز"),
            ex("دمبل بوش برس"),
            tick("جامبينج جاكس"),
            ex("دمبل رينيجيد رو"),
            tick("بيربي"),
          ],
        }),
      ],
    }),
  },
  {
    key: "hiit",
    title: "كارديو HIIT",
    hint: "فترات عالية الشدة — كل صف بخاناته",
    build: () => newPage({
      title: "كارديو HIIT",
      chips: ["HIIT", "شغل 40 ث / راحة 20 ث"],
      fields: [],
      items: [
        newGroup("section", { label: "إحماء", items: [timed("مشي سريع", ["min", "incline"], "5 دقايق")] }),
        timed("جري على المشاية", ["min", "speed", "incline"], "8 فترات"),
        timed("دراجة ثابتة", ["min", "level", "cal"], "8 فترات"),
        timed("روينج", ["min", "cal"], "6 فترات"),
        timed("حبل نط", ["sec"], "5 × 60 ث"),
        timed("باتل روب", ["sec"], "5 × 30 ث"),
        newGroup("section", { label: "تبريد", items: [timed("مشي بطيء + إطالات", ["min"], "5 دقايق")] }),
      ],
    }),
  },
  {
    key: "blank",
    title: "صفحة فاضية",
    hint: "ابدأ من الصفر",
    build: () => newPage({ items: [newExercise()] }),
  },
];

const PROGRAM_PRESETS = [
  { key: "ppl", title: "Push / Pull / Legs", hint: "3 أيام — الأشهر للتضخيم", pages: ["push", "pull", "legs"] },
  { key: "upper-lower", title: "Upper / Lower", hint: "يومين متكررين — قوة وحجم", pages: ["upper", "lower"] },
  { key: "full-body", title: "Full Body", hint: "صفحة واحدة — مبتدئين أو 3 أيام في الأسبوع", pages: ["full-body"] },
  { key: "arnold", title: "Arnold Split", hint: "3 أيام — عضلات متضادة في نفس اليوم", pages: ["chest-back", "shoulders-arms", "legs"] },
  { key: "bro", title: "Bro Split", hint: "5 أيام — عضلة كل يوم", pages: ["chest", "back", "shoulders", "legs", "arms"] },
  { key: "conditioning", title: "هجين + كارديو", hint: "دايرة بجولات + HIIT", pages: ["circuit", "hiit"] },
];

function pagePreset(key) {
  return PAGE_PRESETS.find((preset) => preset.key === key);
}

function programPreset(key) {
  return PROGRAM_PRESETS.find((preset) => preset.key === key);
}

function buildProgram(preset) {
  return newDoc(preset.pages.map((key) => pagePreset(key).build()), preset.title);
}
