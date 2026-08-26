/* Simple bundling — the only build step this project is allowed.
   Produces two committed artifacts:
     assets/playform-config.js    engine + ui + schemas + data (iife)
     assets/playform-opentype.js  opentype.js, lazy-loaded at proof/export */
import { build } from 'esbuild';
import { statSync } from 'fs';

await build({
  entryPoints: ['src/entry.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  outfile: 'assets/playform-config.js',
  logLevel: 'warning',
});

await build({
  stdin: {
    contents: "import opentype from 'opentype.js'; window.opentype = opentype;",
    resolveDir: process.cwd(),
  },
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  outfile: 'assets/playform-opentype.js',
  logLevel: 'warning',
});

for (const f of ['assets/playform-config.js', 'assets/playform-opentype.js', 'assets/playform-config.css']) {
  console.log(f, (statSync(f).size / 1024).toFixed(1) + 'KB');
}
