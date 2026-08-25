/*
 * Configurator engine — public API. No DOM, no Shopify, no fetching.
 * The UI (or a Node test, or a future app-extension server) injects:
 *  - a measure provider: measureFor(fontId, text) -> (sizePx) -> widthPx
 *  - an outline provider: outlineFor(fontId) -> opentype Font | null
 * and reads back preview/production SVG, pricing, and the canonical spec.
 *
 * One engine, many products: geometry is selected by schema.geometry.kind
 * (lettering | panel | tag | figure | wrap) — archetypes, never product
 * names. A sixth product type is a new JSON schema, not new code.
 */

import { PX_PER_IN, inToPx, pxToIn, round4, fmt, shapeOutline, shapePerimeter, clampRadius, circlePath, pathLength } from './geometry.js';
import { solveFontSize, letteringOutline, connectorBar, proofSpelling, countLetters } from './text.js';
import { createLayerSet, motifLayerAllowed } from './layers.js';
import { evaluatePricing } from './pricing.js';
import { buildSvg, containsLiveText } from './svg.js';
import { SPEC_VERSION, ENGINE_VERSION, buildSpec, serializeSpec, deserializeSpec, specToValues, clampParamValue, specByteLength, SPEC_BYTE_BUDGET, chunkAsset } from './spec.js';

export { ENGINE_VERSION };

export function createEngine(schema, options = {}) {
  if (!schema || !Array.isArray(schema.params)) throw new Error('createEngine: invalid schema');
  const fonts = options.fonts || [];
  const motifs = options.motifs || [];
  const rateCard = { ...(schema.pricing || {}), ...(options.rateOverrides || {}) };

  const paramByKey = new Map(schema.params.map((p) => [p.key, p]));
  const values = {};
  for (const p of schema.params) if (p.default !== undefined) values[p.key] = p.default;

  let upload = null; // { kind:'svg'|'png', content, layer, x, y, scale, rot }
  let approval = null; // { approvedAt, textAtApproval, totalAtApproval }
  const listeners = { change: [], approvalVoided: [] };

  /* Injected measurement. Default: crude aspect model so the engine still
     functions headless; the UI always injects a real canvas measurer. */
  let measureFor =
    options.measureFor ||
    ((fontId, text) => (size) => size * 0.52 * Math.max(1, countLetters(text)));
  let outlineFor = options.outlineFor || (() => null);

  const emit = (ev, data) => listeners[ev].forEach((cb) => cb(data));

  function voidApproval(reason) {
    if (approval) {
      approval = null;
      emit('approvalVoided', { reason });
    }
  }

  function fontEntry(fontId) {
    return fonts.find((f) => f.id === fontId) || null;
  }

  function motifEntry(motifId) {
    return motifs.find((m) => m.id === motifId) || null;
  }

  /* ------------------------------------------------------------------ *
   * Geometry generators. Each returns:
   * { widthIn, heightIn, layerSet, dims, warnings, metrics }
   * mode: 'preview' | 'production' | 'proof'
   * ------------------------------------------------------------------ */

  function letteringGeometry(mode, warnings) {
    const text = String(values.text || '').trim() || ' ';
    const fontId = values.font;
    const font = fontEntry(fontId);
    const targetWpx = inToPx(values.widthIn);
    const mount = values.mount || 'standalone';
    const layerSet = createLayerSet(schema.processes);
    const metrics = { letters: countLetters(text) };

    let lettering = null;
    const wantOutlines = mode !== 'preview';
    /* Licence gate FIRST: a font with allowOutlineExport:false may render
       in preview but must never have outlines extracted for production —
       even when the binary is available. */
    if (wantOutlines && font && font.allowOutlineExport === false) {
      throw new EngineExportError(
        `The font "${font.name}" is licensed for preview only — production export with outlines is not permitted. Choose another font or contact the shop.`
      );
    }
    const otFont = wantOutlines || options.outlinePreview !== false ? outlineFor(fontId) : null;

    /* Backer padding scales with the piece. */
    const pad = mount === 'backer' ? Math.max(inToPx(0.75), targetWpx * 0.05) : 0;
    const letterTargetPx = targetWpx - pad * 2;

    if (otFont) {
      lettering = letteringOutline({ font: otFont, text, targetWidthPx: letterTargetPx });
    } else {
      const measure = measureFor(fontId, text);
      const fit = solveFontSize({ measure, targetWidthPx: letterTargetPx });
      lettering = {
        d: null,
        widthPx: fit.width,
        heightPx: fit.size * 1.25,
        baselinePx: fit.size,
        fontSizePx: fit.size,
        converged: fit.converged,
      };
      if (wantOutlines) {
        warnings.push(
          `PRODUCTION FILE CONTAINS LIVE <text> — font outlines for "${font ? font.name : fontId}" were unavailable at export time. This file WILL render in the wrong font on any machine without the font installed. Re-export with outlines before cutting.`
        );
      }
    }

    const letterHpx = lettering.heightPx;
    const heightPx = mount === 'backer' ? letterHpx + pad * 2 : letterHpx;
    const heightIn = round4(pxToIn(heightPx));
    const ox = pad; /* lettering origin inside the piece */
    const oy = pad;

    const letterItem = lettering.d
      ? { d: translatePath(lettering.d, ox, oy) }
      : {
          raw: `<text x="${fmt(ox)}" y="${fmt(oy + lettering.baselinePx)}" font-family="${escAttr(font ? font.family : 'sans-serif')}" font-size="${fmt(lettering.fontSizePx)}">${escText(text)}</text>`,
        };

    let cutLengthPx = 0;

    if (mount === 'backer') {
      const shape = values.corner || 'rounded';
      const r = clampRadius(inToPx(values.cornerRadiusIn ?? 1), targetWpx, heightPx);
      const outline = shapeOutline({ shape, w: targetWpx, h: heightPx, r });
      layerSet.add('CUT', { d: outline, note: 'backer outline' });
      cutLengthPx += shapePerimeter({ shape, w: targetWpx, h: heightPx, r });
      const letterLayer = schema.processes.includes('uv') && values.finish === 'printed' ? 'PRINT' : 'ENGRAVE';
      layerSet.add(letterLayer, { ...letterItem, note: 'lettering' });
      if (letterLayer === 'PRINT') {
        metrics.printedAreaSqIn = round4(pxToIn(lettering.widthPx) * pxToIn(letterHpx) * 0.55);
      }
    } else {
      layerSet.add('CUT', { ...letterItem, note: 'lettering — through-cut' });
      if (lettering.d) cutLengthPx += pathLength(lettering.d);

      const connected = font ? font.connected === true : false;
      const wantBar = values.connector === 'auto' ? connected : Boolean(values.connector);
      if (wantBar) {
        const thickness = inToPx(values.connectorThicknessIn ?? 0.25);
        const bar = connectorBar({
          widthPx: lettering.widthPx,
          baselinePx: lettering.baselinePx,
          thicknessPx: thickness,
        });
        layerSet.add('CUT', {
          d: translatePath(bar, ox, oy),
          note: 'baseline connector bar — WELD with lettering in LightBurn/Fusion before cutting',
        });
        cutLengthPx += pathLength(bar);
      }
    }

    metrics.areaSqIn = round4(values.widthIn * heightIn);
    metrics.cutLengthIn = round4(pxToIn(cutLengthPx));
    return { widthIn: values.widthIn, heightIn, layerSet, metrics, lettering: { ...lettering, ox, oy } };
  }

  function panelGeometry(mode, warnings) {
    const w = values.widthIn;
    const aspect = parseAspect(values.aspect || '3:2');
    const shape = values.corner || 'rounded';
    const heightIn = shape === 'circle' ? w : round4(w / aspect);
    const wPx = inToPx(w);
    const hPx = inToPx(heightIn);
    const layerSet = createLayerSet(schema.processes);
    const metrics = { letters: 0 };

    const r = clampRadius(inToPx(values.cornerRadiusIn ?? 0.5), wPx, hPx);
    layerSet.add('CUT', { d: shapeOutline({ shape, w: wPx, h: hPx, r }), note: 'panel outline' });
    let cutLengthPx = shapePerimeter({ shape, w: wPx, h: hPx, r });

    let printedAreaSqIn = 0;
    if (values.fullBleed) {
      layerSet.add('PRINT', {
        d: shapeOutline({ shape, w: wPx, h: hPx, r }),
        note: 'full-bleed printed background',
        areaSqIn: w * heightIn,
      });
      printedAreaSqIn += w * heightIn;
    }

    const text = String(values.text || '').trim();
    if (text) {
      metrics.letters = countLetters(text);
      const safe = inToPx(schema.safeAreaIn ?? 0.25);
      const t = fitTextBlock(text, values.font, wPx - safe * 2, mode, warnings);
      const tx = (wPx - t.widthPx) / 2;
      const ty = (hPx - t.heightPx) / 2;
      const layer = values.textLayer === 'engrave' ? 'ENGRAVE' : 'PRINT';
      layerSet.add(layer, { ...itemFor(t, tx, ty), note: 'panel text' });
      if (layer === 'PRINT') printedAreaSqIn += pxToIn(t.widthPx) * pxToIn(t.heightPx) * 0.55;
    }

    applyMotifAndUpload(layerSet, wPx, hPx, (a) => (printedAreaSqIn += a), warnings);

    metrics.areaSqIn = round4(w * heightIn);
    metrics.cutLengthIn = round4(pxToIn(cutLengthPx));
    metrics.printedAreaSqIn = round4(printedAreaSqIn);
    return { widthIn: w, heightIn, layerSet, metrics };
  }

  function tagGeometry(mode, warnings) {
    const w = values.widthIn;
    const wPx = inToPx(w);
    const shape = values.corner || 'capsule';
    const layerSet = createLayerSet(schema.processes);
    const text = String(values.text || '').trim();
    const metrics = { letters: countLetters(text) };
    const pad = inToPx(0.2);
    const holeR = inToPx((values.holeDiameterIn ?? 0.2) / 2);
    const holeZone = holeR * 2 + pad; /* left area reserved for the hole */

    const t = text ? fitTextBlock(text, values.font, wPx - holeZone - pad * 2, mode, warnings) : null;
    const contentH = t ? t.heightPx : inToPx(0.6);
    const hPx = shape === 'circle' ? wPx : contentH + pad * 2;
    const heightIn = round4(pxToIn(hPx));

    const r = clampRadius(inToPx(values.cornerRadiusIn ?? 0.25), wPx, hPx);
    layerSet.add('CUT', { d: shapeOutline({ shape, w: wPx, h: hPx, r }), note: 'tag outline' });
    let cutLengthPx = shapePerimeter({ shape, w: wPx, h: hPx, r });

    /* Keychain hole — through-cut, kept clear of the safe area. */
    const hx = pad + holeR;
    const hy = hPx / 2;
    layerSet.add('CUT', { d: circlePath(hx, hy, holeR), note: 'keyring hole' });
    cutLengthPx += 2 * Math.PI * holeR;

    let printedAreaSqIn = 0;
    if (t) {
      const tx = holeZone + pad;
      const ty = (hPx - t.heightPx) / 2;
      const layer = values.textLayer === 'raised' ? 'PRINT' : 'ENGRAVE';
      layerSet.add(layer, { ...itemFor(t, tx, ty), note: 'tag text' });
      if (layer === 'PRINT') printedAreaSqIn += pxToIn(t.widthPx) * pxToIn(t.heightPx) * 0.55;
    }

    applyMotifAndUpload(layerSet, wPx, hPx, (a) => (printedAreaSqIn += a), warnings);

    metrics.areaSqIn = round4(w * heightIn);
    metrics.cutLengthIn = round4(pxToIn(cutLengthPx));
    metrics.printedAreaSqIn = round4(printedAreaSqIn);
    return { widthIn: w, heightIn, layerSet, metrics };
  }

  function figureGeometry(mode, warnings) {
    /* Parametric 3D character: the 2D document is a to-scale reference
       sheet (silhouette + plinth), not cutting geometry — no CUT layer
       can exist here (processes are fdm/resin). */
    const hIn = values.heightIn;
    const motif = motifEntry(values.figure) || motifs.find((m) => m.tags && m.tags.includes('figure'));
    const aspect = motif && motif.aspect ? motif.aspect : 0.6;
    const plinth = Boolean(values.plinth);
    const plinthHin = plinth ? Math.max(0.5, hIn * 0.12) : 0;
    const bodyHin = hIn - plinthHin;
    const wIn = round4(Math.max(bodyHin * aspect, plinth ? bodyHin * aspect * 1.2 : 0.1));
    const wPx = inToPx(wIn);
    const hPx = inToPx(hIn);
    const layerSet = createLayerSet(schema.processes);
    const metrics = { letters: 0 };

    if (motif) {
      layerSet.add('PRINT', {
        raw: placeMotifMarkup(motif, { x: 0, y: 0, w: wPx, h: inToPx(bodyHin) }),
        note: 'figure silhouette — reference only',
      });
    }
    if (plinth) {
      const py = inToPx(bodyHin);
      layerSet.add('PRINT', {
        d: shapeOutline({ shape: 'rounded', w: wPx, h: inToPx(plinthHin), r: inToPx(0.1) }).replace(/^M/, `M`),
        attrs: { transform: `translate(0 ${fmt(py)})`, 'fill-opacity': '0.25' },
        note: 'name plinth',
      });
      const name = String(values.text || '').trim();
      if (name) {
        metrics.letters = countLetters(name);
        const t = fitTextBlock(name, values.font, wPx * 0.8, mode, warnings);
        const s = Math.min(1, (inToPx(plinthHin) * 0.6) / t.heightPx);
        const tx = (wPx - t.widthPx * s) / 2;
        const ty = py + (inToPx(plinthHin) - t.heightPx * s) / 2;
        layerSet.add('PRINT', {
          ...itemFor(t, 0, 0),
          attrs: { transform: `translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(s)})` },
          note: 'plinth name',
        });
      }
    }

    metrics.areaSqIn = round4(wIn * hIn);
    metrics.cutLengthIn = 0;
    metrics.printedAreaSqIn = 0;
    return { widthIn: wIn, heightIn: hIn, layerSet, metrics };
  }

  function wrapGeometry(mode, warnings) {
    /* Container: FDM body + a flat wrap development for the surface
       graphic. Wrap width = circumference, height = printable band. */
    const size = values.bodySize || 'medium';
    const preset = (schema.bodies || []).find((b) => b.id === size) || { dIn: 3.5, bandIn: 3 };
    const wIn = round4(Math.PI * preset.dIn);
    const hIn = preset.bandIn;
    const wPx = inToPx(wIn);
    const hPx = inToPx(hIn);
    const layerSet = createLayerSet(schema.processes);
    const text = String(values.text || '').trim();
    const metrics = { letters: countLetters(text) };
    let printedAreaSqIn = 0;

    if (values.fullBleed) {
      layerSet.add('PRINT', {
        d: shapeOutline({ shape: 'square', w: wPx, h: hPx }),
        note: 'full-bleed wrap background',
      });
      printedAreaSqIn += wIn * hIn;
    }

    if (text) {
      const t = fitTextBlock(text, values.font, wPx * 0.5, mode, warnings);
      const tx = (wPx - t.widthPx) / 2;
      const ty = (hPx - t.heightPx) / 2;
      const layer = values.textLayer === 'engrave' ? 'ENGRAVE' : 'PRINT';
      layerSet.add(layer, { ...itemFor(t, tx, ty), note: 'wrap text' });
      if (layer === 'PRINT') printedAreaSqIn += pxToIn(t.widthPx) * pxToIn(t.heightPx) * 0.55;
    }

    applyMotifAndUpload(layerSet, wPx, hPx, (a) => (printedAreaSqIn += a), warnings);

    metrics.areaSqIn = round4(wIn * hIn);
    metrics.cutLengthIn = 0;
    metrics.printedAreaSqIn = round4(printedAreaSqIn);
    return { widthIn: wIn, heightIn: hIn, layerSet, metrics };
  }

  /* ---------------- shared helpers ---------------- */

  function fitTextBlock(text, fontId, targetWpx, mode, warnings) {
    const font = fontEntry(fontId);
    if (mode !== 'preview' && font && font.allowOutlineExport === false) {
      throw new EngineExportError(
        `The font "${font.name}" is licensed for preview only — production export with outlines is not permitted.`
      );
    }
    const otFont = outlineFor(fontId);
    if (otFont) {
      return letteringOutline({ font: otFont, text, targetWidthPx: targetWpx });
    }
    const measure = measureFor(fontId, text);
    const fit = solveFontSize({ measure, targetWidthPx: targetWpx });
    if (mode !== 'preview') {
      warnings.push(
        `PRODUCTION FILE CONTAINS LIVE <text> — outlines for "${font ? font.name : fontId}" unavailable. Re-export with outlines before production.`
      );
    }
    return {
      d: null,
      text,
      family: font ? font.family : 'sans-serif',
      widthPx: fit.width,
      heightPx: fit.size * 1.25,
      baselinePx: fit.size,
      fontSizePx: fit.size,
    };
  }

  function itemFor(t, x, y) {
    if (t.d) return { d: translatePath(t.d, x, y) };
    return {
      raw: `<text x="${fmt(x)}" y="${fmt(y + t.baselinePx)}" font-family="${escAttr(t.family)}" font-size="${fmt(t.fontSizePx)}">${escText(t.text)}</text>`,
    };
  }

  function applyMotifAndUpload(layerSet, wPx, hPx, addPrintedArea, warnings) {
    const safe = inToPx(schema.safeAreaIn ?? 0.25);
    if (values.motif) {
      const motif = motifEntry(values.motif);
      if (motif) {
        const layer = values.motifLayer && motifLayerAllowed(motif, values.motifLayer) ? values.motifLayer : motif.layers[0];
        const frac = clampParamValue({ type: 'number', min: 0.1, max: 0.9 }, values.motifScale ?? 0.35);
        const mw = (wPx - safe * 2) * frac;
        const mh = mw / (motif.aspect || 1);
        const mx = safe + clamp01(values.motifX ?? 0.5) * (wPx - safe * 2 - mw);
        const my = safe + clamp01(values.motifY ?? 0.5) * (hPx - safe * 2 - mh);
        const rot = Number(values.motifRotation || 0) % 360;
        layerSet.add(layer, {
          raw: placeMotifMarkup(motif, { x: mx, y: my, w: mw, h: mh, rot }),
          note: `motif: ${motif.id}`,
        });
        if (layer === 'PRINT') addPrintedArea(pxToIn(mw) * pxToIn(mh) * 0.6);
      }
    }
    if (upload) {
      const frac = clamp01(upload.scale ?? 0.4);
      const mw = (wPx - safe * 2) * frac;
      const mh = mw / (upload.aspect || 1);
      const mx = safe + clamp01(upload.x ?? 0.5) * (wPx - safe * 2 - mw);
      const my = safe + clamp01(upload.y ?? 0.5) * (hPx - safe * 2 - mh);
      const rot = Number(upload.rot || 0) % 360;
      const layer = upload.kind === 'png' ? 'PRINT' : upload.layer || 'PRINT';
      const transform = `translate(${fmt(mx)} ${fmt(my)})${rot ? ` rotate(${fmt(rot)} ${fmt(mw / 2)} ${fmt(mh / 2)})` : ''}`;
      if (upload.kind === 'png') {
        layerSet.add('PRINT', {
          raster: upload.content,
          attrs: { transform, width: fmt(mw), height: fmt(mh), preserveAspectRatio: 'xMidYMid meet' },
          note: 'customer upload (raster)',
        });
      } else {
        layerSet.add(layer, {
          raw: `<g transform="${transform}"><svg width="${fmt(mw)}" height="${fmt(mh)}" viewBox="${escAttr(upload.viewBox || '0 0 100 100')}" preserveAspectRatio="xMidYMid meet">${upload.content}</svg></g>`,
          note: 'customer upload (vector)',
        });
      }
      if (layer === 'PRINT') addPrintedArea(pxToIn(mw) * pxToIn(mh) * 0.7);
    }
  }

  function generate(mode) {
    const warnings = [];
    const kind = schema.geometry && schema.geometry.kind;
    const generators = {
      lettering: letteringGeometry,
      panel: panelGeometry,
      tag: tagGeometry,
      figure: figureGeometry,
      wrap: wrapGeometry,
    };
    const gen = generators[kind];
    if (!gen) throw new Error(`unknown geometry kind: ${kind}`);
    const g = gen(mode, warnings);
    g.warnings = warnings;
    return g;
  }

  function dimsFor(g) {
    const wPx = inToPx(g.widthIn);
    const hPx = inToPx(g.heightIn);
    const label = (x, y, s) =>
      `<text x="${fmt(x)}" y="${fmt(y)}" font-family="'IBM Plex Mono', monospace" font-size="${fmt(Math.max(10, wPx * 0.02))}" fill="#8A93A6" text-anchor="middle">${escText(s)}</text>`;
    return [
      { raw: `<line x1="0" y1="${fmt(hPx + 24)}" x2="${fmt(wPx)}" y2="${fmt(hPx + 24)}" stroke="#8A93A6" stroke-width="1" stroke-dasharray="4 3"/>` },
      { raw: label(wPx / 2, hPx + 44, `${g.widthIn}"`) },
      { raw: `<line x1="${fmt(wPx + 24)}" y1="0" x2="${fmt(wPx + 24)}" y2="${fmt(hPx)}" stroke="#8A93A6" stroke-width="1" stroke-dasharray="4 3"/>` },
      { raw: label(wPx + 24, hPx / 2, `${g.heightIn}"`) },
    ];
  }

  /* ---------------- public API ---------------- */

  const api = {
    schema,
    ENGINE_VERSION,

    getValues: () => ({ ...values }),
    getValue: (key) => values[key],

    /* A param hidden by its showIf condition is inactive: its value must
       not surface in proofs or order properties. */
    isParamVisible(key) {
      const param = paramByKey.get(key);
      if (!param) return false;
      if (!param.showIf) return true;
      return Object.entries(param.showIf).every(([k, expected]) => {
        const actual = values[k];
        if (expected === '*') return actual !== undefined && actual !== null && actual !== '';
        return actual === expected;
      });
    },

    setValue(key, v) {
      const param = paramByKey.get(key);
      if (!param) throw new Error(`unknown param: ${key}`);
      const next = clampParamValue(param, v);
      if (values[key] === next) return values[key];
      values[key] = next;
      /* Any edit voids an existing approval — an approval must never refer
         to a different design than the one in the file. */
      voidApproval(`edit:${key}`);
      emit('change', { key, value: next });
      return next;
    },

    setMeasureProvider(fn) {
      measureFor = fn;
    },
    setOutlineProvider(fn) {
      outlineFor = fn;
    },

    setUpload(u) {
      if (u && u.kind === 'png') u.layer = 'PRINT'; /* raster never cuts */
      upload = u;
      voidApproval('edit:upload');
      emit('change', { key: 'upload' });
    },
    getUpload: () => upload,

    getGeometry: (mode = 'preview') => generate(mode),

    getMetrics() {
      const g = generate('preview');
      return { ...g.metrics, widthIn: g.widthIn, heightIn: g.heightIn };
    },

    getPrice() {
      const g = generate('preview');
      return evaluatePricing(rateCard, {
        ...g.metrics,
        materialKey: values.material,
        thicknessKey: values.thickness,
      });
    },

    buildPreviewSvg() {
      const g = generate('preview');
      return buildSvg({
        widthIn: g.widthIn,
        heightIn: g.heightIn,
        layerSet: g.layerSet,
        dims: dimsFor(g),
        warnings: [],
        mode: 'preview',
      });
    },

    /* The proof shows the finished object: CUT/ENGRAVE stripped. */
    buildProofSvg() {
      const g = generate('proof');
      return {
        svg: buildSvg({ widthIn: g.widthIn, heightIn: g.heightIn, layerSet: g.layerSet, mode: 'proof' }),
        warnings: g.warnings,
      };
    },

    buildProductionSvg() {
      const g = generate('production');
      const svg = buildSvg({
        widthIn: g.widthIn,
        heightIn: g.heightIn,
        layerSet: g.layerSet,
        warnings: g.warnings,
        mode: 'production',
      });
      return { svg, warnings: g.warnings, containsLiveText: containsLiveText(svg) };
    },

    /* -------- spec -------- */

    getSpec() {
      const spec = buildSpec(schema, values);
      if (upload) {
        const { ref, properties } = chunkAsset(upload.content);
        spec.a = {
          h: ref,
          k: upload.kind,
          l: upload.layer || 'PRINT',
          x: upload.x ?? 0.5,
          y: upload.y ?? 0.5,
          s: upload.scale ?? 0.4,
          r: upload.rot ?? 0,
          ar: upload.aspect || 1,
          vb: upload.viewBox,
        };
        return { spec, assetProperties: properties };
      }
      return { spec, assetProperties: {} };
    },

    serializeSpec() {
      const { spec } = api.getSpec();
      return serializeSpec(spec);
    },

    specWithinBudget() {
      const { spec } = api.getSpec();
      return specByteLength(spec) <= SPEC_BYTE_BUDGET;
    },

    loadSpec(specOrJson, { assets } = {}) {
      const spec = deserializeSpec(specOrJson);
      const restored = specToValues(spec, schema);
      Object.assign(values, restored);
      if (spec.a && assets && assets[spec.a.h]) {
        upload = {
          kind: spec.a.k,
          content: assets[spec.a.h],
          layer: spec.a.l,
          x: spec.a.x,
          y: spec.a.y,
          scale: spec.a.s,
          rot: spec.a.r,
          aspect: spec.a.ar,
          viewBox: spec.a.vb,
        };
      } else if (spec.a) {
        upload = null; /* asset content not provided — spec still loads */
      }
      voidApproval('loadSpec');
      emit('change', { key: '*' });
      return spec;
    },

    /* -------- approval lifecycle -------- */

    approve() {
      const price = api.getPrice();
      approval = {
        approvedAt: new Date().toISOString(),
        textAtApproval: String(values.text || ''),
        totalAtApproval: price.total,
      };
      return { ...approval };
    },
    getApproval: () => (approval ? { ...approval } : null),
    isApproved: () => approval !== null,

    /* -------- cart contract -------- */

    buildLineItemProperties({ termsCopy } = {}) {
      if (!approval) throw new Error('cannot build line item properties before proof approval');
      const g = generate('preview');
      const price = api.getPrice();
      const { spec, assetProperties } = api.getSpec();
      const specJson = serializeSpec(spec);
      const font = fontEntry(values.font);
      const material = choiceLabel('material');
      const finish = choiceLabel('finish') || choiceLabel('textLayer');
      const shapeL = choiceLabel('corner') || choiceLabel('mount') || choiceLabel('bodySize');

      const visible = {
        Size: `${g.widthIn}" × ${g.heightIn}"`,
        ...(values.text ? { Lettering: String(values.text) } : {}),
        ...(font ? { Font: font.name } : {}),
        ...(material ? { Material: material + (values.thickness ? ` ${values.thickness}` : '') } : {}),
        ...(shapeL ? { Shape: shapeL } : {}),
        ...(finish ? { Finish: finish } : {}),
        'Spelling confirmed by customer': 'Yes',
      };
      const hidden = {
        _spec: specJson,
        _proof_approved_at: approval.approvedAt,
        _proof_text_at_approval: approval.textAtApproval,
        _payment_terms: 'full-on-approval',
        _process: schema.processes.join('+'),
        _engine_version: ENGINE_VERSION,
        _price_breakdown: JSON.stringify(price.breakdown),
        ...assetProperties,
      };
      return { ...visible, ...hidden };
    },

    proofSpelling: () => proofSpelling(values.text || ''),

    on(ev, cb) {
      if (!listeners[ev]) throw new Error(`unknown event: ${ev}`);
      listeners[ev].push(cb);
      return () => {
        listeners[ev] = listeners[ev].filter((f) => f !== cb);
      };
    },
  };

  function choiceLabel(key) {
    const param = paramByKey.get(key);
    if (!param || values[key] === undefined) return null;
    if (param.type !== 'choice') return null;
    if (!api.isParamVisible(key)) return null;
    const opt = (param.options || []).find((o) => (o.v ?? o) === values[key]);
    return opt ? opt.label ?? String(opt.v ?? opt) : String(values[key]);
  }

  return api;
}

export class EngineExportError extends Error {}

/* ---------------- module-level helpers ---------------- */

function parseAspect(s) {
  const m = String(s).match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!m) return 1.5;
  return Number(m[1]) / Number(m[2]);
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/*
 * Translate an absolute-command path (M L H V C Q A Z — what opentype.js
 * and our shape generators emit). Coordinates are rewritten, not wrapped
 * in a transform, so the exported file stays flat for CAM import.
 */
function translatePath(d, dx, dy) {
  if (dx === 0 && dy === 0) return d;
  const tokens = d.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) || [];
  const out = [];
  let cmd = null;
  let i = 0;
  const shift = { M: [1, 1], L: [1, 1], C: [1, 1, 1, 1, 1, 1], Q: [1, 1, 1, 1], H: ['x'], V: ['y'], A: [0, 0, 0, 0, 0, 1, 1] };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t.toUpperCase();
      if (t !== cmd) throw new Error(`translatePath: relative command ${t} not supported`);
      out.push(t);
      i++;
      if (cmd === 'Z') continue;
    }
    if (cmd === 'H') {
      out.push(fmt(parseFloat(tokens[i++]) + dx));
    } else if (cmd === 'V') {
      out.push(fmt(parseFloat(tokens[i++]) + dy));
    } else if (cmd === 'A') {
      /* rx ry rot laf sf x y — only the endpoint shifts */
      for (let k = 0; k < 5; k++) out.push(tokens[i++]);
      out.push(fmt(parseFloat(tokens[i++]) + dx));
      out.push(fmt(parseFloat(tokens[i++]) + dy));
    } else if (cmd === 'M' || cmd === 'L' || cmd === 'C' || cmd === 'Q') {
      const pairs = cmd === 'C' ? 3 : cmd === 'Q' ? 2 : 1;
      for (let p = 0; p < pairs; p++) {
        out.push(fmt(parseFloat(tokens[i++]) + dx));
        out.push(fmt(parseFloat(tokens[i++]) + dy));
      }
    } else {
      throw new Error(`translatePath: unsupported command ${cmd}`);
    }
  }
  return out
    .join(' ')
    .replace(/([A-Za-z]) /g, '$1')
    .trim();
}

function escText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function placeMotifMarkup(motif, { x, y, w, h, rot = 0 }) {
  const transform = `translate(${fmt(x)} ${fmt(y)})${rot ? ` rotate(${fmt(rot)} ${fmt(w / 2)} ${fmt(h / 2)})` : ''}`;
  return `<g transform="${transform}"><svg width="${fmt(w)}" height="${fmt(h)}" viewBox="${escAttr(motif.viewBox)}" preserveAspectRatio="xMidYMid meet">${motif.markup}</svg></g>`;
}
