/*
 * Browser checks for the manual-test list in the build spec. Runs against
 * the harness page (test/server.mjs must be up). Asserts on rendered
 * reality — DOM, pixels, network payloads — not internal state alone.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const SHOT_DIR = process.env.SHOT_DIR || '.';
const results = [];
const check = (name, fn) => fn().then(
  () => { results.push(['PASS', name]); console.log('PASS', name); },
  (err) => { results.push(['FAIL', name, err.message]); console.log('FAIL', name, '\n  ', err.message); }
);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/* Track transfer weight of everything loaded before a font is chosen. */
let preFontBytes = 0;
let fontChosen = false;
page.on('response', async (res) => {
  if (fontChosen) return;
  try {
    const buf = await res.body();
    preFontBytes += buf.length;
  } catch { /* opaque/redirect */ }
});

await page.goto(`${BASE}/test/harness.html`);
await page.waitForSelector('.pfc-preview-svg');

/* ---- Check 1: 30" name sign exports at true size ---- */
await check('1. 30in name sign production export carries width="30in" + matching viewBox', async () => {
  await page.fill('[data-param="text"] input', 'Naya');
  const widthInput = page.locator('[data-param="widthIn"] input[type="number"]');
  await widthInput.fill('30');
  await widthInput.dispatchEvent('change');
  await page.waitForTimeout(300);
  /* Load outlines the way the proof button does, then export. */
  const out = await page.evaluate(async () => {
    const app = window.__app;
    await app.loader.loadOutlineFont(app.engine.getValue('font'));
    const r = app.engine.buildProductionSvg();
    return { svg: r.svg.slice(0, 400), live: r.containsLiveText, warnings: r.warnings };
  });
  assert.match(out.svg, /width="30in"/);
  assert.match(out.svg, /viewBox="0 0 2880 /);
  assert.equal(out.live, false, 'production export must not contain live <text>');
  assert.equal(out.warnings.length, 0);
});

/* ---- Page weight before any font interaction beyond defaults ---- */
await check('6. page weight before a font is chosen < 200KB (excluding lazy opentype+ttf)', async () => {
  /* preFontBytes counted everything the initial page pulled; the outline
     font + opentype bundle from check 1 are lazy-path resources, so count
     them out by measuring what the page itself requested before that. */
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter((r) => !/pf-font-|playform-opentype/.test(r.name))
      .map((r) => ({ name: r.name.split('/').pop().split('?')[0], size: r.transferSize || r.encodedBodySize }))
  );
  const total = resources.reduce((s, r) => s + r.size, 0);
  console.log('   resources:', resources.map((r) => `${r.name}:${(r.size / 1024).toFixed(1)}KB`).join(' '));
  assert.ok(total < 200 * 1024, `initial resources total ${(total / 1024).toFixed(1)}KB`);
});

/* ---- Check 2: proof shows no cut/engrave lines ---- */
await check('2. proof modal shows finished object only (no CUT/ENGRAVE), mono-caps spelling, gated confirm', async () => {
  await page.click('[data-pfc-proofbtn]');
  await page.waitForSelector('.pfc-proof');
  const art = await page.innerHTML('.pfc-proof__art');
  assert.ok(!art.includes('data-layer="CUT"'), 'CUT leaked into proof');
  assert.ok(!art.includes('data-layer="ENGRAVE"'), 'ENGRAVE leaked into proof');
  assert.ok(art.includes('data-proof="body"'), 'proof must show the finished object silhouette');
  const bodyBox = await page.locator('.pfc-proof__art [data-proof="body"]').boundingBox();
  assert.ok(bodyBox && bodyBox.width > 100, 'finished object renders with real size');
  const widthVal = await page.inputValue('[data-param="widthIn"] input[type="number"]');
  assert.equal(widthVal, '30', 'width number input displays its value');
  const letters = await page.textContent('.pfc-proof__letters');
  assert.equal(letters.trim(), 'N A Y A');
  assert.ok(await page.isDisabled('.pfc-proof__confirm'), 'confirm must start disabled');
  await page.screenshot({ path: `${SHOT_DIR}/proof-modal.png` });
  await page.check('.pfc-proof__terms-check');
  assert.ok(!(await page.isDisabled('.pfc-proof__confirm')), 'confirm enables after terms checked');
});

/* ---- Check 3: edit voids approval ---- */
await check('3. approving then editing one character voids approval and re-disables checkout', async () => {
  await page.click('.pfc-proof__confirm');
  await page.waitForSelector('[data-pfc-cartbtn]:not([hidden])');
  assert.ok(await page.evaluate(() => window.__app.engine.isApproved()));
  await page.fill('[data-param="text"] input', 'Nayaa');
  await page.waitForSelector('[data-pfc-cartbtn][hidden]', { state: 'attached' });
  assert.equal(await page.evaluate(() => window.__app.engine.isApproved()), false);
  const notice = await page.textContent('[data-pfc-approval]');
  assert.match(notice, /no longer applies/);
  const proofBtnVisible = await page.isVisible('[data-pfc-proofbtn]');
  assert.ok(proofBtnVisible, 'proof button must return after voiding');
});

/* ---- Check 4: add to cart, inspect line item properties ---- */
let capturedSpec = null;
let capturedProps = null;
await check('4. cart add carries the line item property contract', async () => {
  await page.fill('[data-param="text"] input', 'Naya');
  await page.click('[data-pfc-proofbtn]');
  await page.waitForSelector('.pfc-proof');
  await page.check('.pfc-proof__terms-check');
  await page.click('.pfc-proof__confirm');
  await page.click('[data-pfc-cartbtn]');
  await page.waitForFunction(() => fetch('/__cart').then((r) => r.json()).then((c) => c.length > 0));
  const cart = await (await fetch(`${BASE}/__cart`)).json();
  const line = cart[cart.length - 1];
  assert.equal(line.id, 424242);
  const p = line.properties;
  capturedProps = p;
  assert.equal(p['Spelling confirmed by customer'], 'Yes');
  assert.equal(p.Lettering, 'Naya');
  assert.match(p.Size, /^30" × [\d.]+"$/);
  assert.ok(p.Font);
  assert.equal(p._payment_terms, 'full-on-approval');
  assert.ok(p._proof_approved_at);
  assert.equal(p._proof_text_at_approval, 'Naya');
  assert.ok(p._engine_version);
  assert.ok(p._process.includes('laser'));
  capturedSpec = p._spec;
  assert.ok(capturedSpec.length < 1800, `_spec is ${capturedSpec.length} chars`);
  JSON.parse(capturedSpec);
});

/* ---- Check 5: regenerate.html reproduces the export ---- */
await check('5. pasting _spec into regenerate.html reproduces the identical SVG', async () => {
  const original = await page.evaluate(async () => {
    const app = window.__app;
    await app.loader.loadOutlineFont(app.engine.getValue('font'));
    return app.engine.buildProductionSvg().svg;
  });
  const regen = await browser.newPage();
  await regen.goto(`${BASE}/tools/regenerate.html`);
  await regen.fill('#spec', capturedSpec);
  await regen.click('#go');
  await regen.waitForSelector('#stage:not([hidden]) svg');
  const regenerated = await regen.evaluate(async () => {
    /* Rebuild through the same path the download uses. */
    const lib = window.PlayformConfigurator;
    const spec = lib.deserializeSpec(document.getElementById('spec').value);
    const schema = lib.schemas[spec.t];
    const engine = lib.createEngine(schema, { fonts: lib.fonts, motifs: lib.motifs });
    engine.loadSpec(spec);
    const entry = lib.fonts.find((f) => f.id === engine.getValue('font'));
    const buf = await (await fetch('../assets/' + entry.file)).arrayBuffer();
    const font = window.opentype.parse(buf);
    engine.setOutlineProvider(() => font);
    return engine.buildProductionSvg().svg;
  });
  assert.equal(regenerated, original, 'regenerated SVG differs from original export');
  await regen.screenshot({ path: `${SHOT_DIR}/regenerate.png`, fullPage: true });
  await regen.close();
});

/* ---- Bonus rendered checks: other schemas mount from JSON alone ---- */
await check('all five schemas mount and render a preview', async () => {
  for (const id of ['acrylic-panel', 'keychain', 'character-3d', 'container', 'name-sign']) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(`${BASE}/test/harness.html?schema=${id}`);
    await p.waitForSelector('.pfc-preview-svg', { timeout: 8000 });
    const svgBox = await p.locator('.pfc-preview-svg').boundingBox();
    assert.ok(svgBox && svgBox.width > 50, `${id} preview did not render meaningfully`);
    if (id === 'keychain') await p.screenshot({ path: `${SHOT_DIR}/keychain.png` });
    await p.close();
  }
});

await page.screenshot({ path: `${SHOT_DIR}/configurator.png`, fullPage: true });
await browser.close();

const fails = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
