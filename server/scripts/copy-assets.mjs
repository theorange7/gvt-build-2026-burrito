/**
 * Copies non-TS runtime assets into dist/ after tsc compilation, and writes
 * a production-shaped package.json for the deployed artifact.
 *
 * Run order: build-shared.mjs → tsc → copy-assets.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(serverRoot, 'dist');

// host.json
copyFileSync(resolve(serverRoot, 'host.json'), resolve(distDir, 'host.json'));
console.log('Copied host.json');

// models.config.json
mkdirSync(resolve(distDir, 'ai'), { recursive: true });
copyFileSync(
  resolve(serverRoot, 'src', 'ai', 'models.config.json'),
  resolve(distDir, 'ai', 'models.config.json'),
);
console.log('Copied ai/models.config.json');

// Runtime dist/package.json — production deps only, main → index.js.
// @wrapped/shared is replaced by the local _shared build (pre-compiled by
// build-shared.mjs). The file: reference is resolved by npm install during
// `pnpm package` and placed into node_modules/@wrapped/shared before zipping.
const orig = JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8'));
const deps = { ...orig.dependencies };
delete deps['@wrapped/shared'];
const runtimePkg = {
  name: orig.name,
  version: orig.version,
  private: true,
  main: 'index.js',
  dependencies: {
    ...deps,
    '@wrapped/shared': 'file:./_shared',
  },
};
writeFileSync(resolve(distDir, 'package.json'), JSON.stringify(runtimePkg, null, 2));
console.log('Wrote dist/package.json');
