import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PX_PER_IN, fmt, shapeOutline, shapePerimeter, clampRadius, pathLength, isClosedPath } from '../src/core/geometry.js';
import { solveFontSize, proofSpelling, connectorBar } from '../src/core/text.js';
import { createLayerSet, allowedLayers, motifLayerAllowed } from '../src/core/layers.js';
import { evaluatePricing, roundCents } from '../src/core/pricing.js';
import { buildSpec, serializeSpec, deserializeSpec, specToValues, specByteLength, chunkAsset, reassembleAsset } from '../src/core/spec.js';
import { buildSvg, containsLiveText } from '../src/core/svg.js';
import { sanitizeSvg, validatePngDataUrl } from '../src/core/sanitize.js';
import { createEngine } from '../src/core/engine.js';

import nameSign from '../src/schemas/name-sign.json' with { type: 'json' };
import character3d from '../src/schemas/character-3d.json' with { type: 'json' };
import keychain from '../src/schemas/keychain.json' with { type: 'json' };

/* A deterministic fake opentype font: advance = 0.5em per char. */
const fakeFont = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  getAdvanceWidth: (text, size) => text.length * 0.5 * size,
  getPath: (text, x, y, size) => ({
    toPathData: () => {
      const w = text.length * 0.5 * size;
      return `M${x.toFixed(4)},${(y - size * 0.7).toFixed(4)} L${(x + w).toFixed(4)},${(y - size * 0.7).toFixed(4)} L${(x + w).toFixed(4)},${y.toFixed(4)} L${x.toFixed(4)},${y.toFixed(4)} Z`;
    },
  }),
};

const fonts = [
  { id: 'test-script', name: 'Test Script', family: 'serif', connected: true, allowOutlineExport: true },
  { id: 'locked-font', name: 'Locked Font', family: 'serif', connected: false, allowOutlineExport: false },
];

function engineFor(schema, overrides = {}) {
  return createEngine(schema, {
    fonts,
    motifs: [
      { id: 'star', viewBox: '0 0 24 24', markup: '<path d="M12 2 L15 9 L22 9 L16 14 L18 22 L12 17 L6 22 L8 14 L2 9 L9 9 Z"/>', layers: ['CUT', 'ENGRAVE'], aspect: 1 },
      { id: 'rainbow', viewBox: '0 0 24 24', markup: '<path d="M2 20 A10 10 0 0 1 22 20" fill="red"/>', layers: ['PRINT'], raster: false, aspect: 1, printOnly: true },
    ],
    outlineFor: (id) => (id === 'locked-font' ? null : fakeFont),
    ...overrides,
  });
}

/* ---------------- geometry ---------------- */

test('formatter: 4 decimals, no scientific notation', () => {
  assert.equal(fmt(1e-7), '0');
  assert.equal(fmt(2880), '2880');
  assert.equal(fmt(1094.400009), '1094.4');
  assert.ok(!fmt(0.00001234).includes('e'));
});

test('corner radius clamps at extreme values', () => {
  assert.equal(clampRadius(9999, 100, 50), 25);
  assert.equal(clampRadius(-5, 100, 50), 0);
  const d = shapeOutline({ shape: 'rounded', w: 100, h: 50, r: 9999 });
  assert.ok(isClosedPath(d));
});

test('arch and capsule produce closed paths', () => {
  assert.ok(isClosedPath(shapeOutline({ shape: 'arch', w: 200, h: 150 })));
  assert.ok(isClosedPath(shapeOutline({ shape: 'capsule', w: 300, h: 100 })));
  assert.ok(isClosedPath(shapeOutline({ shape: 'capsule', w: 100, h: 300 })));
  assert.ok(isClosedPath(shapeOutline({ shape: 'circle', w: 100, h: 100 })));
  assert.throws(() => shapeOutline({ shape: 'arch', w: 200, h: 50 }));
});

test('pathLength matches analytic perimeter within 0.5%', () => {
  for (const spec of [
    { shape: 'square', w: 100, h: 60 },
    { shape: 'rounded', w: 100, h: 60, r: 20 },
    { shape: 'capsule', w: 300, h: 100 },
    { shape: 'arch', w: 200, h: 180 },
    { shape: 'circle', w: 120, h: 120 },
  ]) {
    const analytic = shapePerimeter(spec);
    const numeric = pathLength(shapeOutline(spec));
    assert.ok(Math.abs(analytic - numeric) / analytic < 0.005, `${spec.shape}: ${analytic} vs ${numeric}`);
  }
});

/* ---------------- text fitting ---------------- */

test('solver converges for short and long strings', () => {
  for (const text of ['N', 'Naya', 'A very long name indeed with forty chars!']) {
    const measure = (size) => text.length * 0.48 * size;
    const target = 30 * PX_PER_IN;
    const fit = solveFontSize({ measure, targetWidthPx: target });
    assert.ok(fit.converged, `did not converge for "${text}"`);
    assert.ok(Math.abs(fit.width - target) <= 0.5, `width off by ${Math.abs(fit.width - target)}`);
  }
});

test('proof spelling is letter-spaced mono caps', () => {
  assert.equal(proofSpelling('Naya'), 'N A Y A');
});

test('connector bar is a closed path with positive thickness only', () => {
  assert.ok(isClosedPath(connectorBar({ widthPx: 500, baselinePx: 100, thicknessPx: 20 })));
  assert.throws(() => connectorBar({ widthPx: 500, baselinePx: 100, thicknessPx: 0 }));
});

/* ---------------- layers ---------------- */

test('process routing restricts layers', () => {
  assert.deepEqual(allowedLayers(['laser']).sort(), ['CUT', 'ENGRAVE', 'SCORE'].sort());
  assert.deepEqual(allowedLayers(['fdm', 'resin']), ['PRINT']);
  const ls = createLayerSet(['fdm']);
  assert.throws(() => ls.add('CUT', { d: 'M0,0 Z' }), /not available/);
});

test('raster can never be assigned to CUT', () => {
  const ls = createLayerSet(['laser', 'uv']);
  assert.throws(() => ls.add('CUT', { raster: 'data:image/png;base64,AAAA' }), /raster/);
  ls.add('PRINT', { raster: 'data:image/png;base64,AAAA' });
  assert.ok(ls.has('PRINT'));
  assert.equal(motifLayerAllowed({ raster: true }, 'CUT'), false);
  assert.equal(motifLayerAllowed({ raster: true }, 'PRINT'), true);
});

/* ---------------- pricing ---------------- */

const rateCard = {
  setupFee: 8, perSquareInch: 0.09, perLetter: 1.25, perInchOfCut: 0.06,
  perSquareInchPrinted: 0.11,
  materialMultipliers: { pla: 1.0, acrylic: 1.4 },
  thicknessMultipliers: { '3mm': 1.0, '6mm': 1.4 },
  minimum: 18,
};

test('minimum enforced after multipliers', () => {
  const tiny = evaluatePricing(rateCard, { areaSqIn: 1, letters: 1, cutLengthIn: 1, materialKey: 'pla', thicknessKey: '3mm' });
  assert.equal(tiny.total, 18);
  assert.ok(tiny.breakdown.minimumApplied);
  const big = evaluatePricing(rateCard, { areaSqIn: 300, letters: 10, cutLengthIn: 100, materialKey: 'acrylic', thicknessKey: '6mm' });
  assert.ok(big.total > 18);
  assert.equal(big.total, roundCents((8 + 27 + 12.5 + 6) * 1.4 * 1.4));
});

test('printed area priced independently of cut area', () => {
  const withoutPrint = evaluatePricing(rateCard, { areaSqIn: 200, cutLengthIn: 60 });
  const withPrint = evaluatePricing(rateCard, { areaSqIn: 200, cutLengthIn: 60, printedAreaSqIn: 200 });
  assert.equal(roundCents(withPrint.total - withoutPrint.total), roundCents(200 * 0.11));
});

test('rounding is half-up to cents', () => {
  assert.equal(roundCents(1.005), 1.01);
  assert.equal(roundCents(1.004999), 1.0);
  assert.equal(roundCents(2.675), 2.68);
});

/* ---------------- spec ---------------- */

test('serialize/deserialize round-trip is stable', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  e.setValue('widthIn', 30);
  const json = e.serializeSpec();
  const spec = deserializeSpec(json);
  const values = specToValues(spec, nameSign);
  const e2 = engineFor(nameSign);
  for (const [k, v] of Object.entries(values)) e2.setValue(k, v);
  assert.equal(e2.serializeSpec(), json);
  assert.equal(serializeSpec(spec), json);
});

test('a v1 spec regenerates identical production SVG', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  e.setValue('widthIn', 30);
  const original = e.buildProductionSvg().svg;
  const json = e.serializeSpec();

  const e2 = engineFor(nameSign);
  e2.loadSpec(json);
  assert.equal(e2.buildProductionSvg().svg, original);
});

test('spec stays within the property budget for typical configs', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'A fairly long name for a sign');
  assert.ok(specByteLength(deserializeSpec(e.serializeSpec())) < 1800);
});

test('assets chunk and reassemble', () => {
  const content = 'x'.repeat(4000);
  const { ref, properties } = chunkAsset(content);
  for (const v of Object.values(properties)) assert.ok(v.length <= 1500);
  assert.equal(reassembleAsset(properties, ref), content);
});

test('newer spec versions are refused loudly', () => {
  assert.throws(() => deserializeSpec('{"v":99,"t":"name-sign","p":{}}'), /newer/);
});

/* ---------------- svg writer ---------------- */

test('a 30 inch name sign exports width="30in" with matching viewBox', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  e.setValue('widthIn', 30);
  const { svg } = e.buildProductionSvg();
  assert.match(svg, /width="30in"/);
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(vb, 'viewBox present');
  assert.equal(Number(vb[1]), 30 * PX_PER_IN);
  assert.ok(!/\d[eE][-+]?\d/.test(svg), 'no scientific notation');
  assert.ok(!containsLiveText(svg), 'outline export contains no live <text>');
  assert.match(svg, /<g[^>]*data-layer="CUT"[^>]*stroke="#FF0000"/);
});

test('dims group is stripped from production and proof output', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  assert.ok(e.buildPreviewSvg().includes('__DIMS'));
  assert.ok(!e.buildProductionSvg().svg.includes('__DIMS'));
  assert.ok(!e.buildProofSvg().svg.includes('__DIMS'));
});

test('proof strips CUT and ENGRAVE layers', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  const { svg } = e.buildProofSvg();
  assert.ok(!svg.includes('data-layer="CUT"'));
  assert.ok(!svg.includes('data-layer="ENGRAVE"'));
});

test('missing outlines fall back with a loud warning', () => {
  const e = engineFor(nameSign, { outlineFor: () => null });
  e.setValue('text', 'Naya');
  const { svg, warnings, containsLiveText: live } = e.buildProductionSvg();
  assert.ok(live);
  assert.ok(warnings.length > 0);
  assert.match(svg, /WARNING/);
});

test('a licence-locked font blocks production export with a clear message', () => {
  const e = engineFor(nameSign, { outlineFor: () => null });
  e.setValue('text', 'Naya');
  e.setValue('font', 'locked-font');
  assert.ok(e.buildPreviewSvg().length > 0, 'preview still renders');
  assert.throws(() => e.buildProductionSvg(), /preview only/);
});

/* ---------------- engine: layers per product ---------------- */

test('a 3D-print product emits no CUT layer', () => {
  const e = engineFor(character3d);
  e.setValue('text', 'Naya');
  const g = e.getGeometry('production');
  assert.ok(!g.layerSet.has('CUT'));
  assert.ok(!g.layerSet.allowed().includes('CUT'));
});

test('keychain gets an outline and a keyring hole on CUT', () => {
  const e = engineFor(keychain);
  e.setValue('text', 'Naya');
  const g = e.getGeometry('production');
  assert.ok(g.layerSet.has('CUT'));
  assert.equal(g.layerSet.get('CUT').length, 2);
});

/* ---------------- approval lifecycle ---------------- */

test('any edit voids approval', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  e.approve();
  assert.ok(e.isApproved());
  let voided = false;
  e.on('approvalVoided', () => (voided = true));
  e.setValue('text', 'Nayaa');
  assert.ok(!e.isApproved());
  assert.ok(voided);
});

test('unchanged set does not void approval', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  e.approve();
  e.setValue('text', 'Naya');
  assert.ok(e.isApproved());
});

test('line item properties follow the contract', () => {
  const e = engineFor(nameSign);
  e.setValue('text', 'Naya');
  assert.throws(() => e.buildLineItemProperties(), /approval/);
  e.approve();
  const props = e.buildLineItemProperties();
  assert.equal(props['Spelling confirmed by customer'], 'Yes');
  assert.equal(props._payment_terms, 'full-on-approval');
  assert.ok(props._spec.startsWith('{"v":1'));
  assert.ok(props._proof_approved_at);
  assert.equal(props._proof_text_at_approval, 'Naya');
  assert.ok(props._engine_version);
  assert.ok(props._process.length > 0);
  for (const key of Object.keys(props)) {
    assert.ok(key.startsWith('_') || /^[A-Z]/.test(key), `odd property key: ${key}`);
  }
});

/* ---------------- numeric clamping ---------------- */

test('out-of-range numeric input never reaches geometry or pricing', () => {
  const e = engineFor(nameSign);
  e.setValue('widthIn', 100000);
  assert.ok(e.getValue('widthIn') <= 48);
  e.setValue('widthIn', -5);
  assert.ok(e.getValue('widthIn') >= 6);
  const price = e.getPrice();
  assert.ok(Number.isFinite(price.total));
});

/* ---------------- sanitization ---------------- */

test('hostile SVG upload is neutered', () => {
  const hostile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">
    <script>alert('xss')</script>
    <path d="M0,0 L10,10" onclick="steal()" style="background:url(http://evil)"/>
    <image href="http://evil/tracker.png"/>
    <foreignObject><body onload="alert(2)"/></foreignObject>
  </svg>`;
  const { svg, dropped } = sanitizeSvg(hostile);
  assert.ok(!svg.includes('script'));
  assert.ok(!/on\w+=/.test(svg));
  assert.ok(!svg.includes('http://evil'));
  assert.ok(!svg.includes('foreignObject'));
  assert.ok(!svg.includes('style='));
  assert.ok(svg.includes('<path'));
  assert.ok(dropped.includes('script'));
});

test('sanitizer refuses uploads with nothing drawable', () => {
  assert.throws(() => sanitizeSvg('<svg><script>x</script></svg>'), /no drawable/);
});

test('png validation enforces mime and size', () => {
  assert.throws(() => validatePngDataUrl('data:image/svg+xml;base64,AAAA'), /PNG/);
  assert.ok(validatePngDataUrl('data:image/png;base64,' + 'A'.repeat(400)));
});
