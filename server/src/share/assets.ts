import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolves the share-viewer dist artifacts (template + viewer.js +
 * viewer.css) into memory. Produced by `pnpm -C share-viewer build` and
 * copied into the server deploy artifact by `server/scripts/copy-assets.mjs`.
 * See spec 31.
 *
 * Pure: no module-level cache, no side effects beyond the three file reads.
 * Long-lived callers (e.g. the Functions worker) should call this once at
 * first-publish time and thread the returned `ShareViewerAssets` through
 * `publishShareBundle` / `renderShareBundle` so per-publish disk IO stays
 * out of the hot path. Keeping the cache outside this module means unit
 * tests don't need a reset hook to opt out of stale state — they just
 * construct synthetic fixtures or call this function fresh.
 */

const DEFAULT_DIST_DIR = resolve(__dirname, '..', 'share-viewer');

export type ShareViewerAssets = {
  template: string;
  viewerJs: Buffer;
  viewerCss: Buffer;
};

export function shareViewerDistDir(): string {
  return process.env.SHARE_VIEWER_DIST_DIR ?? DEFAULT_DIST_DIR;
}

export function loadShareViewerAssets(): ShareViewerAssets {
  const dir = shareViewerDistDir();
  return {
    template: readFileSync(resolve(dir, 'index.template.html'), 'utf8'),
    viewerJs: readFileSync(resolve(dir, 'viewer.js')),
    viewerCss: readFileSync(resolve(dir, 'viewer.css')),
  };
}
