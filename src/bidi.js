// ---------- bidi: UAX#9 for single-line labels, no explicit embeddings ----------
// bidiRuns(text, baseLevel) → visual runs left→right: [{ text, rtl }].
// fontkit picks a run's script from its first letter-like character; shaperReverses mirrors that rule.
// Run text stays in logical order; fontkit reverses RTL (Arabic/Hebrew) runs while shaping.

const MIRRORED = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«", "‹": "›", "›": "‹" };
const DIRECTION_MARKS = { "‎": "L", "‏": "R", "؜": "AL" };
const RTL_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u;
const ARABIC_NUMBER = /[٠-٩٫٬]/;
const EUROPEAN_NUMBER = /[0-9۰-۹０-９]/;
const EUROPEAN_SEPARATOR = /[+\-−]/;
const EUROPEAN_TERMINATOR = /[#$%¢-¥°±٪‰‱₠-⃏]/;
const COMMON_SEPARATOR = /[,.\/: ،]/;
const ARABIC_LETTER_PUNCT = /[؛؟ـ٭]/;
const HEBREW = /\p{Script=Hebrew}/u;
const NONSPACING_MARK = /[\p{Mn}\p{Me}]/u;
const LETTER = /\p{L}/u;

function bidiClass(ch) {
  if (DIRECTION_MARKS[ch]) return DIRECTION_MARKS[ch];
  if (ARABIC_NUMBER.test(ch)) return "AN";
  if (EUROPEAN_NUMBER.test(ch)) return "EN";
  if (NONSPACING_MARK.test(ch)) return "NSM";
  if (EUROPEAN_SEPARATOR.test(ch)) return "ES";
  if (EUROPEAN_TERMINATOR.test(ch)) return "ET";
  if (COMMON_SEPARATOR.test(ch)) return "CS";
  if (ARABIC_LETTER_PUNCT.test(ch)) return "AL";
  if (HEBREW.test(ch)) return "R";
  if (RTL_SCRIPT.test(ch)) return "AL";
  if (/\s/.test(ch)) return "WS";
  if (LETTER.test(ch)) return "L";
  return "ON";
}

const BRACKET_PAIRS = { "(": ")", "[": "]", "{": "}" };
const CLOSING_BRACKETS = new Set(Object.values(BRACKET_PAIRS));
const BRACKET_STACK_LIMIT = 63;

const isStrong = (type) => type === "L" || type === "R" || type === "AL";
const isNeutral = (type) => type === "WS" || type === "ON" || type === "B" || type === "S";
const asStrongDirection = (type) => (type === "L" ? "L" : "R"); // EN/AN act as R for neutrals (N1)

function resolveTypes(chars, baseLevel) {
  const types = chars.map(bidiClass);
  const sos = baseLevel % 2 ? "R" : "L";
  const n = types.length;

  // W1: nonspacing marks take the type of what precedes them
  for (let i = 0; i < n; i++) if (types[i] === "NSM") types[i] = i ? types[i - 1] : sos;

  // W2: European numbers after an Arabic letter become Arabic numbers
  for (let i = 0; i < n; i++) {
    if (types[i] !== "EN") continue;
    for (let j = i - 1; j >= -1; j--) {
      const type = j < 0 ? sos : types[j];
      if (!isStrong(type)) continue;
      if (type === "AL") types[i] = "AN";
      break;
    }
  }

  // W3
  for (let i = 0; i < n; i++) if (types[i] === "AL") types[i] = "R";

  // W4: a single separator between two numbers of the same kind joins them
  for (let i = 1; i < n - 1; i++) {
    const [prev, cur, next] = [types[i - 1], types[i], types[i + 1]];
    if (cur === "ES" && prev === "EN" && next === "EN") types[i] = "EN";
    else if (cur === "CS" && prev === next && (prev === "EN" || prev === "AN")) types[i] = prev;
  }

  // W5: terminators adjacent to a European number become part of it
  for (let i = 0; i < n; i++) {
    if (types[i] !== "ET") continue;
    let end = i;
    while (end < n && types[end] === "ET") end++;
    const touchesEN = (i > 0 && types[i - 1] === "EN") || (end < n && types[end] === "EN");
    if (touchesEN) for (let k = i; k < end; k++) types[k] = "EN";
    i = end - 1;
  }

  // W6
  for (let i = 0; i < n; i++) if (types[i] === "ES" || types[i] === "ET" || types[i] === "CS") types[i] = "ON";

  // W7: European numbers in a left-to-right context read as letters
  for (let i = 0; i < n; i++) {
    if (types[i] !== "EN") continue;
    for (let j = i - 1; j >= -1; j--) {
      const type = j < 0 ? sos : types[j];
      if (!isStrong(type)) continue;
      if (type === "L") types[i] = "L";
      break;
    }
  }

  resolveBracketPairs(chars, types, sos);

  // N1 + N2: neutrals take the surrounding direction when both sides agree, else the base direction
  for (let i = 0; i < n; i++) {
    if (!isNeutral(types[i])) continue;
    let end = i;
    while (end < n && isNeutral(types[end])) end++;
    const before = i > 0 ? asStrongDirection(types[i - 1]) : sos;
    const after = end < n ? asStrongDirection(types[end]) : sos;
    const resolved = before === after ? before : sos;
    for (let k = i; k < end; k++) types[k] = resolved;
    i = end - 1;
  }
  return types;
}

/** N0: a bracket pair takes the direction of what it encloses (BD16 pairing, no canonical equivalents needed). */
function resolveBracketPairs(chars, types, sos) {
  const pairs = [];
  const stack = [];
  for (let i = 0; i < chars.length; i++) {
    if (types[i] !== "ON") continue;
    if (BRACKET_PAIRS[chars[i]]) {
      if (stack.length === BRACKET_STACK_LIMIT) break;
      stack.push({ closer: BRACKET_PAIRS[chars[i]], index: i });
    } else if (CLOSING_BRACKETS.has(chars[i])) {
      const depth = stack.findLastIndex((open) => open.closer === chars[i]);
      if (depth === -1) continue;
      pairs.push([stack[depth].index, i]);
      stack.length = depth;
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);

  const direction = (type) => (type === "L" ? "L" : type === "R" || type === "EN" || type === "AN" ? "R" : null);
  const opposite = sos === "L" ? "R" : "L";
  for (const [open, close] of pairs) {
    const inside = new Set();
    for (let k = open + 1; k < close; k++) {
      const found = direction(types[k]);
      if (found) inside.add(found);
    }
    let resolved = null;
    if (inside.has(sos)) resolved = sos;
    else if (inside.has(opposite)) {
      let context = sos;
      for (let k = open - 1; k >= 0; k--) {
        const found = direction(types[k]);
        if (found) {
          context = found;
          break;
        }
      }
      resolved = context === opposite ? opposite : sos;
    }
    if (resolved) types[open] = types[close] = resolved;
  }
}

function resolveLevels(types, baseLevel) {
  return types.map((type) => {
    if (baseLevel % 2 === 0) return type === "R" ? 1 : type === "AN" || type === "EN" ? 2 : 0;
    return type === "R" ? 1 : 2;
  });
}

/** L2 at run granularity: returns level runs in visual order. */
function orderRuns(levels) {
  const runs = [];
  for (let i = 0; i < levels.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.level === levels[i]) last.end = i + 1;
    else runs.push({ start: i, end: i + 1, level: levels[i] });
  }
  const maxLevel = Math.max(0, ...levels);
  const oddLevels = levels.filter((level) => level % 2);
  const lowestOdd = oddLevels.length ? Math.min(...oddLevels) : maxLevel + 1;
  const order = runs.map((_, index) => index);
  for (let level = maxLevel; level >= lowestOdd; level--) {
    for (let i = 0; i < order.length; i++) {
      if (runs[order[i]].level < level) continue;
      let end = i;
      while (end < order.length && runs[order[end]].level >= level) end++;
      order.splice(i, end - i, ...order.slice(i, end).reverse());
      i = end - 1;
    }
  }
  return order.map((index) => runs[index]);
}

const reverseText = (text) => [...text].reverse().join("");
const SCRIPT_CARRIER = /[\p{L}\p{Script=Arabic}\p{Script=Hebrew}]/u;

function shaperReverses(text) {
  const first = [...text].find((ch) => SCRIPT_CARRIER.test(ch));
  return first !== undefined && RTL_SCRIPT.test(first);
}

function bidiRuns(text, baseLevel = 1) {
  const chars = [...String(text ?? "")];
  if (!chars.length) return [];
  const types = resolveTypes(chars, baseLevel);
  const levels = resolveLevels(types, baseLevel);

  // L1: trailing whitespace sits at the base level
  for (let i = chars.length - 1; i >= 0 && /\s/.test(chars[i]); i--) levels[i] = baseLevel;

  return orderRuns(levels).map((run) => {
    const rtl = run.level % 2 === 1;
    const logical = chars.slice(run.start, run.end).filter((ch) => !DIRECTION_MARKS[ch]).join("");
    const mirrored = [...logical].map((ch) => (rtl && MIRRORED[ch]) || ch).join("");
    // fontkit reverses a run only when it detects an RTL script; compensate where that disagrees with the level
    const text = rtl === shaperReverses(mirrored) ? mirrored : reverseText(mirrored);
    return { text, rtl };
  }).filter((run) => run.text);
}
