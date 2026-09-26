// ---------- pdf: draws the sheet layout into a real PDF (pdf-lib + fontkit) and embeds the program ----------
// Mirrors sheet.css / sheet.js. Sizes are mm from the page's top-left unless a name says otherwise.

const PT = 72 / 25.4;
const PAGE_PT = { w: SHEET.pageWidth * PT, h: SHEET.pageHeight * PT };
const PDF_APP_ID = "popeye-sheet-builder";
const PDF_FORMAT_VERSION = 1;
const PDF_INFO_KEY = "PopeyeSheets";
const PDF_ATTACHMENT_NAME = "program.json";
const BAND_PX_PER_MM = 12;
const BAND_JPEG_QUALITY = 0.92;
const SEP_SKEW = Math.tan((14 * Math.PI) / 180);
const ELLIPSIS = "…";

// matches sheet.css
const INK = "#1a0f0c";
const BLOOD = "#8a1c14";
const RED = "#d3221a";
const RULE = "#9e9e9e";
const RULE_ROW = "#878787";
const RULE_STRONG = "#565656";
const MUTED = "#6b5c58";
const HEAD_DIVIDER = "#4a3a36";
const COMPACT_INK = "#4a3a36";
const WHITE = "#ffffff";
const BLACK = "#000000";

const FONT_SPECS = {
  cairo400: ["Cairo", 400],
  cairo600: ["Cairo", 600],
  cairo700: ["Cairo", 700],
  cairo800: ["Cairo", 800],
  lalezar: ["Lalezar", 400],
};

const fontBytesCache = new Map();

function fontBytes(key) {
  if (!fontBytesCache.has(key)) fontBytesCache.set(key, base64ToBytes(FONT_DATA[key]));
  return fontBytesCache.get(key);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function hex(color) {
  const n = parseInt(color.slice(1), 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const mm = (v) => v * PT;

// ---------- shapes: SVG paths in mm with the origin at the page's top-left ----------

function rectPath(x, y, w, h) {
  return `M${mm(x)} ${mm(y)} h${mm(w)} v${mm(h)} h${-mm(w)} Z`;
}

function roundedPath(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  const [X, Y, W, H, R] = [mm(x), mm(y), mm(w), mm(h), mm(r)];
  return `M${X + R} ${Y} H${X + W - R} A${R} ${R} 0 0 1 ${X + W} ${Y + R} V${Y + H - R} A${R} ${R} 0 0 1 ${X + W - R} ${Y + H}`
    + ` H${X + R} A${R} ${R} 0 0 1 ${X} ${Y + H - R} V${Y + R} A${R} ${R} 0 0 1 ${X + R} ${Y} Z`;
}

function circlePath(cx, cy, radius) {
  const [X, Y, R] = [mm(cx), mm(cy), mm(radius)];
  return `M${X - R} ${Y} A${R} ${R} 0 1 0 ${X + R} ${Y} A${R} ${R} 0 1 0 ${X - R} ${Y} Z`;
}

/** The red "/" divider: a bar skewed 14° like the CSS transform. */
function slashPath(x, y, w, h) {
  const dx = SEP_SKEW * (h / 2);
  return `M${mm(x + dx)} ${mm(y)} h${mm(w)} L${mm(x + w - dx)} ${mm(y + h)} h${-mm(w)} Z`;
}

function fillPath(page, path, color, opacity) {
  page.drawSvgPath(path, { x: 0, y: PAGE_PT.h, color: hex(color), opacity, borderWidth: 0 });
}

function strokePath(page, path, color, width, opacity) {
  page.drawSvgPath(path, { x: 0, y: PAGE_PT.h, borderColor: hex(color), borderWidth: mm(width), borderOpacity: opacity });
}

function fillRect(page, x, y, w, h, color, opacity) {
  if (w <= 0 || h <= 0) return;
  fillPath(page, rectPath(x, y, w, h), color, opacity);
}

/** A CSS-style border ring: stroke centred half a width inside the box. */
function strokeRoundedInside(page, x, y, w, h, radius, width, color) {
  strokePath(page, roundedPath(x + width / 2, y + width / 2, w - width, h - width, radius - width / 2), color, width);
}

function withRoundedClip(page, x, y, w, h, radius, draw) {
  const r = Math.min(radius, w / 2, h / 2);
  const k = 0.5523 * r;
  const top = SHEET.pageHeight;
  const p = (px, py) => [mm(px), mm(top - py)];
  const { moveTo, lineTo, appendBezierCurve, closePath, clip, endPath, pushGraphicsState, popGraphicsState } = PDFLib;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(...p(x + r, y)),
    lineTo(...p(x + w - r, y)),
    appendBezierCurve(...p(x + w - r + k, y), ...p(x + w, y + r - k), ...p(x + w, y + r)),
    lineTo(...p(x + w, y + h - r)),
    appendBezierCurve(...p(x + w, y + h - r + k), ...p(x + w - r + k, y + h), ...p(x + w - r, y + h)),
    lineTo(...p(x + r, y + h)),
    appendBezierCurve(...p(x + r - k, y + h), ...p(x, y + h - r + k), ...p(x, y + h - r)),
    lineTo(...p(x, y + r)),
    appendBezierCurve(...p(x, y + r - k), ...p(x + r - k, y), ...p(x + r, y)),
    closePath(),
    clip(),
    endPath(),
  );
  draw();
  page.pushOperators(popGraphicsState());
}

// ---------- text ----------

async function embedFonts(pdf) {
  const fonts = {};
  for (const key of Object.keys(FONT_SPECS)) {
    const bytes = fontBytes(key);
    const meta = fontkit.create(bytes);
    fonts[key] = {
      pdf: await pdf.embedFont(bytes, { subset: true }),
      meta,
      // where the baseline sits relative to the centre of the CSS content box, in em
      baselineShift: (meta.ascent + meta.descent) / 2 / meta.unitsPerEm,
      supported: new Set(meta.characterSet),
    };
  }
  return fonts;
}

/**
 * Glyphs are written in visual order, and every extractor re-reverses RTL text. A ligature such as
 * lam-alef maps to two code points; listing them in visual order too keeps copied/searched text right.
 */
function orderLigatureUnicode(fonts) {
  for (const { pdf } of Object.values(fonts)) {
    const glyphs = pdf.embedder?.glyphCache?.access?.() ?? [];
    for (const glyph of glyphs) {
      const points = glyph.codePoints;
      if (points.length > 1 && points.every((cp) => RTL_SCRIPT.test(String.fromCodePoint(cp)))) points.reverse();
    }
  }
}

/** dir="auto": the first strong character decides, no strong character means LTR (numbers, formulas). */
function resolveDirection(text, dir) {
  if (dir !== "auto") return dir;
  for (const ch of String(text ?? "")) {
    const type = bidiClass(ch);
    if (type === "L") return 0;
    if (type === "R" || type === "AL") return 1;
  }
  return 0;
}

class Typesetter {
  constructor(page, fonts) {
    this.page = page;
    this.fonts = fonts;
  }

  clean(text, font) {
    return [...String(text ?? "")].filter((ch) => /\s/.test(ch) || font.supported.has(ch.codePointAt(0))).join("");
  }

  runs(text, font, size, dir) {
    const runs = bidiRuns(this.clean(text, font), resolveDirection(text, dir));
    const widths = runs.map((run) => font.pdf.widthOfTextAtSize(run.text, size));
    return { runs, widths, total: widths.reduce((sum, w) => sum + w, 0) / PT };
  }

  width(text, font, size, dir = "auto") {
    return this.runs(text, font, size, dir).total;
  }

  fit(text, font, size, maxWidth, dir) {
    let shaped = this.runs(text, font, size, dir);
    if (!(maxWidth > 0) || shaped.total <= maxWidth) return shaped;
    const chars = [...this.clean(text, font)];
    let low = 0;
    let high = chars.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = this.runs(chars.slice(0, mid).join("").trimEnd() + ELLIPSIS, font, size, dir);
      if (candidate.total <= maxWidth) low = mid;
      else high = mid - 1;
    }
    shaped = this.runs(chars.slice(0, low).join("").trimEnd() + ELLIPSIS, font, size, dir);
    return shaped;
  }

  /**
   * Draws one line. Anchor with `right`, `center` or `x` (mm). `y` is the vertical centre of the
   * CSS line box; pass `baseline` to place the baseline directly. Returns the drawn width in mm.
   */
  line(text, { font, size, color = INK, opacity, x, right, center, y, baseline, maxWidth, dir = "auto", tracking = 0 }) {
    if (!text) return 0;
    const shaped = this.fit(text, font, size, maxWidth, dir);
    const trackingTotal = tracking * Math.max(0, [...text].length - 1);
    const total = shaped.total + trackingTotal;
    let cursor = right !== undefined ? right - total : center !== undefined ? center - total / 2 : x;
    const baselineMm = baseline !== undefined ? baseline : y + font.baselineShift * (size / PT);
    const yPt = PAGE_PT.h - mm(baselineMm);
    const paint = { size, font: font.pdf, color: hex(color), opacity };

    if (tracking) {
      for (const ch of shaped.runs.map((run) => run.text).join("")) {
        this.page.drawText(ch, { ...paint, x: mm(cursor), y: yPt });
        cursor += font.pdf.widthOfTextAtSize(ch, size) / PT + tracking;
      }
      return total;
    }
    shaped.runs.forEach((run, i) => {
      this.page.drawText(run.text, { ...paint, x: mm(cursor), y: yPt });
      cursor += shaped.widths[i] / PT;
    });
    return total;
  }

  /** Same line as glyph outlines (no text object): used for the title shadow so text isn't duplicated. */
  outline(text, { font, size, color, opacity, right, y, maxWidth }) {
    const shaped = this.fit(text, font, size, maxWidth, "auto");
    const scale = size / font.meta.unitsPerEm;
    let cursor = right - shaped.total;
    const baseline = y + font.baselineShift * (size / PT);
    let path = "";
    for (const run of shaped.runs) {
      let x = 0;
      for (const glyph of font.meta.layout(run.text).glyphs) {
        for (const { command, args } of glyph.path.commands) {
          const pts = args.map((v, i) => (i % 2 ? -v * scale : v * scale + x).toFixed(2));
          if (command === "moveTo") path += `M${pts[0]} ${pts[1]}`;
          else if (command === "lineTo") path += `L${pts[0]} ${pts[1]}`;
          else if (command === "quadraticCurveTo") path += `Q${pts[0]} ${pts[1]} ${pts[2]} ${pts[3]}`;
          else if (command === "bezierCurveTo") path += `C${pts.join(" ")}`;
          else if (command === "closePath") path += "Z";
        }
        x += glyph.advanceWidth * scale;
      }
      const runPath = path;
      path = "";
      this.page.drawSvgPath(runPath, { x: mm(cursor), y: PAGE_PT.h - mm(baseline), color: hex(color), opacity, borderWidth: 0 });
      cursor += font.pdf.widthOfTextAtSize(run.text, size) / PT;
    }
  }
}

// ---------- band background: the CSS gradients + banner, rasterised once per document ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("banner failed to load"));
    img.src = src;
  });
}

async function bandBackground(pdf) {
  const banner = await loadImage(BANNER_SRC);
  const px = BAND_PX_PER_MM;
  const W = Math.round(SHEET.innerWidth * px);
  const H = Math.round(SHEET.band * px);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 0, H);
  [[0, "#10100c"], [0.17, "#18100d"], [0.42, "#290e0b"], [0.58, "#330b08"], [0.75, "#3f0907"], [1, "#3d0a07"]]
    .forEach(([stop, color]) => base.addColorStop(stop, color));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // radial-gradient(ellipse 38% 150% at 88% 120%, rgb(150 28 20 / 0.55) 0%, transparent 70%)
  ctx.save();
  ctx.translate(W * 0.88, H * 1.2);
  ctx.scale(W * 0.38, H * 1.5);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, "rgba(150,28,20,0.55)");
  glow.addColorStop(0.7, "rgba(150,28,20,0)");
  glow.addColorStop(1, "rgba(150,28,20,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();

  // the two repeating 45° hatches
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = 0.25 * px;
  const step = 3.2 * Math.SQRT2 * px;
  ctx.beginPath();
  for (let d = -H; d < W + H; d += step) {
    ctx.moveTo(d, 0);
    ctx.lineTo(d + H, H);
    ctx.moveTo(d + H, 0);
    ctx.lineTo(d, H);
  }
  ctx.stroke();

  ctx.drawImage(banner, 0, 0, (H * banner.width) / banner.height, H);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", BAND_JPEG_QUALITY));
  return pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
}

// ---------- page blocks ----------

const TITLE_SIZE = 34;
const TITLE_LINE = (TITLE_SIZE * 1.05) / PT;
const CHIP_SIZE = 8.5;
const CHIP_H = CHIP_SIZE / PT + 1.1 + 1.3 + 0.5;
const CHIP_GAP = 1.6;

function drawBand(page, ts, fonts, pageData, band) {
  const x = SHEET.padX;
  const y = SHEET.padY;
  const w = SHEET.innerWidth;
  const h = SHEET.band;
  withRoundedClip(page, x, y, w, h, SHEET.bandRadius, () => {
    page.drawImage(band, { x: mm(x), y: PAGE_PT.h - mm(y + h), width: mm(w), height: mm(h) });
    fillRect(page, x, y + h - 0.9, w, 0.9, RED);
  });

  const right = x + w - SHEET.bandPadStart;
  const bannerWidth = (h * 1264) / 345;
  const maxWidth = w - SHEET.bandPadStart - SHEET.bandGap - bannerWidth;

  const parts = titleParts(pageData);
  const chips = bandChips(pageData);
  const chipLines = wrapChips(ts, fonts, chips, maxWidth);
  // like the CSS flex row: words shrink in proportion and get an ellipsis when the title is too long
  const natural = parts.map((part) => ts.width(part, fonts.lalezar, TITLE_SIZE));
  const separators = (parts.length - 1) * (1.6 + 3.4 * 2);
  const excess = natural.reduce((sum, w) => sum + w, 0) + separators - maxWidth;
  const naturalTotal = natural.reduce((sum, w) => sum + w, 0) || 1;
  const partWidth = natural.map((w) => (excess > 0 ? w - excess * (w / naturalTotal) : w));
  const chipsHeight = chipLines.length ? 2 + chipLines.length * CHIP_H + (chipLines.length - 1) * CHIP_GAP : 0;
  const top = y + (h - TITLE_LINE - chipsHeight) / 2;
  const titleCenter = top + TITLE_LINE / 2;

  let cursor = right;
  parts.forEach((part, index) => {
    if (index) {
      const sepH = 0.72 * (TITLE_SIZE / PT);
      const sepX = cursor - 3.4 - 1.6;
      fillPath(page, slashPath(sepX, titleCenter - sepH / 2 + 0.6, 1.6, sepH), BLACK, 0.45);
      fillPath(page, slashPath(sepX, titleCenter - sepH / 2, 1.6, sepH), RED);
      cursor = sepX - 3.4;
    }
    const width = partWidth[index];
    ts.outline(part, { font: fonts.lalezar, size: TITLE_SIZE, color: BLACK, opacity: 0.45, right: cursor, y: titleCenter + 0.6, maxWidth: width });
    ts.line(part, { font: fonts.lalezar, size: TITLE_SIZE, color: WHITE, right: cursor, y: titleCenter, maxWidth: width });
    cursor -= width;
  });

  let chipY = top + TITLE_LINE + 2;
  chipLines.forEach((line) => {
    let chipRight = right;
    line.forEach(({ text, width, first }) => {
      const path = roundedPath(chipRight - width, chipY, width, CHIP_H, CHIP_H / 2);
      if (first) fillPath(page, path, RED);
      else page.drawSvgPath(path, { x: 0, y: PAGE_PT.h, color: hex(WHITE), opacity: 0.08, borderColor: hex(WHITE), borderOpacity: 0.28, borderWidth: mm(0.25) });
      ts.line(text, { font: fonts.cairo600, size: CHIP_SIZE, color: WHITE, center: chipRight - width / 2, y: chipY + CHIP_H / 2 - 0.1 });
      chipRight -= width + CHIP_GAP;
    });
    chipY += CHIP_H + CHIP_GAP;
  });
}

function wrapChips(ts, fonts, chips, maxWidth) {
  const lines = [];
  let line = [];
  let used = 0;
  chips.forEach((text, index) => {
    const width = ts.width(text, fonts.cairo600, CHIP_SIZE) + 2.8 * 2 + 0.5;
    if (line.length && used + CHIP_GAP + width > maxWidth) {
      lines.push(line);
      line = [];
      used = 0;
    }
    line.push({ text, width, first: index === 0 });
    used += (line.length > 1 ? CHIP_GAP : 0) + width;
  });
  if (line.length) lines.push(line);
  return lines;
}

function drawTrainee(page, ts, fonts, y) {
  const inner = SHEET.innerWidth - 2;
  const fr = (inner - 7 * 3) / 4.5;
  const widths = [1.25 * fr, 1.25 * fr, fr, fr];
  let right = SHEET.padX + SHEET.innerWidth - 1;
  TRAINEE_FIELDS.forEach(([label, isDate], index) => {
    const w = widths[index];
    const labelWidth = ts.line(label, { font: fonts.cairo700, size: 9, color: BLOOD, right, y: y + SHEET.trainee - (9 * 1.2) / PT / 2 });
    const lineRight = right - labelWidth - 2.2;
    const lineLeft = right - w;
    fillRect(page, lineLeft, y + SHEET.trainee - 0.35, lineRight - lineLeft, 0.35, RULE_STRONG);
    if (isDate) {
      const span = lineRight - lineLeft;
      [1 / 3, 2 / 3].forEach((at) => ts.line("/", { font: fonts.cairo400, size: 10, color: RULE, center: lineLeft + span * at, baseline: y + SHEET.trainee - 0.9 }));
    }
    right -= w + 7;
  });
}

function drawTable(page, ts, fonts, doc, pageData, layout, top) {
  const border = SHEET.tableBorder;
  const x = SHEET.padX;
  const w = SHEET.innerWidth;
  const h = layout.tableHeight;
  const ix = x + border;
  const iy = top + border;
  const iw = w - border * 2;
  const right = ix + iw;
  const scale = iw / SHEET.innerWidth;
  const exW = SHEET.exerciseCol * scale;
  const dayW = layout.dayWidth * scale;
  const dayRight = (i) => right - exW - i * dayW;
  const unit = dayUnitOf(pageData);
  const columnTotal = layout.columns.reduce((sum, column) => sum + column.weight, 0);
  const subEdges = (dayIndex, fields) => {
    // right→left boundaries inside a day for the given fields
    const total = fields.reduce((sum, field) => sum + field.weight, 0);
    let cursor = dayRight(dayIndex);
    return fields.map((field) => {
      const width = (dayW * field.weight) / total;
      const box = { right: cursor, left: cursor - width, width };
      cursor -= width;
      return box;
    });
  };

  withRoundedClip(page, ix, iy, iw, h - border * 2, SHEET.tableRadius - border, () => {
    // header
    const headBottom = iy + layout.headHeight;
    fillRect(page, ix, iy, iw, layout.headHeight, INK);
    if (layout.hasSubHead) fillRect(page, ix, iy + SHEET.dayHead, right - exW - ix, SHEET.subHead, BLOOD);
    fillRect(page, right - exW, headBottom - 0.45, exW, 0.9, RED);
    ts.line("التمرين", { font: fonts.lalezar, size: 14, color: WHITE, right: right - 4, y: iy + layout.headHeight / 2 - 0.6 });

    for (let d = 0; d < pageData.days; d++) {
      const center = dayRight(d) - dayW / 2;
      const rowCenter = iy + SHEET.dayHead / 2 - 0.35;
      const number = String(d + 1);
      const numberWidth = ts.width(number, fonts.lalezar, 12.5);
      const labelWidth = ts.width(unit.head, fonts.cairo600, 8);
      const total = numberWidth + 1 + labelWidth;
      const baseline = rowCenter + fonts.lalezar.baselineShift * (12.5 / PT);
      ts.line(unit.head, { font: fonts.cairo600, size: 8, color: WHITE, opacity: 0.75, right: center + total / 2, baseline });
      ts.line(number, { font: fonts.lalezar, size: 12.5, color: WHITE, right: center + total / 2 - labelWidth - 1, baseline });
      fillRect(page, dayRight(d) - 0.175, iy, 0.35, layout.headHeight, HEAD_DIVIDER);
      if (layout.hasSubHead) {
        subEdges(d, layout.columns).forEach((box, i) => {
          ts.line(layout.columns[i].abbr, { font: fonts.cairo600, size: 7, color: WHITE, center: box.right - box.width / 2, y: iy + SHEET.dayHead + SHEET.subHead / 2 - 0.25 });
          if (i) fillRect(page, box.right - 0.1, iy + SHEET.dayHead, 0.2, SHEET.subHead, "#9f453e");
        });
      }
    }

    // body rows
    let y = headBottom;
    layout.rows.forEach((row, index) => {
      const rowH = rowHeightMm(layout, row);
      const previous = layout.rows[index - 1];
      const heavyTop = row.kind === "groupHead" || previous?.last;
      if (index || heavyTop) {
        const width = heavyTop ? 0.5 : 0.35;
        // under the header the red "التمرين" underline wins, like the collapsed border in the preview
        const lineRight = index ? ix + iw : right - exW;
        fillRect(page, ix, y - width / 2, lineRight - ix, width, heavyTop ? INK : RULE_ROW);
      }
      if (row.kind === "groupHead") drawGroupHead(page, ts, fonts, row, right, y, rowH);
      else {
        fillRect(page, right - exW - 0.25, y, 0.5, rowH, RULE_STRONG);
        for (let d = 0; d < pageData.days; d++) fillRect(page, dayRight(d) - 0.25, y, 0.5, rowH, RULE_STRONG);
        if (row.kind === "rounds") drawRoundsRow(page, ts, fonts, layout, row, { right, exW, dayRight, dayW, days: pageData.days, y, rowH });
        else drawExerciseRow(page, ts, fonts, doc, pageData, layout, row, { right, exW, dayRight, dayW, subEdges, y, rowH });
      }
      if (row.kind === "groupHead" || row.group) fillRect(page, right - 1.3, y, 1.3, rowH, RED);
      y += rowH;
    });
    if (layout.rows.at(-1)?.last) fillRect(page, ix, y - 0.5, iw, 0.5, INK);
  });
  strokeRoundedInside(page, x, top, w, h, SHEET.tableRadius, border, INK);
}

function drawBadge(page, ts, fonts, text, { right, centerY, outline, spacer }) {
  const textWidth = ts.width(text, fonts.lalezar, 9);
  const width = Math.max(6.4, textWidth + 2);
  if (!spacer) {
    const path = roundedPath(right - width, centerY - 3.2, width, 6.4, 3.2);
    if (outline) strokePath(page, roundedPath(right - width + 0.175, centerY - 3.025, width - 0.35, 6.05, 3.025), RED, 0.35);
    else fillPath(page, path, RED);
    ts.line(text, { font: fonts.lalezar, size: 9, color: outline ? RED : WHITE, center: right - width / 2, y: centerY + 0.25 });
  }
  return width;
}

function drawNameBlock(page, ts, fonts, { right, maxWidth, centerY, title, titleFont, titleSize, titleColor, detail, target }) {
  const line1 = (titleSize * 1.25) / PT;
  const chipH = target ? (8 * 1.35) / PT + 0.6 : 0;
  const line2 = detail || target ? Math.max((8 * 1.25) / PT, chipH) : 0;
  const top = centerY - (line1 + line2) / 2;
  ts.line(title, { font: titleFont, size: titleSize, color: titleColor, right, y: top + line1 / 2, maxWidth });
  if (!line2) return;
  const y = top + line1 + line2 / 2;
  let cursor = right;
  if (detail) {
    const chipRoom = target ? ts.width(target, fonts.cairo700, 8) + 3 + 1.4 : 0;
    cursor -= ts.line(detail, { font: fonts.cairo600, size: 8, color: MUTED, right: cursor, y, maxWidth: maxWidth - chipRoom }) + (target ? 1.4 : 0);
  }
  if (target) {
    const room = Math.max(4, maxWidth - (right - cursor) - 3);
    const textWidth = Math.min(ts.width(target, fonts.cairo700, 8), room);
    const width = textWidth + 2.4 + 0.6;
    strokePath(page, roundedPath(cursor - width + 0.15, y - chipH / 2 + 0.15, width - 0.3, chipH - 0.3, 0.85), BLOOD, 0.3);
    ts.line(target, { font: fonts.cairo700, size: 8, color: BLOOD, center: cursor - width / 2, y, maxWidth: textWidth });
  }
}

function drawExerciseRow(page, ts, fonts, doc, pageData, layout, row, geo) {
  const { exercise } = row;
  const compact = exercise.mode === "tick";
  const centerY = geo.y + geo.rowH / 2;
  const badgeWidth = drawBadge(page, ts, fonts, row.badge, { right: geo.right - 3.2, centerY, outline: compact });
  drawNameBlock(page, ts, fonts, {
    right: geo.right - 3.2 - badgeWidth - 2.6,
    maxWidth: geo.exW - 6.4 - badgeWidth - 2.6,
    centerY,
    title: exercise.name,
    titleFont: compact ? fonts.cairo600 : fonts.cairo700,
    titleSize: compact ? 9.5 : 10.5,
    titleColor: compact ? COMPACT_INK : INK,
    detail: exercise.detail.trim(),
    target: exercise.target.trim(),
  });

  for (let d = 0; d < pageData.days; d++) {
    const dayCenter = geo.dayRight(d) - geo.dayW / 2;
    if (exercise.mode === "tick") {
      page.drawSvgPath(roundedPath(dayCenter - 2 + 0.2, centerY - 2 + 0.2, 3.6, 3.6, 0.6), { x: 0, y: PAGE_PT.h, color: hex(WHITE), borderColor: hex(RULE_STRONG), borderWidth: mm(0.4) });
      continue;
    }
    if (exercise.mode === "default") {
      geo.subEdges(d, layout.columns).forEach((box, i) => i && fillRect(page, box.right - 0.15, geo.y, 0.3, geo.rowH, RULE));
      continue;
    }
    const fields = rowFields(doc, exercise);
    if (exercise.mode === "blank" || !fields.length) continue;
    geo.subEdges(d, fields).forEach((box, i) => {
      if (i) fillRect(page, box.right - 0.15, geo.y, 0.3, geo.rowH, RULE);
      ts.line(fields[i].abbr, { font: fonts.cairo700, size: 5.8, color: MUTED, right: box.right - 0.8, y: geo.y + 0.5 + 5.8 / PT / 2, maxWidth: box.width - 1.6 });
    });
  }
}

function drawGroupHead(page, ts, fonts, row, right, y, rowH) {
  const centerY = y + rowH / 2;
  const label = [groupTitle(row.group), row.letter].filter(Boolean).join(" ");
  let cursor = right - 4.5;
  cursor -= ts.line(label, { font: fonts.lalezar, size: 11, color: BLOOD, right: cursor, y: centerY + 0.3, maxWidth: SHEET.innerWidth * 0.4 }) + 2;
  groupHeadMeta(row.group).forEach((text) => {
    const width = ts.width(text, fonts.cairo700, 7.5) + 4.4 + 0.6;
    const height = 7.5 / PT + 1.6 + 0.6;
    strokePath(page, roundedPath(cursor - width + 0.15, centerY - height / 2 + 0.15, width - 0.3, height - 0.3, height / 2), RULE_STRONG, 0.3);
    ts.line(text, { font: fonts.cairo700, size: 7.5, color: INK, center: cursor - width / 2, y: centerY - 0.1 });
    cursor -= width + 2;
  });
}

function drawRoundsRow(page, ts, fonts, layout, row, geo) {
  const { rounds } = row.group;
  const centerY = geo.y + geo.rowH / 2;
  const badgeWidth = drawBadge(page, ts, fonts, "", { right: geo.right - 3.2, centerY, spacer: true });
  drawNameBlock(page, ts, fonts, {
    right: geo.right - 3.2 - badgeWidth - 2.6,
    maxWidth: geo.exW - 6.4 - badgeWidth - 2.6,
    centerY,
    title: "الجولات المنجزة",
    titleFont: fonts.cairo700,
    titleSize: 10.5,
    titleColor: BLOOD,
    detail: `من ${roundsLabel(rounds)}`,
    target: "",
  });
  const size = dotSize(layout, rounds);
  for (let d = 0; d < geo.days; d++) {
    const dayCenter = geo.dayRight(d) - geo.dayW / 2;
    if (size < DOT.min) {
      ts.line(`/ ${rounds}`, { font: fonts.cairo700, size: 9, color: MUTED, center: dayCenter - 4, y: centerY });
      continue;
    }
    const total = rounds * size + (rounds - 1) * DOT.gap;
    let cursor = dayCenter + total / 2;
    for (let i = 0; i < rounds; i++) {
      page.drawSvgPath(circlePath(cursor - size / 2, centerY, size / 2 - 0.2), { x: 0, y: PAGE_PT.h, color: hex(WHITE), borderColor: hex(RULE_STRONG), borderWidth: mm(0.4) });
      cursor -= size + DOT.gap;
    }
  }
}

function drawNotes(page, ts, fonts, pageData, top, height) {
  const x = SHEET.padX;
  const w = SHEET.innerWidth;
  strokeRoundedInside(page, x, top, w, height, SHEET.tableRadius, 0.4, RULE);
  const headH = (12 * 1.567) / PT;
  const headCenter = top + 2 + headH / 2;
  const right = x + w - 4;
  fillPath(page, slashPath(right - 1.2, headCenter - 1.9, 1.2, 3.8), RED);
  ts.line(pageData.notesTitle, { font: fonts.lalezar, size: 12, color: BLOOD, right: right - 1.2 - 2, y: headCenter, maxWidth: w - 16 });
  const linesTop = top + 2 + headH;
  const count = Math.floor((top + height - 2.5 - linesTop) / SHEET.notesLine);
  for (let i = 1; i <= count; i++) fillRect(page, x + 4, linesTop + i * SHEET.notesLine - 0.35, w - 8, 0.35, RULE);
}

function drawFooter(page, ts, fonts, doc, pageData, layout, index) {
  const centerY = SHEET.pageHeight - SHEET.padY - 1.6;
  const size = 7.5;
  const dot = (cx) => fillPath(page, circlePath(cx, centerY, 0.5), RED);

  let cursor = SHEET.padX + SHEET.innerWidth - 1;
  legendItems(doc, pageData, layout).forEach((item, i) => {
    if (i) {
      dot(cursor - 2.6);
      cursor -= 6.2;
    }
    if (item.kind === "field") {
      cursor -= ts.line(item.abbr, { font: fonts.cairo800, size, color: BLOOD, right: cursor, y: centerY }) + 0.8;
    } else if (item.kind === "tick") {
      page.drawSvgPath(roundedPath(cursor - 2.6 + 0.2, centerY - 1.3 + 0.2, 2.2, 2.2, 0.5), { x: 0, y: PAGE_PT.h, color: hex(WHITE), borderColor: hex(RULE_STRONG), borderWidth: mm(0.4) });
      cursor -= 2.6 + 0.8;
    } else {
      page.drawSvgPath(circlePath(cursor - 1.3, centerY, 1.1), { x: 0, y: PAGE_PT.h, color: hex(WHITE), borderColor: hex(RULE_STRONG), borderWidth: mm(0.4) });
      cursor -= 2.6 + 0.8;
    }
    cursor -= ts.line(item.name, { font: fonts.cairo400, size, color: MUTED, right: cursor, y: centerY });
  });

  let x = SHEET.padX + 1;
  ["POPEYE GYM", "FACTORY OF LIONS", `${index + 1} / ${doc.pages.length}`].forEach((text, i) => {
    if (i) {
      dot(x + 3.5);
      x += 7;
    }
    x += ts.line(text, { font: fonts.cairo700, size, color: INK, x, y: centerY, dir: 0, tracking: 0.35 });
  });
}

function drawSheet(page, ctx, pageData, index) {
  const { doc, fonts, band } = ctx;
  const ts = new Typesetter(page, fonts);
  const layout = layoutPage(doc, pageData);
  fillRect(page, 0, 0, SHEET.pageWidth, SHEET.pageHeight, WHITE);

  drawBand(page, ts, fonts, pageData, band);
  let y = SHEET.padY + SHEET.band + SHEET.gap;
  if (pageData.showTrainee) {
    drawTrainee(page, ts, fonts, y);
    y += SHEET.trainee + SHEET.gap;
  }
  drawTable(page, ts, fonts, doc, pageData, layout, y);
  y += layout.tableHeight + SHEET.gap;

  const footerTop = SHEET.pageHeight - SHEET.padY - 3.2;
  const notesHeight = footerTop - SHEET.gap - y;
  if (pageData.notes && notesHeight >= 16) drawNotes(page, ts, fonts, pageData, y, notesHeight);
  drawFooter(page, ts, fonts, doc, pageData, layout, index);
}

// ---------- program payload inside the PDF ----------

async function deflateText(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return { encoding: "raw", bytes };
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return { encoding: "deflate", bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

async function inflateText(encoding, bytes) {
  if (encoding === "raw") return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).text();
}

function infoDict(pdf) {
  const existing = pdf.context.lookup(pdf.context.trailerInfo.Info);
  if (existing instanceof PDFLib.PDFDict) return existing;
  const created = pdf.context.obj({});
  pdf.context.trailerInfo.Info = pdf.context.register(created);
  return created;
}

async function embedProgram(pdf, doc, savedAt) {
  const json = JSON.stringify({ app: PDF_APP_ID, v: PDF_FORMAT_VERSION, savedAt: savedAt.toISOString(), doc });
  const { encoding, bytes } = await deflateText(json);
  infoDict(pdf).set(PDFLib.PDFName.of(PDF_INFO_KEY), PDFLib.PDFString.of(`${encoding}:${bytesToBase64(bytes)}`));
  await pdf.attach(new TextEncoder().encode(json), PDF_ATTACHMENT_NAME, {
    mimeType: "application/json",
    description: "Popeye Gym sheet builder — program data (open this PDF in the builder to edit it)",
    creationDate: savedAt,
    modificationDate: savedAt,
  });
}

function readAttachment(pdf) {
  const { PDFName, PDFDict, PDFArray, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } = PDFLib;
  const names = pdf.catalog.lookup(PDFName.of("Names"));
  const embedded = names instanceof PDFDict ? names.lookup(PDFName.of("EmbeddedFiles")) : null;
  const list = embedded instanceof PDFDict ? embedded.lookup(PDFName.of("Names")) : null;
  if (!(list instanceof PDFArray)) return null;
  for (let i = 0; i + 1 < list.size(); i += 2) {
    const name = list.lookup(i);
    const fileName = name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : "";
    if (fileName !== PDF_ATTACHMENT_NAME) continue;
    const spec = list.lookup(i + 1);
    const files = spec instanceof PDFDict ? spec.lookup(PDFName.of("EF")) : null;
    const stream = files instanceof PDFDict ? files.lookup(PDFName.of("F")) : null;
    if (stream instanceof PDFRawStream) return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  }
  return null;
}

class ProgramFileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Reads a program back out of a PDF made by this app. Throws ProgramFileError(code). */
async function readProgramFromPdf(bytes) {
  let pdf;
  let pageCount = 0;
  try {
    pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    pageCount = pdf.getPageCount();
  } catch {
    throw new ProgramFileError("not-pdf");
  }
  if (!pageCount) throw new ProgramFileError("not-pdf");
  if (pdf.isEncrypted) throw new ProgramFileError("encrypted");

  let json = null;
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
  const value = info instanceof PDFLib.PDFDict ? info.get(PDFLib.PDFName.of(PDF_INFO_KEY)) : null;
  if (value) {
    try {
      const [encoding, data] = value.decodeText().split(":");
      json = await inflateText(encoding, base64ToBytes(data));
    } catch {
      throw new ProgramFileError("corrupt");
    }
  }
  if (!json) {
    try {
      json = readAttachment(pdf);
    } catch {
      json = null;
    }
  }
  if (!json) throw new ProgramFileError("not-ours");

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new ProgramFileError(value ? "corrupt" : "not-ours");
  }
  if (payload?.app !== PDF_APP_ID) throw new ProgramFileError("not-ours");
  if (!(payload.v <= PDF_FORMAT_VERSION)) throw new ProgramFileError("newer");
  try {
    return { doc: normalizeDoc(payload.doc) };
  } catch {
    throw new ProgramFileError("corrupt");
  }
}

/** Builds the download: every page drawn, metadata set, program embedded. Returns PDF bytes. */
async function generateProgramPdf(doc, { now = new Date() } = {}) {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await embedFonts(pdf);
  const band = await bandBackground(pdf);
  const ctx = { doc, fonts, band };
  doc.pages.forEach((pageData, index) => drawSheet(pdf.addPage([PAGE_PT.w, PAGE_PT.h]), ctx, pageData, index));

  const title = doc.name.trim() || "برنامج تمرين";
  pdf.setTitle(`${title} — Popeye Gym`);
  pdf.setAuthor("Popeye Gym");
  pdf.setSubject(doc.pages.map((pageData) => pageData.title).join(" · "));
  pdf.setKeywords(["Popeye Gym", "training log", "سجل تمرين"]);
  pdf.setCreator("Popeye Gym Sheet Builder");
  pdf.setProducer("Popeye Gym Sheet Builder");
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);
  pdf.setLanguage("ar");
  await embedProgram(pdf, doc, now);
  orderLigatureUnicode(fonts);

  // object streams off keeps the Info dictionary plain text, so the payload survives simple tools
  return pdf.save({ useObjectStreams: false });
}
