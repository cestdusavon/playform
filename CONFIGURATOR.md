# Playform Custom Orders Configurator

One schema-driven configurator engine; five product types that are nothing
but JSON. Runs inside the theme as `sections/playform-configurator.liquid`,
a thin adapter over a framework-free ES-module core with zero Shopify
dependencies — built to migrate to a theme app extension without touching
geometry, font, pricing, or proof code.

## Layout

```
/src/core       engine (no DOM, no Shopify, Node-testable)
  geometry.js   96 units = 1in; shapes as real path data; path length
  text.js       fitting solver (binary search), outlines, connector bar
  layers.js     CUT/ENGRAVE/PRINT/SCORE model + process routing
  pricing.js    rate card evaluation, half-up cents, minimum after multipliers
  spec.js       canonical order spec: compact, versioned, asset chunking
  svg.js        production SVG writer (true-inch dims), proof renderer
  sanitize.js   hostile-upload SVG rebuild + PNG validation
  engine.js     public API: values, geometry, price, proof, approval, spec
/src/ui         controls, preview, proof modal, font loader, app wiring
/src/schemas    name-sign, acrylic-panel, keychain, character-3d, container
/src/data       fonts.json (42 faces + licence metadata), motifs.json
/sections/playform-configurator.liquid   the only Shopify-aware layer
/snippets/playform-config-schema.liquid  shop config as application/json
/templates/product.configurator.json     attach to a product to enable
/tools/regenerate.html                   paste _spec → production SVG
/tools/build.mjs                         esbuild bundling (the only build step)
/assets/playform-config.js|.css          committed bundles
/assets/playform-opentype.js             lazy opentype.js (proof/export only)
/assets/pf-font-*.ttf                    self-hosted OFL binaries (42)
/test           node --test unit suite + Playwright browser checks
```

`npm test` runs the core suite; `npm run build` regenerates the bundles;
`node test/server.mjs` + `node test/e2e.mjs` runs the browser checks.

## Enabling a product

1. Assign the product the `product.configurator` template.
2. Pick the schema in the section settings, or set the product metafield
   `custom.configurator_schema` to a schema id (metafield wins).
3. Optional section settings: uploads on/off, terms copy, rate-card
   overrides (JSON merged over the schema's card), chrome/accent colours.

Adding a sixth product type = one JSON file in `/src/schemas`, one line in
`/src/entry.js`, `npm run build`. No engine changes.

## Schema format

The build spec left the concrete schema format open; these are the fields
the engine reads. Flagging them here explicitly since they were designed,
not specified:

- `id`, `v`, `title`, `description`
- `processes`: subset of `laser|uv|fdm|resin` — determines which layers can
  exist (laser→CUT/ENGRAVE/SCORE, uv→PRINT, fdm/resin→PRINT).
- `geometry.kind`: `lettering | panel | tag | figure | wrap` — geometry
  archetypes, deliberately not product names.
- `target`: which param the customer sets; the other axis is always solved
  from content, never both set.
- `safeAreaIn`: inset clamping motif/upload placement.
- `params[]`: `key`, `s` (short spec key), `type`
  (`text|number|choice|toggle|font|motif|upload`), `label`, `min/max/step`,
  `default`, `options[{v,label,hint}]`, `showIf` (equality or `*`),
  `alwaysInSpec`, `categories` (font picker), `tag` (motif pool filter).
- `pricing`: exactly the rate card structure from the build spec.
- `bodies` (wrap only): `{id, dIn, bandIn}` container presets; wrap width
  is π·d, band height is the printable area.
- `allowUpload`: gates the upload slot (ANDed with the section toggle).
- `proof.fields`: reserved; the proof currently derives its table.

## The spec (`_spec`)

`{"v":1,"t":"<schema id>","e":"<engine version>","p":{<short keys>}}` —
defaults omitted, restored and **clamped to schema min/max on load** so an
out-of-range stored value can never reach geometry or pricing. Uploaded
artwork never inlines into `_spec`: it is content-hashed and chunked into
`_asset_<hash>_<n>` hidden properties (≤1500 chars each), referenced from
`spec.a`. `serialize(deserialize(s))` is byte-stable; the same spec + the
same font binary regenerates a byte-identical production SVG (verified in
tests). Version migrations live in `spec.js` (`migrateSpec`).

## Line item properties

Visible: `Size`, `Lettering`, `Font`, `Material`, `Shape`, `Finish`,
`Spelling confirmed by customer: Yes`. Hidden: `_spec`,
`_proof_approved_at`, `_proof_text_at_approval`,
`_payment_terms: full-on-approval`, `_process`, `_engine_version`,
`_price_breakdown`, `_asset_*`. Values hidden by a `showIf` condition never
leak into properties.

## Proof → approval → cart

"Add to cart" opens the proof: the **finished object** (CUT geometry
rendered as filled material silhouette with holes knocked out, ENGRAVE as
dark marking — never toolpath lines), the name letter-spaced in mono caps,
the spec table, and a required non-returnable terms checkbox gating the
confirm button. Approval stamps `approvedAt`/`textAtApproval`/
`totalAtApproval` in the engine; **every** `setValue` and upload change
voids it and re-disables checkout. Only an approved design posts to
`/cart/add.js`. Failures render visibly and re-enable the button.

Reorders: `?pfspec=<urlencoded _spec>` on the product URL re-seeds the
configurator completely; change one field, re-approve, pay.

## Fonts

42 Google faces (all OFL-1.1) in three tiers: picker renders via one css2
request subset to the typed glyphs (`&text=`, debounced 250ms,
`display=swap`); the full face loads on selection; the self-hosted TTF in
`/assets` is fetched only at proof/export for opentype.js outlines.
Licence flags are enforced now: `allowOutlineExport:false` previews fine
but **blocks** production export with a clear message (unit-tested), ready
for commercially licensed faces (`source:"licensed"`, `file` set). If
outlines can't load, export still runs but the file carries a loud
WARNING comment and the proof shows a banner — live `<text>` never ships
silently.

Measured initial page weight before any font choice: **~82KB**
(config.js 71.5 + css 10.7; opentype.js 173KB and TTFs are lazy).

## Production notes for the shop

- Layers export as `<g id="CUT">` etc. with LightBurn's color mapping
  (`#FF0000` cut, `#0000FF` engrave, `#00FF00` score, black print), true
  physical `width`/`height` attributes — opens at size in Fusion,
  Illustrator, LightBurn with no scaling.
- The script **connector bar** exports as its own closed path in CUT with a
  comment: weld it with the lettering (LightBurn Edit→Weld / Fusion
  combine) before cutting — the engine does not boolean-union outlines.
- `tools/regenerate.html` works from the repo checkout (open in a browser,
  served or via a local server so fonts fetch). Paste `_spec` (+ `_asset_*`
  JSON when the order had an upload), download the SVG.

## Known limitations (deliberate or platform)

- **Charging the configured price**: line item properties can't change a
  Shopify line's price. The engine's total shows to the customer and rides
  along in `_price_breakdown`; the product/variant price is what checkout
  charges. Options when needed: price-bracket variants per product, or the
  future app extension adding a priced draft-order flow. Flagged, not
  hidden.
- Cart integration was exercised against a mock `/cart/add.js` (this
  environment cannot reach the storefront); the payload matches Shopify's
  AJAX contract but has not been posted to a live cart yet.
- Motif/upload placement clamps inside the safe area; no drag-on-canvas UI
  in v1 (position/scale/rotation sliders instead).
- `figure` geometry is a to-scale reference sheet (silhouette + plinth),
  not printable 3D geometry — by design, no CUT layer can exist for it.
