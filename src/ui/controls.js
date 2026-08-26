/*
 * Schema-driven control rendering. The engine's schema params ARE the UI:
 * a keychain and a name sign feel purpose-built because their schemas
 * declare different controls, but this renderer has no idea what product
 * it is drawing. Everything labelled, everything keyboard-operable.
 */

const h = (doc, tag, attrs = {}, children = []) => {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) el.appendChild(c);
  return el;
};

let uid = 0;
const nextId = (key) => `pfc-${key}-${++uid}`;

export function renderControls({ root, schema, engine, fonts, motifs, document: doc = document, onInteract }) {
  const container = h(doc, 'div', { class: 'pfc-controls' });
  const fieldEls = new Map();

  const visible = (param) => engine.isParamVisible(param.key);

  function refreshVisibility() {
    for (const param of schema.params) {
      const el = fieldEls.get(param.key);
      if (el) el.hidden = !visible(param);
    }
  }

  const set = (key, value) => {
    const applied = engine.setValue(key, value);
    refreshVisibility();
    if (onInteract) onInteract(key);
    return applied;
  };

  for (const param of schema.params) {
    const field = buildField(param);
    if (field) {
      fieldEls.set(param.key, field);
      container.appendChild(field);
    }
  }
  refreshVisibility();
  root.appendChild(container);
  return { refreshVisibility };

  function labelled(param, inputEl, id, extra) {
    const wrap = h(doc, 'div', { class: 'pfc-field', 'data-param': param.key });
    const label = h(doc, 'label', { class: 'pfc-label', for: id, text: param.label });
    if (param.unit) label.appendChild(h(doc, 'span', { class: 'pfc-unit', text: ` (${param.unit === 'in' ? 'inches' : param.unit})` }));
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    if (param.hint) wrap.appendChild(h(doc, 'p', { class: 'pfc-hint', text: param.hint }));
    if (extra) wrap.appendChild(extra);
    return wrap;
  }

  function buildField(param) {
    switch (param.type) {
      case 'text': {
        const id = nextId(param.key);
        const input = h(doc, 'input', {
          id, type: 'text', class: 'pfc-input', value: engine.getValue(param.key) ?? '',
          maxlength: param.max || 120, placeholder: param.placeholder || '',
          autocomplete: 'off', spellcheck: 'false',
          oninput: (e) => set(param.key, e.target.value),
        });
        return labelled(param, input, id);
      }
      case 'number': {
        const id = nextId(param.key);
        const row = h(doc, 'div', { class: 'pfc-number' });
        const range = h(doc, 'input', {
          type: 'range', class: 'pfc-range', min: param.min, max: param.max,
          step: param.step || 1, value: engine.getValue(param.key),
          'aria-label': param.label,
          oninput: (e) => { const v = set(param.key, Number(e.target.value)); num.value = v; },
        });
        const num = h(doc, 'input', {
          id, type: 'number', class: 'pfc-input pfc-input--num', min: param.min, max: param.max,
          step: param.step || 1, value: engine.getValue(param.key), inputmode: 'decimal',
          onchange: (e) => { const v = set(param.key, Number(e.target.value)); e.target.value = v; range.value = v; },
        });
        row.appendChild(range);
        row.appendChild(num);
        return labelled(param, row, id);
      }
      case 'choice': {
        const id = nextId(param.key);
        const opts = param.options || [];
        if (opts.length <= 4) {
          const group = h(doc, 'div', { class: 'pfc-pills', role: 'radiogroup', 'aria-label': param.label, id });
          for (const o of opts) {
            const v = o.v ?? o;
            const btn = h(doc, 'button', {
              type: 'button', class: 'pfc-pill', role: 'radio',
              'aria-checked': String(engine.getValue(param.key) === v),
              'data-value': String(v), text: o.label ?? String(v),
              title: o.hint || undefined,
              onclick: () => {
                set(param.key, v);
                group.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
              },
            });
            group.appendChild(btn);
          }
          return labelled(param, group, id);
        }
        const sel = h(doc, 'select', {
          id, class: 'pfc-input',
          onchange: (e) => set(param.key, coerce(opts, e.target.value)),
        });
        for (const o of opts) {
          const v = o.v ?? o;
          const opt = h(doc, 'option', { value: String(v), text: o.label ?? String(v) });
          if (engine.getValue(param.key) === v) opt.selected = true;
          sel.appendChild(opt);
        }
        return labelled(param, sel, id);
      }
      case 'toggle': {
        const id = nextId(param.key);
        const input = h(doc, 'input', {
          id, type: 'checkbox', class: 'pfc-check',
          onchange: (e) => set(param.key, e.target.checked),
        });
        input.checked = Boolean(engine.getValue(param.key));
        const wrap = h(doc, 'div', { class: 'pfc-field pfc-field--toggle', 'data-param': param.key });
        const label = h(doc, 'label', { class: 'pfc-label pfc-label--inline', for: id });
        label.appendChild(input);
        label.appendChild(doc.createTextNode(' ' + param.label));
        wrap.appendChild(label);
        if (param.hint) wrap.appendChild(h(doc, 'p', { class: 'pfc-hint', text: param.hint }));
        return wrap;
      }
      case 'font':
        return fontPicker(param);
      case 'motif':
        return motifPicker(param);
      case 'upload':
        return null; /* uploads are wired by app.js (needs sanitizer + files) */
      default:
        return null;
    }
  }

  function fontPicker(param) {
    const id = nextId(param.key);
    const cats = param.categories || [...new Set(fonts.map((f) => f.category))];
    const pool = fonts.filter((f) => cats.includes(f.category));
    const wrap = h(doc, 'div', { class: 'pfc-field', 'data-param': param.key });
    wrap.appendChild(h(doc, 'span', { class: 'pfc-label', id: `${id}-label`, text: param.label }));

    const tabs = h(doc, 'div', { class: 'pfc-cats', role: 'tablist', 'aria-label': `${param.label} categories` });
    const grid = h(doc, 'div', { class: 'pfc-fontgrid', role: 'radiogroup', 'aria-labelledby': `${id}-label` });
    let activeCat = 'all';

    function renderGrid() {
      grid.textContent = '';
      const sampleText = String(engine.getValue('text') || 'Abc').slice(0, 12) || 'Abc';
      for (const f of pool) {
        if (activeCat !== 'all' && f.category !== activeCat) continue;
        const btn = h(doc, 'button', {
          type: 'button', class: 'pfc-fontcard', role: 'radio',
          'aria-checked': String(engine.getValue(param.key) === f.id),
          'data-font': f.id,
          onclick: () => {
            set(param.key, f.id);
            grid.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.font === f.id)));
          },
        });
        btn.appendChild(h(doc, 'span', { class: 'pfc-fontcard__sample', style: `font-family:${f.family}`, text: sampleText, 'aria-hidden': 'true' }));
        btn.appendChild(h(doc, 'span', { class: 'pfc-fontcard__name', text: f.name }));
        grid.appendChild(btn);
      }
    }

    for (const cat of ['all', ...cats]) {
      const tab = h(doc, 'button', {
        type: 'button', class: 'pfc-cat', role: 'tab', 'aria-selected': String(cat === activeCat),
        text: cat === 'all' ? 'All' : cat,
        onclick: () => {
          activeCat = cat;
          tabs.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.textContent === (cat === 'all' ? 'All' : cat))));
          renderGrid();
        },
      });
      tabs.appendChild(tab);
    }

    renderGrid();
    wrap.appendChild(tabs);
    wrap.appendChild(grid);
    wrap.refreshSamples = renderGrid;
    return wrap;
  }

  function motifPicker(param) {
    const id = nextId(param.key);
    const pool = param.tag ? motifs.filter((m) => (m.tags || []).includes(param.tag)) : motifs.filter((m) => !(m.tags || []).includes('figure'));
    const wrap = h(doc, 'div', { class: 'pfc-field', 'data-param': param.key });
    wrap.appendChild(h(doc, 'span', { class: 'pfc-label', id: `${id}-label`, text: param.label }));
    const grid = h(doc, 'div', { class: 'pfc-motifgrid', role: 'radiogroup', 'aria-labelledby': `${id}-label` });

    const options = param.optional ? [null, ...pool] : pool;
    for (const m of options) {
      const val = m ? m.id : '';
      const btn = h(doc, 'button', {
        type: 'button', class: 'pfc-motifcard', role: 'radio',
        'aria-checked': String((engine.getValue(param.key) || '') === val),
        'data-motif': val,
        'aria-label': m ? m.name : 'None',
        onclick: () => {
          set(param.key, val);
          grid.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.motif === val)));
        },
      });
      if (m) {
        const holder = h(doc, 'span', { class: 'pfc-motifcard__art', 'aria-hidden': 'true' });
        holder.innerHTML = `<svg viewBox="${m.viewBox}" fill="currentColor" stroke="currentColor">${m.markup}</svg>`;
        btn.appendChild(holder);
        btn.appendChild(h(doc, 'span', { class: 'pfc-motifcard__name', text: m.name }));
      } else {
        btn.appendChild(h(doc, 'span', { class: 'pfc-motifcard__name', text: 'None' }));
      }
      grid.appendChild(btn);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function coerce(opts, raw) {
    for (const o of opts) {
      const v = o.v ?? o;
      if (String(v) === raw) return v;
    }
    return raw;
  }
}
