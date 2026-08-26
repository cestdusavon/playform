/*
 * Text fitting and lettering geometry. The engine never guesses a font
 * size: it is handed a measure function (canvas-based in the browser,
 * opentype-based at export) and solves for the size that hits the target
 * width. No DOM, no Shopify.
 */

import { fmt } from './geometry.js';

/*
 * Solve font size so that measure(size) === targetWidthPx.
 * measure must be monotonic non-decreasing in size (text width always is).
 * Returns { size, width, converged, iterations }.
 */
export function solveFontSize({ measure, targetWidthPx, min = 2, max = 8000, tolerancePx = 0.25 }) {
  if (targetWidthPx <= 0) throw new Error('solveFontSize: target width must be positive');
  let lo = min;
  let hi = max;
  const wMin = measure(lo);
  const wMax = measure(hi);
  if (wMax <= 0) return { size: min, width: 0, converged: false, iterations: 0 };
  if (wMin >= targetWidthPx) return { size: lo, width: wMin, converged: false, iterations: 0 };
  if (wMax <= targetWidthPx) return { size: hi, width: wMax, converged: false, iterations: 0 };

  let iterations = 0;
  for (; iterations < 48; iterations++) {
    const mid = (lo + hi) / 2;
    const w = measure(mid);
    if (Math.abs(w - targetWidthPx) <= tolerancePx) {
      return { size: mid, width: w, converged: true, iterations: iterations + 1 };
    }
    if (w > targetWidthPx) hi = mid;
    else lo = mid;
  }
  const size = (lo + hi) / 2;
  const width = measure(size);
  return {
    size,
    width,
    converged: Math.abs(width - targetWidthPx) <= tolerancePx * 8,
    iterations,
  };
}

/*
 * Measure factory over an opentype.js font. Returns advance width of the
 * string at a given size, in px.
 */
export function opentypeMeasure(font, text) {
  return (size) => font.getAdvanceWidth(text, size);
}

/*
 * Lettering geometry from an opentype.js font: fits text to targetWidthPx
 * and returns real outline path data plus metrics. `font` is an opentype
 * Font instance (injected — this module never fetches anything).
 */
export function letteringOutline({ font, text, targetWidthPx, tolerancePx = 0.25 }) {
  const measure = opentypeMeasure(font, text);
  const fit = solveFontSize({ measure, targetWidthPx, tolerancePx });
  const size = fit.size;
  const scale = size / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const descent = Math.abs(font.descender * scale);
  const height = ascent + descent;
  /* Baseline sits at ascent from the top of the box. */
  const path = font.getPath(text, 0, ascent, size);
  const d = path.toPathData(4);
  return {
    d,
    widthPx: fit.width,
    heightPx: height,
    baselinePx: ascent,
    fontSizePx: size,
    converged: fit.converged,
  };
}

/*
 * Baseline connector bar for script lettering: a thin capsule rail behind
 * the letterforms so a cursive cut stays in one piece. Emitted as its own
 * closed path; welding with the letter outlines happens in CAM
 * (LightBurn weld / Fusion combine) — noted in the export.
 *
 * baselinePx: y of the text baseline. The bar is centred slightly above
 * the baseline so it crosses the joining strokes of connected scripts.
 */
export function connectorBar({ widthPx, baselinePx, thicknessPx, overhangPx = 0 }) {
  if (thicknessPx <= 0) throw new Error('connectorBar: thickness must be positive');
  const yTop = baselinePx - thicknessPx * 0.75;
  const x0 = -overhangPx;
  const x1 = widthPx + overhangPx;
  const r = thicknessPx / 2;
  return [
    `M${fmt(x0 + r)},${fmt(yTop)}`,
    `L${fmt(x1 - r)},${fmt(yTop)}`,
    `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x1 - r)},${fmt(yTop + thicknessPx)}`,
    `L${fmt(x0 + r)},${fmt(yTop + thicknessPx)}`,
    `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x0 + r)},${fmt(yTop)}`,
    'Z',
  ].join(' ');
}

/* Proof rendering of the lettering: letter-spaced mono caps ("N A Y A").
   Deliberate — names read as shapes; spacing forces letter-by-letter
   verification. Do not "improve" this. */
export function proofSpelling(text) {
  return [...String(text).toUpperCase()].join(' ').replace(/   /g, '  ');
}

export const countLetters = (text) => [...String(text)].filter((c) => c.trim() !== '').length;
