/*
 * Font loading strategy — the main performance risk of the build:
 *  1. Picker: ONE Google css2 request for all families, subset with
 *     `&text=` to just the glyphs in the customer's current input.
 *     Kilobytes, not megabytes. Debounced upstream.
 *  2. Selection: the full face loads only when a font is chosen.
 *  3. Outlines: the self-hosted TTF binary is fetched only at proof or
 *     export time, parsed with opentype.js (itself lazy-loaded).
 * font-display: swap everywhere; nothing blocks first paint.
 */

const GOOGLE_CSS = 'https://fonts.googleapis.com/css2';

function googleFamilies(fonts) {
  return fonts
    .filter((f) => f.source === 'google' && f.allowWebEmbed !== false)
    .map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, '+')}:wght@${(f.weights || [400]).join(';')}`)
    .join('&');
}

/* Subset link for the picker: only the glyphs of `text` (plus a label
   fallback so empty input still shows something). */
export function pickerSubsetHref(fonts, text) {
  const glyphs = [...new Set((text || 'Abc') + 'AaBbCc')].join('');
  return `${GOOGLE_CSS}?${googleFamilies(fonts)}&text=${encodeURIComponent(glyphs)}&display=swap`;
}

export function fullFaceHref(font) {
  return `${GOOGLE_CSS}?family=${encodeURIComponent(font.name).replace(/%20/g, '+')}:wght@${(font.weights || [400]).join(';')}&display=swap`;
}

export function createFontLoader({ fonts, assetBase, opentypeUrl, document: doc = document }) {
  let subsetLink = null;
  const fullFacesLoaded = new Set();
  const outlineCache = new Map();
  let opentypePromise = null;

  function updatePickerSubset(text) {
    const href = pickerSubsetHref(fonts, text);
    if (subsetLink && subsetLink.href === href) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    /* Swap in only once loaded, then drop the old one, so the picker never
       flashes unstyled. */
    link.addEventListener('load', () => {
      if (subsetLink && subsetLink !== link) subsetLink.remove();
      subsetLink = link;
    });
    doc.head.appendChild(link);
  }

  function loadFullFace(fontId) {
    const font = fonts.find((f) => f.id === fontId);
    if (!font || fullFacesLoaded.has(fontId)) return Promise.resolve();
    fullFacesLoaded.add(fontId);
    if (font.source === 'google' && font.allowWebEmbed !== false) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullFaceHref(font);
      doc.head.appendChild(link);
      return new Promise((resolve) => {
        link.addEventListener('load', resolve);
        link.addEventListener('error', resolve);
        setTimeout(resolve, 4000);
      });
    }
    if (font.file) {
      /* Self-hosted / licensed faces register via FontFace. */
      const face = new FontFace(font.name, `url(${assetBase}${font.file})`, { display: 'swap' });
      return face
        .load()
        .then((loaded) => {
          doc.fonts.add(loaded);
        })
        .catch(() => {});
    }
    return Promise.resolve();
  }

  function loadOpentype() {
    if (window.opentype) return Promise.resolve(window.opentype);
    if (!opentypePromise) {
      opentypePromise = new Promise((resolve, reject) => {
        const s = doc.createElement('script');
        s.src = opentypeUrl;
        s.onload = () => (window.opentype ? resolve(window.opentype) : reject(new Error('opentype failed to initialise')));
        s.onerror = () => reject(new Error('opentype.js failed to load'));
        doc.head.appendChild(s);
      }).catch((err) => {
        opentypePromise = null; /* allow retry */
        throw err;
      });
    }
    return opentypePromise;
  }

  /* Outline font for production export. Resolves to an opentype Font, or
     throws — callers degrade honestly (disable export, say why). */
  async function loadOutlineFont(fontId) {
    if (outlineCache.has(fontId)) return outlineCache.get(fontId);
    const font = fonts.find((f) => f.id === fontId);
    if (!font) throw new Error(`unknown font: ${fontId}`);
    if (font.allowOutlineExport === false) {
      throw new Error(`"${font.name}" is licensed for preview only — outlines may not be extracted.`);
    }
    if (!font.file) throw new Error(`no outline binary registered for "${font.name}"`);
    const opentype = await loadOpentype();
    const res = await fetch(assetBase + font.file);
    if (!res.ok) throw new Error(`font binary fetch failed (${res.status})`);
    const buf = await res.arrayBuffer();
    const parsed = opentype.parse(buf);
    outlineCache.set(fontId, parsed);
    return parsed;
  }

  const getCachedOutline = (fontId) => outlineCache.get(fontId) || null;

  /* Canvas measurer for live preview responsiveness. */
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  function measureFor(fontId, text) {
    const font = fonts.find((f) => f.id === fontId);
    const family = font ? font.family : 'sans-serif';
    return (size) => {
      ctx.font = `400 ${size}px ${family}`;
      return ctx.measureText(text).width;
    };
  }

  return { updatePickerSubset, loadFullFace, loadOutlineFont, getCachedOutline, measureFor, loadOpentype };
}
