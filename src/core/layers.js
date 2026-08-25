/*
 * Layer model. Every piece of generated geometry belongs to exactly one
 * layer. Export colors are load-bearing: LightBurn maps layers by color
 * on import. No DOM, no Shopify.
 */

export const LAYER_COLORS = {
  CUT: '#FF0000',
  ENGRAVE: '#0000FF',
  PRINT: '#000000',
  SCORE: '#00FF00',
};

export const LAYER_NAMES = Object.keys(LAYER_COLORS);

/* Preview-only annotations live here and are stripped on export/proof. */
export const DIMS_GROUP = '__DIMS';

/* Which layers each production process can produce. */
const PROCESS_LAYERS = {
  laser: ['CUT', 'ENGRAVE', 'SCORE'],
  uv: ['PRINT'],
  fdm: ['PRINT'],
  resin: ['PRINT'],
};

export function allowedLayers(processes) {
  const set = new Set();
  for (const p of processes) {
    const layers = PROCESS_LAYERS[p];
    if (!layers) throw new Error(`unknown process: ${p}`);
    for (const l of layers) set.add(l);
  }
  return [...set];
}

/*
 * A LayerSet collects geometry items per layer and enforces the rules:
 *  - only layers allowed by the product's declared processes
 *  - raster content can only ever be PRINT
 */
export function createLayerSet(processes) {
  const allowed = new Set(allowedLayers(processes));
  const items = new Map(); // layer -> [{d?, raster?, attrs?, note?}]

  return {
    add(layer, item) {
      if (!LAYER_COLORS[layer]) throw new Error(`unknown layer: ${layer}`);
      if (!allowed.has(layer)) {
        throw new Error(`layer ${layer} not available for processes [${processes.join(', ')}]`);
      }
      if (item.raster && layer !== 'PRINT') {
        throw new Error('raster artwork can only be assigned to the PRINT layer');
      }
      if (!items.has(layer)) items.set(layer, []);
      items.get(layer).push(item);
      return this;
    },
    has(layer) {
      return items.has(layer) && items.get(layer).length > 0;
    },
    get(layer) {
      return items.get(layer) || [];
    },
    layers() {
      /* Stable order: CUT, ENGRAVE, PRINT, SCORE. */
      return LAYER_NAMES.filter((l) => this.has(l));
    },
    allowed() {
      return [...allowed];
    },
  };
}

/* Motifs declare which layers they may target. Raster (PNG) is PRINT only,
   enforced both here and in the LayerSet itself. */
export function motifLayerAllowed(motif, layer) {
  if (motif.raster) return layer === 'PRINT';
  return Array.isArray(motif.layers) && motif.layers.includes(layer);
}
