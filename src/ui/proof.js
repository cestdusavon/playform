/*
 * Proof modal: the gate between designing and paying. Shows the FINISHED
 * object (cut/engrave stripped), the name letter-spaced in mono caps, the
 * spec table, and a required made-to-order terms checkbox. Confirm stays
 * disabled until checked. Full keyboard support: focus trapped, returned
 * on close, Escape closes.
 */

export function openProof({ engine, fonts, termsCopy, document: doc = document, onApprove, warnings = [] }) {
  return new Promise((resolve) => {
    const previouslyFocused = doc.activeElement;
    const overlay = doc.createElement('div');
    overlay.className = 'pfc-proof-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pfc-proof-title');

    const values = engine.getValues();
    const metrics = engine.getMetrics();
    const price = engine.getPrice();
    const font = fonts.find((f) => f.id === values.font);
    let proofSvg = '';
    let proofWarnings = warnings;
    try {
      const p = engine.buildProofSvg();
      proofSvg = p.svg.replace(/width="[^"]+" height="[^"]+" viewBox/, 'viewBox');
      proofWarnings = [...warnings, ...p.warnings];
    } catch (err) {
      proofWarnings = [...warnings, err.message];
    }

    const rows = [
      ['Finished size', `${metrics.widthIn}" × ${metrics.heightIn}"`],
      values.text ? ['Lettering', values.text] : null,
      font ? ['Font', font.name] : null,
      values.material ? ['Material', labelOf(engine, 'material') + (values.thickness ? ` · ${values.thickness}` : '')] : null,
      labelOf(engine, 'corner') || labelOf(engine, 'mount') || labelOf(engine, 'bodySize')
        ? ['Shape / style', labelOf(engine, 'corner') || labelOf(engine, 'mount') || labelOf(engine, 'bodySize')]
        : null,
      ['Process', engine.schema.processes.join(' + ')],
      ['Price', `$${price.total.toFixed(2)}`],
    ].filter(Boolean);

    overlay.innerHTML = `
      <div class="pfc-proof" role="document">
        <header class="pfc-proof__head">
          <h2 id="pfc-proof-title">Approve your proof</h2>
          <button type="button" class="pfc-proof__close" aria-label="Close proof without approving">×</button>
        </header>
        ${proofWarnings.length ? `<div class="pfc-warnbanner" role="alert">${proofWarnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
        <div class="pfc-proof__art">${proofSvg || '<p class="pfc-error">Preview unavailable</p>'}</div>
        ${values.text ? `
        <div class="pfc-proof__spelling">
          <p class="pfc-proof__spelling-label">Check every letter:</p>
          <p class="pfc-proof__letters" aria-label="Spelling, letter by letter: ${esc(values.text)}">${esc(engine.proofSpelling())}</p>
        </div>` : ''}
        <table class="pfc-proof__table">
          <caption class="pfc-visually-hidden">Order specification</caption>
          <tbody>
            ${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
          </tbody>
        </table>
        <label class="pfc-proof__terms">
          <input type="checkbox" class="pfc-proof__terms-check">
          <span>${esc(termsCopy)}</span>
        </label>
        <footer class="pfc-proof__foot">
          <button type="button" class="pfc-btn pfc-btn--ghost pfc-proof__cancel">Keep editing</button>
          <button type="button" class="pfc-btn pfc-btn--confirm pfc-proof__confirm" disabled>Approve &amp; pay in full</button>
        </footer>
      </div>`;

    const proofSvgEl = overlay.querySelector('.pfc-proof__art svg');
    if (proofSvgEl) {
      proofSvgEl.setAttribute('role', 'img');
      proofSvgEl.setAttribute('aria-label', 'The finished piece as it will be made');
    }

    const check = overlay.querySelector('.pfc-proof__terms-check');
    const confirm = overlay.querySelector('.pfc-proof__confirm');
    const cancel = overlay.querySelector('.pfc-proof__cancel');
    const close = overlay.querySelector('.pfc-proof__close');

    check.addEventListener('change', () => {
      confirm.disabled = !check.checked;
    });

    function teardown(result) {
      doc.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    }

    confirm.addEventListener('click', () => {
      const approval = engine.approve();
      if (onApprove) onApprove(approval);
      teardown({ approved: true, approval });
    });
    cancel.addEventListener('click', () => teardown({ approved: false }));
    close.addEventListener('click', () => teardown({ approved: false }));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) teardown({ approved: false });
    });

    function focusables() {
      return [...overlay.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        teardown({ approved: false });
        return;
      }
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && doc.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && doc.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(overlay);
    close.focus();
  });
}

function labelOf(engine, key) {
  const param = engine.schema.params.find((p) => p.key === key);
  const v = engine.getValue(key);
  if (!param || v === undefined || param.type !== 'choice') return null;
  if (engine.isParamVisible && !engine.isParamVisible(key)) return null;
  const opt = (param.options || []).find((o) => (o.v ?? o) === v);
  return opt ? opt.label ?? String(opt.v ?? opt) : String(v);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
