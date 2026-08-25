/*
 * Wires engine + UI and mounts into a root element. This module is the
 * outermost layer of the framework-free core+ui stack; it still knows
 * nothing about Shopify — the Liquid adapter hands it plain config:
 * { schema, fonts, motifs, assetBase, opentypeUrl, cart: {addUrl, variantId},
 *   termsCopy, allowUploads, rateOverrides }
 */

import { createEngine, EngineExportError } from '../core/engine.js';
import { sanitizeSvg, validatePngDataUrl } from '../core/sanitize.js';
import { createFontLoader } from './fonts.js';
import { renderControls } from './controls.js';
import { createPreview } from './preview.js';
import { openProof } from './proof.js';

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export function mount(root, config) {
  const doc = root.ownerDocument;
  const { schema, fonts, motifs } = config;

  const loader = createFontLoader({
    fonts,
    assetBase: config.assetBase,
    opentypeUrl: config.opentypeUrl,
    document: doc,
  });

  const engine = createEngine(schema, {
    fonts,
    motifs,
    rateOverrides: config.rateOverrides || {},
    measureFor: loader.measureFor,
    outlineFor: loader.getCachedOutline,
  });

  root.classList.add('pfc-root');
  root.innerHTML = `
    <div class="pfc-shell">
      <div class="pfc-pane pfc-pane--preview">
        <div class="pfc-machinebar">
          <span class="pfc-tristripe" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="pfc-machinebar__title">${esc(schema.title)}</span>
          <span class="pfc-machinebar__proc">${esc(schema.processes.join(' · ').toUpperCase())}</span>
        </div>
        <div data-pfc-preview></div>
        <div class="pfc-statusline" data-pfc-status aria-live="polite"></div>
      </div>
      <div class="pfc-pane pfc-pane--controls">
        <div data-pfc-controls></div>
        <div class="pfc-uploadslot" data-pfc-upload hidden></div>
        <div class="pfc-checkout">
          <div class="pfc-price" data-pfc-price aria-live="polite"></div>
          <p class="pfc-approval" data-pfc-approval hidden></p>
          <button type="button" class="pfc-btn pfc-btn--primary" data-pfc-proofbtn>Review &amp; approve proof</button>
          <button type="button" class="pfc-btn pfc-btn--confirm" data-pfc-cartbtn hidden>Add approved design to cart</button>
          <p class="pfc-cart-error" data-pfc-carterror role="alert" hidden></p>
        </div>
      </div>
    </div>`;

  const previewRoot = root.querySelector('[data-pfc-preview]');
  const controlsRoot = root.querySelector('[data-pfc-controls]');
  const statusEl = root.querySelector('[data-pfc-status]');
  const priceEl = root.querySelector('[data-pfc-price]');
  const approvalEl = root.querySelector('[data-pfc-approval]');
  const proofBtn = root.querySelector('[data-pfc-proofbtn]');
  const cartBtn = root.querySelector('[data-pfc-cartbtn]');
  const cartErr = root.querySelector('[data-pfc-carterror]');

  const preview = createPreview({ root: previewRoot, engine, fonts, document: doc });

  const rerender = () => {
    preview.render();
    const price = engine.getPrice();
    priceEl.textContent = `$${price.total.toFixed(2)}`;
    priceEl.setAttribute('aria-label', `Current price ${price.total.toFixed(2)} dollars`);
  };
  const rerenderDebounced = debounce(rerender, 120);

  /* Picker subsets re-request only after typing settles (~250ms). */
  const resubset = debounce(() => {
    loader.updatePickerSubset(engine.getValue('text') || '');
    const fontField = root.querySelector('[data-param="font"]');
    if (fontField && fontField.refreshSamples) fontField.refreshSamples();
  }, 250);

  const controls = renderControls({
    root: controlsRoot,
    schema,
    engine,
    fonts,
    motifs,
    document: doc,
    onInteract: (key) => {
      if (key === 'text') resubset();
      if (key === 'font') loader.loadFullFace(engine.getValue('font')).then(rerenderDebounced);
      rerenderDebounced();
    },
  });

  engine.on('approvalVoided', () => {
    cartBtn.hidden = true;
    proofBtn.hidden = false;
    approvalEl.hidden = false;
    approvalEl.textContent = 'Design changed — the previous approval no longer applies. Review the proof again before checkout.';
  });

  if (config.allowUploads && schema.allowUpload) mountUpload();

  proofBtn.addEventListener('click', async () => {
    proofBtn.disabled = true;
    setStatus('Preparing proof — loading exact letterforms…');
    const warnings = [];
    try {
      await ensureOutlines(warnings);
    } catch (err) {
      warnings.push(`Exact letterform outlines could not be loaded (${err.message}). The proof and production file will carry a warning.`);
    }
    setStatus('');
    proofBtn.disabled = false;
    const result = await openProof({
      engine,
      fonts,
      termsCopy: config.termsCopy,
      document: doc,
      warnings,
    });
    if (result.approved) {
      approvalEl.hidden = false;
      approvalEl.textContent = `Proof approved ${new Date(result.approval.approvedAt).toLocaleString()} — "${result.approval.textAtApproval}" at $${result.approval.totalAtApproval.toFixed(2)}.`;
      proofBtn.hidden = true;
      cartBtn.hidden = false;
      cartBtn.focus();
    }
  });

  cartBtn.addEventListener('click', async () => {
    cartErr.hidden = true;
    if (!engine.isApproved()) {
      cartErr.hidden = false;
      cartErr.textContent = 'The design is not approved. Review the proof first.';
      return;
    }
    cartBtn.disabled = true;
    cartBtn.textContent = 'Adding…';
    try {
      const properties = engine.buildLineItemProperties({ termsCopy: config.termsCopy });
      const res = await fetch(config.cart.addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: config.cart.variantId, quantity: 1, properties }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.description || body.message || `cart add failed (${res.status})`);
      }
      cartBtn.textContent = 'Added ✓ — going to cart';
      if (config.cart.cartUrl) window.location.href = config.cart.cartUrl;
    } catch (err) {
      cartErr.hidden = false;
      cartErr.textContent = `Could not add to cart: ${err.message}. Nothing was charged — please try again.`;
      cartBtn.disabled = false;
      cartBtn.textContent = 'Add approved design to cart';
    }
  });

  /* Reorder: seed from a spec in the URL (?pfspec=…) or via loadSpec(). */
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('pfspec');
    if (raw) {
      engine.loadSpec(decodeURIComponent(raw));
      syncControlsFromEngine();
      setStatus('Loaded your previous design — change anything, then re-approve.');
    }
  } catch (err) {
    setStatus(`Could not load the previous design: ${err.message}`);
  }

  loader.updatePickerSubset(engine.getValue('text') || '');
  loader.loadFullFace(engine.getValue('font'));
  rerender();

  async function ensureOutlines(warnings) {
    const fontId = engine.getValue('font');
    if (!fontId) return;
    try {
      await loader.loadOutlineFont(fontId);
    } catch (err) {
      if (err instanceof EngineExportError) throw err;
      throw err;
    }
  }

  function mountUpload() {
    const slot = root.querySelector('[data-pfc-upload]');
    slot.hidden = false;
    slot.innerHTML = `
      <label class="pfc-label" for="pfc-upload-input">Your own artwork (SVG or PNG)</label>
      <input id="pfc-upload-input" class="pfc-file" type="file" accept=".svg,.png,image/svg+xml,image/png">
      <p class="pfc-hint">Vector art can be printed or engraved; photos and PNGs are print-only.</p>
      <p class="pfc-upload-msg" role="alert" hidden></p>`;
    const input = slot.querySelector('input');
    const msg = slot.querySelector('.pfc-upload-msg');
    input.addEventListener('change', async () => {
      msg.hidden = true;
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        if (file.type === 'image/png' || /\.png$/i.test(file.name)) {
          const dataUrl = await readAsDataUrl(file);
          validatePngDataUrl(dataUrl);
          engine.setUpload({ kind: 'png', content: dataUrl, layer: 'PRINT', aspect: 1 });
        } else {
          const textContent = await file.text();
          const { svg, viewBox, dropped } = sanitizeSvg(textContent);
          const vb = viewBox.split(/\s+/).map(Number);
          engine.setUpload({
            kind: 'svg',
            content: svg,
            viewBox,
            aspect: vb.length === 4 && vb[3] > 0 ? vb[2] / vb[3] : 1,
            layer: 'PRINT',
          });
          if (dropped.length) {
            msg.hidden = false;
            msg.textContent = `Some unsupported content was removed from the file (${dropped.slice(0, 5).join(', ')}${dropped.length > 5 ? '…' : ''}).`;
          }
        }
        rerender();
      } catch (err) {
        input.value = '';
        msg.hidden = false;
        msg.textContent = err.message;
      }
    });
  }

  function syncControlsFromEngine() {
    controlsRoot.textContent = '';
    renderControls({
      root: controlsRoot,
      schema,
      engine,
      fonts,
      motifs,
      document: doc,
      onInteract: (key) => {
        if (key === 'text') resubset();
        if (key === 'font') loader.loadFullFace(engine.getValue('font')).then(rerenderDebounced);
        rerenderDebounced();
      },
    });
    loader.loadFullFace(engine.getValue('font'));
    rerender();
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  /* Exposed for tools/regenerate.html and tests. */
  return { engine, loader, rerender, loadSpec: (s, o) => { engine.loadSpec(s, o); syncControlsFromEngine(); } };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { createEngine, EngineExportError } from '../core/engine.js';
export { sanitizeSvg } from '../core/sanitize.js';
export { deserializeSpec, reassembleAsset } from '../core/spec.js';
