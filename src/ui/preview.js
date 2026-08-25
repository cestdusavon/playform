/*
 * Live preview: the engine's preview SVG (with the #__DIMS group) framed
 * on the "cut sheet" canvas. Also maintains a text alternative describing
 * the current configuration for screen readers.
 */

export function createPreview({ root, engine, fonts, document: doc = document }) {
  const frame = doc.createElement('div');
  frame.className = 'pfc-preview';
  const sheet = doc.createElement('div');
  sheet.className = 'pfc-sheet';
  frame.appendChild(sheet);

  const alt = doc.createElement('p');
  alt.className = 'pfc-visually-hidden';
  alt.setAttribute('aria-live', 'polite');
  frame.appendChild(alt);

  const sizeTag = doc.createElement('div');
  sizeTag.className = 'pfc-sizetag';
  frame.appendChild(sizeTag);

  root.appendChild(frame);

  function describe() {
    const v = engine.getValues();
    const m = engine.getMetrics();
    const font = fonts.find((f) => f.id === v.font);
    const bits = [
      `${engine.schema.title} preview.`,
      v.text ? `Text: ${v.text}.` : '',
      font ? `Font: ${font.name}.` : '',
      `Finished size ${m.widthIn} by ${m.heightIn} inches.`,
      v.material ? `Material: ${v.material}${v.thickness ? ', ' + v.thickness : ''}.` : '',
    ];
    return bits.filter(Boolean).join(' ');
  }

  function render() {
    let svg;
    try {
      svg = engine.buildPreviewSvg();
    } catch (err) {
      sheet.innerHTML = `<p class="pfc-error" role="alert">${escapeHtml(err.message)}</p>`;
      return;
    }
    /* The preview SVG carries physical width/height attributes; for screen
       display let it scale to the sheet instead. */
    svg = svg.replace(/width="[^"]+" height="[^"]+" viewBox/, 'viewBox');
    sheet.innerHTML = svg;
    const el = sheet.querySelector('svg');
    if (el) {
      el.setAttribute('class', 'pfc-preview-svg');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', describe());
    }
    const m = engine.getMetrics();
    sizeTag.textContent = `${m.widthIn}" × ${m.heightIn}"  ·  shown to scale`;
    alt.textContent = describe();
  }

  return { render };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
