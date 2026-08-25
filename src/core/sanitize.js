/*
 * SVG upload sanitizer. Every uploaded file is hostile until proven
 * boring. Strategy: never pass input through — tokenize it and REBUILD a
 * new document containing only whitelisted elements and attributes.
 * Script tags, event handlers, foreignObject, external references, style
 * blocks and unknown markup simply do not survive the rebuild.
 * Pure strings — no DOM — so it runs identically in Node tests and the
 * browser, and the browser never touches the raw input.
 */

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc',
]);

/* Canonical casing for the camelCase SVG element names. */
const ELEMENT_CASE = { lineargradient: 'linearGradient', radialgradient: 'radialGradient' };

const ALLOWED_ATTRS = new Set([
  'd', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity',
  'opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1',
  'x2', 'y2', 'points', 'width', 'height', 'viewbox', 'offset', 'stop-color',
  'stop-opacity', 'gradientunits', 'gradienttransform', 'id',
]);

const ATTR_CASE = {
  viewbox: 'viewBox',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
};

export const UPLOAD_LIMITS = {
  maxBytes: 512 * 1024,
  maxRasterBytes: 2 * 1024 * 1024,
};

/* An attribute value may not smuggle a reference anywhere. */
function safeAttrValue(v) {
  const s = String(v);
  if (/url\s*\(/i.test(s)) return false;      /* funcIRI — could be external */
  if (/javascript:/i.test(s)) return false;
  if (/&#/.test(s)) return false;             /* entity obfuscation */
  if (s.length > 20000) return false;
  return true;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/*
 * Returns { svg, viewBox, dropped: [..names..] } or throws on inputs that
 * cannot be made safe (too large, no drawable content).
 * The result is INNER markup (children of <svg>) plus the viewBox — ready
 * to be re-hosted inside the engine's own <svg> wrapper.
 */
export function sanitizeSvg(input) {
  if (typeof input !== 'string') throw new Error('upload is not text');
  if (input.length > UPLOAD_LIMITS.maxBytes) {
    throw new Error(`SVG upload too large (max ${UPLOAD_LIMITS.maxBytes / 1024}KB)`);
  }

  /* Remove comments, CDATA, doctype, processing instructions outright. */
  let src = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  const dropped = new Set();
  const out = [];
  let viewBox = null;
  const stack = []; /* names of allowed open elements */
  let skipDepth = 0; /* inside a disallowed element: swallow everything */

  const tagRe = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>/g;
  let m;
  while ((m = tagRe.exec(src)) !== null) {
    const closing = m[1] === '/';
    const rawName = m[2].toLowerCase().replace(/^svg:/, '');
    const attrSrc = m[3] || '';
    const selfClose = m[4] === '/';

    if (closing) {
      if (skipDepth > 0) {
        skipDepth--;
        continue;
      }
      if (stack.length && stack[stack.length - 1] === rawName) {
        stack.pop();
        if (rawName !== 'svg') out.push(`</${ELEMENT_CASE[rawName] || rawName}>`);
      }
      continue;
    }

    if (skipDepth > 0) {
      if (!selfClose) skipDepth++;
      dropped.add(rawName);
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(rawName)) {
      dropped.add(rawName);
      if (!selfClose) skipDepth++;
      continue;
    }

    /* Rebuild attributes from scratch. */
    const attrs = [];
    const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let am;
    while ((am = attrRe.exec(attrSrc)) !== null) {
      const name = am[1].toLowerCase();
      const value = am[3] !== undefined ? am[3] : am[4];
      if (name.startsWith('on')) { dropped.add(`@${name}`); continue; }
      if (name === 'style') { dropped.add('@style'); continue; }
      if (name.includes('href')) { dropped.add(`@${name}`); continue; }
      if (rawName === 'svg' && name === 'viewbox') { viewBox = value; continue; }
      if (rawName === 'svg') continue; /* the host wrapper supplies the rest */
      if (!ALLOWED_ATTRS.has(name)) { dropped.add(`@${name}`); continue; }
      if (!safeAttrValue(value)) { dropped.add(`@${name}(value)`); continue; }
      attrs.push(`${ATTR_CASE[name] || name}="${escAttr(value)}"`);
    }

    if (rawName === 'svg') {
      if (!selfClose) stack.push('svg');
      continue;
    }

    const tag = ELEMENT_CASE[rawName] || rawName;
    out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose ? '/>' : '>'}`);
    if (!selfClose) stack.push(rawName);
  }

  /* Close anything the input left dangling, innermost first. */
  while (stack.length) {
    const name = stack.pop();
    if (name !== 'svg') out.push(`</${ELEMENT_CASE[name] || name}>`);
  }

  const svg = out.join('');
  if (!/<(path|rect|circle|ellipse|line|polyline|polygon)\b/.test(svg)) {
    throw new Error('upload contains no drawable vector content after sanitization');
  }
  return { svg, viewBox: viewBox || '0 0 100 100', dropped: [...dropped] };
}

/* PNG data URL validation: correct MIME, sane size. Raster is PRINT-only —
   enforced again downstream by the layer model. */
export function validatePngDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('raster upload must be a PNG');
  }
  const b64 = dataUrl.slice('data:image/png;base64,'.length);
  const bytes = Math.floor(b64.length * 0.75);
  if (bytes > UPLOAD_LIMITS.maxRasterBytes) {
    throw new Error(`PNG upload too large (max ${UPLOAD_LIMITS.maxRasterBytes / 1024 / 1024}MB)`);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) throw new Error('PNG upload is not valid base64');
  return { dataUrl, bytes };
}
