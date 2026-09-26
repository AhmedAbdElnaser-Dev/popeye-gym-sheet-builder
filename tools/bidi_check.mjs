import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/bidi.js", import.meta.url), "utf8");
const { bidiRuns } = new Function(src + "; return { bidiRuns };")();
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
// what ends up on paper: fontkit reverses a run iff it detects an RTL script in it
const visual = (text, base = 1) => bidiRuns(text, base).map((r) => (RTL.test(r.text) ? [...r.text].reverse().join("") : r.text)).join("");
const cases = [
  ["يوم 12", 1, "12 موي"],
  ["4 × 12", 1, "12 × 4"],
  ["راحة 3 دقائق", 1, "قئاقد 3 ةحار"],
  ["(30 ثانية)", 1, "(ةيناث 30)"],
  ["كارديو HIIT", 1, "HIIT ويدراك"],
  ["POPEYE GYM • 1 / 5", 0, "POPEYE GYM • 1 / 5"],
  ["Bench Press 3 × 10", 1, "Bench Press 3 × 10"],
  ["A1", 1, "A1"],
  ["3 × 8–10", 0, "3 × 8–10"],
  ["3 × 8-10", 1, "8-10 × 3"],
  ["4 × 12", 0, "4 × 12"],
  ["١٢ يوم", 1, "موي ١٢"],
  ["ماشين — وايد", 1, "دياو — نيشام"],
  ["صدر / ظهر", 1, "رهظ / ردص"],
  ["2.5 كجم", 1, "مجك 2.5"],
  ["%80", 1, "%80"],
  ["كارديو (HIIT) x", 1, "x (HIIT) ويدراك"],
  ["بنش (Bench) 3 × 10", 1, "3 × 10 (Bench) شنب"],
  ["(30 ثانية) راحة", 1, "ةحار (ةيناث 30)"],
];
let fail = 0;
for (const [text, base, expected] of cases) {
  const got = visual(text, base);
  const ok = got === expected;
  if (!ok) fail++;
  console.log((ok ? "PASS " : "FAIL ") + JSON.stringify(text) + " → " + JSON.stringify(got) + (ok ? "" : " expected " + JSON.stringify(expected)));
}
process.exit(fail ? 1 : 0);
