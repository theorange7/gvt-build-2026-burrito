/*
 * Build the standalone share viewer bundle. Single viewer.js + viewer.css
 * in dist/, plus the index.template.html copied over. No third-party
 * dependencies — esbuild is the only thing in the pipeline. The dist/ output
 * is consumed by the server build (see server/scripts/copy-assets.mjs).
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, 'dist');
mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [resolve(here, 'src', 'main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: resolve(distDir, 'viewer.js'),
  logLevel: 'info',
});

copyFileSync(resolve(here, 'src', 'styles.css'), resolve(distDir, 'viewer.css'));
copyFileSync(
  resolve(here, 'index.template.html'),
  resolve(distDir, 'index.template.html'),
);

console.log('share-viewer build complete →', distDir);
