import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the share-viewer bundle (the pre-built template + viewer.js +
 * viewer.css) into memory once per process. The bundle is produced by
 * `pnpm -C share-viewer build` and is copied into the server deploy
 * artifact by `server/scripts/copy-assets.mjs`. See spec 31.
 *
 * The viewer is a *static* bundle — built once, stamped per share — and the
 * worker only ever reads it, never writes it. Holding it cached as Buffers
 * means each publish is a memcpy + the JSON stamp, not a disk read.
 */

const DEFAULT_DIST_DIR = resolve(__dirname, '..', 'share-viewer');

export type ShareViewerAssets = {
  template: string;
  viewerJs: Buffer;
  viewerCss: Buffer;
};

let cached: ShareViewerAssets | null = null;

export function shareViewerDistDir(): string {
  return process.env.SHARE_VIEWER_DIST_DIR ?? DEFAULT_DIST_DIR;
}

export function loadShareViewerAssets(): ShareViewerAssets {
  if (cached) return cached;
  const dir = shareViewerDistDir();
  cached = {
    template: readFileSync(resolve(dir, 'index.template.html'), 'utf8'),
    viewerJs: readFileSync(resolve(dir, 'viewer.js')),
    viewerCss: readFileSync(resolve(dir, 'viewer.css')),
  };
  return cached;
}

export function _resetShareViewerAssetsCache(): void {
  cached = null;
}
