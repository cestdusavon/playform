/*
 * Geometry primitives. Internal unit: 96 SVG user units = 1 inch.
 * Everything here returns real path data — corner treatments are geometry,
 * not CSS, because every path must survive export to Fusion and LightBurn.
 * No DOM, no Shopify.
 */

export const PX_PER_IN = 96;

export const inToPx = (v) => v * PX_PER_IN;
export const pxToIn = (v) => v / PX_PER_IN;

/* Fixed-notation formatter: 4 decimal places, no scientific notation,
   no trailing zeros beyond need. toFixed never emits exponents. */
export function fmt(n) {
  if (!Number.isFinite(n)) throw new Error(`non-finite coordinate: ${n}`);
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
}

export const round4 = (n) => Number(n.toFixed(4));

export const CORNER_TREATMENTS = ['square', 'rounded', 'arch', 'capsule', 'circle'];

export function clampRadius(r, w, h) {
  const max = Math.min(w, h) / 2;
  return Math.min(Math.max(r, 0), max);
}

/*
 * Outline for a panel/backer shape. All dimensions in px (user units),
 * origin at top-left of the bounding box. Returns closed path data.
 */
export function shapeOutline({ shape, w, h, r = 0 }) {
  if (w <= 0 || h <= 0) throw new Error('shapeOutline: non-positive dimensions');
  switch (shape) {
    case 'square':
      return `M0,0 L${fmt(w)},0 L${fmt(w)},${fmt(h)} L0,${fmt(h)} Z`;

    case 'rounded': {
      const rr = clampRadius(r, w, h);
      if (rr === 0) return shapeOutline({ shape: 'square', w, h });
      return [
        `M${fmt(rr)},0`,
        `L${fmt(w - rr)},0`,
        `A${fmt(rr)},${fmt(rr)} 0 0 1 ${fmt(w)},${fmt(rr)}`,
        `L${fmt(w)},${fmt(h - rr)}`,
        `A${fmt(rr)},${fmt(rr)} 0 0 1 ${fmt(w - rr)},${fmt(h)}`,
        `L${fmt(rr)},${fmt(h)}`,
        `A${fmt(rr)},${fmt(rr)} 0 0 1 0,${fmt(h - rr)}`,
        `L0,${fmt(rr)}`,
        `A${fmt(rr)},${fmt(rr)} 0 0 1 ${fmt(rr)},0`,
        'Z',
      ].join(' ');
    }

    case 'arch': {
      /* Flat bottom, semicircular top of radius w/2. Needs h >= w/2. */
      const rad = w / 2;
      if (h < rad) throw new Error('arch: height must be at least width/2');
      return [
        `M0,${fmt(h)}`,
        `L0,${fmt(rad)}`,
        `A${fmt(rad)},${fmt(rad)} 0 0 1 ${fmt(w)},${fmt(rad)}`,
        `L${fmt(w)},${fmt(h)}`,
        'Z',
      ].join(' ');
    }

    case 'capsule': {
      /* Fully rounded ends. Horizontal when w >= h, vertical otherwise. */
      if (w >= h) {
        const rad = h / 2;
        return [
          `M${fmt(rad)},0`,
          `L${fmt(w - rad)},0`,
          `A${fmt(rad)},${fmt(rad)} 0 0 1 ${fmt(w - rad)},${fmt(h)}`,
          `L${fmt(rad)},${fmt(h)}`,
          `A${fmt(rad)},${fmt(rad)} 0 0 1 ${fmt(rad)},0`,
          'Z',
        ].join(' ');
      }
      const rad = w / 2;
      return [
        `M${fmt(w)},${fmt(rad)}`,
        `L${fmt(w)},${fmt(h - rad)}`,
        `A${fmt(rad)},${fmt(rad)} 0 0 1 0,${fmt(h - rad)}`,
        `L0,${fmt(rad)}`,
        `A${fmt(rad)},${fmt(rad)} 0 0 1 ${fmt(w)},${fmt(rad)}`,
        'Z',
      ].join(' ');
    }

    case 'circle': {
      const d = Math.min(w, h);
      const rad = d / 2;
      const cy = h / 2;
      const cx = w / 2;
      return [
        `M${fmt(cx - rad)},${fmt(cy)}`,
        `A${fmt(rad)},${fmt(rad)} 0 0 1 ${fmt(cx + rad)},${fmt(cy)}`,
        `A${fmt(rad)},${fmt(rad)} 0 0 1 ${fmt(cx - rad)},${fmt(cy)}`,
        'Z',
      ].join(' ');
    }

    default:
      throw new Error(`unknown corner treatment: ${shape}`);
  }
}

/* Circle path helper (keychain hole, plinth dots). */
export function circlePath(cx, cy, r) {
  return [
    `M${fmt(cx - r)},${fmt(cy)}`,
    `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(cx + r)},${fmt(cy)}`,
    `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(cx - r)},${fmt(cy)}`,
    'Z',
  ].join(' ');
}

/* Analytic perimeter of a generated shape, in px. */
export function shapePerimeter({ shape, w, h, r = 0 }) {
  switch (shape) {
    case 'square':
      return 2 * (w + h);
    case 'rounded': {
      const rr = clampRadius(r, w, h);
      return 2 * (w + h) - 8 * rr + 2 * Math.PI * rr;
    }
    case 'arch': {
      const rad = w / 2;
      return w + 2 * (h - rad) + Math.PI * rad;
    }
    case 'capsule': {
      const long = Math.max(w, h);
      const short = Math.min(w, h);
      const rad = short / 2;
      return 2 * (long - short) + 2 * Math.PI * rad;
    }
    case 'circle':
      return Math.PI * Math.min(w, h);
    default:
      throw new Error(`unknown corner treatment: ${shape}`);
  }
}

/*
 * Approximate length of an SVG path string. Handles M L H V C Q A Z
 * (absolute and relative). Curves are flattened; accuracy is more than
 * enough for pricing cut inches.
 */
export function pathLength(d) {
  const tokens = d.match(/[MLHVCQAZmlhvcqaz]|-?[\d.]+(?:e-?\d+)?/g);
  if (!tokens) return 0;
  let i = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let len = 0;
  let cmd = null;

  const num = () => parseFloat(tokens[i++]);
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

  const cubic = (x1, y1, cx1, cy1, cx2, cy2, x2, y2) => {
    const N = 24;
    let px = x1;
    let py = y1;
    let l = 0;
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      const mt = 1 - t;
      const bx = mt * mt * mt * x1 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x2;
      const by = mt * mt * mt * y1 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y2;
      l += dist(px, py, bx, by);
      px = bx;
      py = by;
    }
    return l;
  };

  const quad = (x1, y1, cx, cy, x2, y2) =>
    cubic(x1, y1, x1 + (2 / 3) * (cx - x1), y1 + (2 / 3) * (cy - y1), x2 + (2 / 3) * (cx - x2), y2 + (2 / 3) * (cy - y2), x2, y2);

  /* Endpoint-parameterised arc length via centre conversion + sampling. */
  const arc = (x1, y1, rx, ry, phi, laf, sf, x2, y2) => {
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (rx === 0 || ry === 0) return dist(x1, y1, x2, y2);
    const rad = (phi * Math.PI) / 180;
    const cosP = Math.cos(rad);
    const sinP = Math.sin(rad);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = cosP * dx + sinP * dy;
    const y1p = -sinP * dx + cosP * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) {
      const s = Math.sqrt(lam);
      rx *= s;
      ry *= s;
    }
    const sign = laf === sf ? -1 : 1;
    const numr = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, numr / den));
    const cxp = (co * rx * y1p) / ry;
    const cyp = (-co * ry * x1p) / rx;
    const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
    const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => {
      const d0 = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      let a = Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / d0)));
      if (ux * vy - uy * vx < 0) a = -a;
      return a;
    };
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sf && dth > 0) dth -= 2 * Math.PI;
    if (sf && dth < 0) dth += 2 * Math.PI;
    const N = 32;
    let px = x1;
    let py = y1;
    let l = 0;
    for (let k = 1; k <= N; k++) {
      const t = th1 + (dth * k) / N;
      const bx = cx + rx * Math.cos(rad) * Math.cos(t) - ry * Math.sin(rad) * Math.sin(t);
      const by = cy + rx * Math.sin(rad) * Math.cos(t) + ry * Math.cos(rad) * Math.sin(t);
      l += dist(px, py, bx, by);
      px = bx;
      py = by;
    }
    return l;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        len += dist(x, y, sx, sy);
        x = sx;
        y = sy;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        x = sx = nx;
        y = sy = ny;
        cmd = rel ? 'l' : 'L'; /* subsequent pairs are lines */
        break;
      }
      case 'L': {
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        len += dist(x, y, nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case 'H': {
        const nx = num() + (rel ? x : 0);
        len += Math.abs(nx - x);
        x = nx;
        break;
      }
      case 'V': {
        const ny = num() + (rel ? y : 0);
        len += Math.abs(ny - y);
        y = ny;
        break;
      }
      case 'C': {
        const c1x = num() + (rel ? x : 0);
        const c1y = num() + (rel ? y : 0);
        const c2x = num() + (rel ? x : 0);
        const c2y = num() + (rel ? y : 0);
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        len += cubic(x, y, c1x, c1y, c2x, c2y, nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case 'Q': {
        const cx = num() + (rel ? x : 0);
        const cy = num() + (rel ? y : 0);
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        len += quad(x, y, cx, cy, nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const laf = num();
        const sf = num();
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        len += arc(x, y, rx, ry, rot, laf, sf, nx, ny);
        x = nx;
        y = ny;
        break;
      }
      default:
        throw new Error(`pathLength: unsupported command ${cmd}`);
    }
  }
  return len;
}

/* A path is "closed" if every subpath ends with Z. */
export function isClosedPath(d) {
  const subs = d
    .split(/(?=[Mm])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return subs.length > 0 && subs.every((s) => /[Zz]\s*$/.test(s));
}
