/*
 * Production SVG writer. The exported document carries real physical
 * dimensions (width="30in") with a matching viewBox at 96 units/inch, so
 * it opens at true size in Fusion 360, Illustrator, and LightBurn with no
 * scaling step. No DOM, no Shopify — string assembly only.
 */

import { PX_PER_IN, fmt } from './geometry.js';
import { LAYER_COLORS, DIMS_GROUP } from './layers.js';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrString(attrs) {
  return Object.entries(attrs || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
}

function renderItem(item, layer) {
  if (item.raw) return item.raw; /* pre-sanitized markup (motifs, dims) */
  if (item.raster) {
    return `<image${attrString(item.attrs)} href="${esc(item.raster)}"/>`;
  }
  const attrs = { d: item.d, ...item.attrs };
  const note = item.note ? `<!-- ${esc(item.note)} -->` : '';
  return `${note}<path${attrString(attrs)}/>`;
}

/*
 * layerSet: from createLayerSet(). dims: optional array of preview items
 * for the #__DIMS group. warnings: array of strings; each becomes a loud
 * comment at the top of the file.
 *
 * mode:
 *  - "production": layers with export colors, dims stripped, warnings kept
 *  - "preview":    everything including dims
 *  - "proof":      CUT/ENGRAVE/SCORE stripped, dims stripped — the finished
 *                  object, not a shop drawing
 */
export function buildSvg({ widthIn, heightIn, layerSet, dims = [], warnings = [], mode = 'production', background = null, defs = '' }) {
  if (!(widthIn > 0) || !(heightIn > 0)) throw new Error('buildSvg: dimensions must be positive');
  const wPx = widthIn * PX_PER_IN;
  const hPx = heightIn * PX_PER_IN;

  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${fmt(widthIn)}in" height="${fmt(heightIn)}in" ` +
    `viewBox="0 0 ${fmt(wPx)} ${fmt(hPx)}">`;

  const parts = [head];
  if (defs) parts.push(`<defs>${defs}</defs>`);

  for (const w of warnings) {
    parts.push(`<!-- !!! WARNING: ${esc(w)} !!! -->`);
  }

  if (background) {
    parts.push(`<rect width="${fmt(wPx)}" height="${fmt(hPx)}" fill="${esc(background)}"/>`);
  }

  if (mode === 'proof') {
    /* The proof is the FINISHED OBJECT, not a shop drawing. CUT geometry
       becomes the filled material silhouette (holes knocked out via
       even-odd), ENGRAVE becomes dark marking, PRINT stays artwork,
       SCORE (registration) is shop-only and does not appear. No
       data-layer groups exist here — nothing toolpath-like survives. */
    if (layerSet.has('CUT')) {
      const ds = layerSet.get('CUT').filter((i) => i.d).map((i) => i.d);
      if (ds.length) {
        parts.push(
          `<path data-proof="body" d="${esc(ds.join(' '))}" fill-rule="evenodd" fill="#DCD6C6" stroke="#B4AC97" stroke-width="1.5"/>`
        );
      }
      for (const item of layerSet.get('CUT').filter((i) => !i.d)) {
        parts.push(`<g data-proof="body-art" fill="#DCD6C6">${renderItem(item, 'CUT')}</g>`);
      }
    }
    if (layerSet.has('ENGRAVE')) {
      parts.push('<g data-proof="marking" fill="#3A4254" stroke="none">');
      for (const item of layerSet.get('ENGRAVE')) parts.push(renderItem(item, 'ENGRAVE'));
      parts.push('</g>');
    }
    if (layerSet.has('PRINT')) {
      parts.push('<g data-proof="artwork" fill="#1B2431" stroke="none">');
      for (const item of layerSet.get('PRINT')) parts.push(renderItem(item, 'PRINT'));
      parts.push('</g>');
    }
  } else {
    for (const layer of layerSet.layers()) {
      const color = LAYER_COLORS[layer];
      const isPrint = layer === 'PRINT';
      /* CUT/ENGRAVE/SCORE are strokes with no fill; PRINT is filled artwork. */
      const groupAttrs = isPrint
        ? { 'data-layer': layer, id: layer, fill: color, stroke: 'none' }
        : { 'data-layer': layer, id: layer, fill: 'none', stroke: color, 'stroke-width': '0.75' };
      parts.push(`<g${attrString(groupAttrs)}>`);
      for (const item of layerSet.get(layer)) parts.push(renderItem(item, layer));
      parts.push('</g>');
    }
  }

  if (mode === 'preview' && dims.length) {
    parts.push(`<g data-layer="${DIMS_GROUP}" id="${DIMS_GROUP}">`);
    for (const item of dims) parts.push(renderItem(item));
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/* Guard used by tests and the export path: a production file must never
   contain live <text> — it would render in a different font on the shop
   machine. */
export function containsLiveText(svg) {
  return /<text[\s>]/.test(svg);
}
