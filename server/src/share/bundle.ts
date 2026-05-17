import type { SliceContent, WrapMode } from '@wrapped/shared';
import { loadShareViewerAssets, type ShareViewerAssets } from './assets';

export type ShareBundleInput = {
  sliceContent: SliceContent[];
  mode: WrapMode;
  displayName?: string;
};

export type ShareBundle = {
  indexHtml: string;
  assets: {
    'viewer.js': Buffer;
    'viewer.css': Buffer;
  };
};

const DEFAULT_TITLE = 'Wrapped for Work — 2026';

/**
 * Build the shareable static bundle for a single wrap. Stamps the pre-built
 * template with the wrap's slice content and an optional opt-in display name.
 *
 * - `displayName` is the *only* user-supplied string that propagates into the
 *   bundle title. Identifiers (installId, userId, jobId, externalId) are not
 *   in the input type and therefore cannot leak.
 * - JSON is escaped via the `</script>` defeat described in the spec
 *   (`</` → `<`) — the only injection vector inside the inline JSON
 *   payload — so HTML/JS string interpolation can be a plain `replace`.
 */
export function renderShareBundle(
  input: ShareBundleInput,
  preloaded?: ShareViewerAssets,
): ShareBundle {
  const assets = preloaded ?? loadShareViewerAssets();
  const title = input.displayName?.trim() || DEFAULT_TITLE;
  const payload = {
    title,
    mode: input.mode,
    slices: input.sliceContent,
  };
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const indexHtml = assets.template.replace(/\{\{WRAP_JSON\}\}/g, json);
  return {
    indexHtml,
    assets: {
      'viewer.js': assets.viewerJs,
      'viewer.css': assets.viewerCss,
    },
  };
}
