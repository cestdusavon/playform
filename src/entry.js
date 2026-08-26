/*
 * Bundle entry. Exposes the configurator as window.PlayformConfigurator so
 * the Liquid adapter (or regenerate.html) can mount it without any module
 * plumbing. Schemas and data ride inside the bundle — adding a product
 * type means adding a JSON file here and rebuilding.
 */

import { mount } from './ui/app.js';
import { createEngine, EngineExportError } from './core/engine.js';
import { deserializeSpec, reassembleAsset, serializeSpec } from './core/spec.js';
import { sanitizeSvg } from './core/sanitize.js';
import { containsLiveText } from './core/svg.js';

import fonts from './data/fonts.json';
import motifs from './data/motifs.json';

import nameSign from './schemas/name-sign.json';
import acrylicPanel from './schemas/acrylic-panel.json';
import keychain from './schemas/keychain.json';
import character3d from './schemas/character-3d.json';
import container from './schemas/container.json';

const schemas = {
  [nameSign.id]: nameSign,
  [acrylicPanel.id]: acrylicPanel,
  [keychain.id]: keychain,
  [character3d.id]: character3d,
  [container.id]: container,
};

window.PlayformConfigurator = {
  mount,
  createEngine,
  EngineExportError,
  schemas,
  fonts,
  motifs,
  deserializeSpec,
  serializeSpec,
  reassembleAsset,
  sanitizeSvg,
  containsLiveText,
};
