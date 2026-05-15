/**
 * Installs production dependencies into dist/ and zips it into wrap-server.zip.
 * Uses npm (not pnpm) to produce a flat node_modules without symlinks, which
 * zip handles reliably.
 */
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(serverRoot, 'dist');

console.log('Installing production dependencies into dist/...');
execSync('npm install --omit=dev --no-package-lock', { stdio: 'inherit', cwd: distDir });

console.log('Zipping dist/ → wrap-server.zip...');
execSync('zip -r ../wrap-server.zip . -x "*.test.js"', { stdio: 'inherit', cwd: distDir });

console.log('Artifact ready: server/wrap-server.zip');
