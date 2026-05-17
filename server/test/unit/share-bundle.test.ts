import { describe, expect, it } from 'vitest';
import type { SliceContent } from '@wrapped/shared';
import { renderShareBundle } from '../../src/share/bundle';
import { _resetShareViewerAssetsCache, loadShareViewerAssets } from '../../src/share/assets';

const FIXTURE: SliceContent[] = [
  {
    sliceKey: 'launches_shipped',
    headline: 'You shipped a lot',
    body: 'Twelve PRs across three repos.',
    stat: '12',
    supporting: ['gateway', 'platform', 'docs'],
  },
  {
    sliceKey: 'collaboration_style',
    headline: 'Async-first',
    body: 'Most of your reviews land within a day.',
  },
];

describe('renderShareBundle', () => {
  it('loads the template + bundle from share-viewer/dist', () => {
    _resetShareViewerAssetsCache();
    const assets = loadShareViewerAssets();
    expect(assets.template).toContain('{{WRAP_JSON}}');
    expect(assets.viewerJs.length).toBeGreaterThan(0);
    expect(assets.viewerCss.length).toBeGreaterThan(0);
  });

  it('stamps the wrap JSON into the template and ships the assets', () => {
    const { indexHtml, assets } = renderShareBundle({
      sliceContent: FIXTURE,
      mode: 'snapshot',
    });
    expect(indexHtml).not.toContain('{{WRAP_JSON}}');
    expect(indexHtml).toContain('You shipped a lot');
    expect(indexHtml).toContain('"mode":"snapshot"');
    expect(assets['viewer.js'].length).toBeGreaterThan(0);
    expect(assets['viewer.css'].length).toBeGreaterThan(0);
  });

  it('uses the default title when no displayName is given', () => {
    const { indexHtml } = renderShareBundle({
      sliceContent: FIXTURE,
      mode: 'year-end',
    });
    expect(indexHtml).toContain('Wrapped for Work — 2026');
  });

  it('uses the user-supplied displayName when provided', () => {
    const { indexHtml } = renderShareBundle({
      sliceContent: FIXTURE,
      mode: 'snapshot',
      displayName: 'Alex — Q2 retro',
    });
    expect(indexHtml).toContain('Alex — Q2 retro');
  });

  it('escapes </script> so a slice value cannot break out of the inline JSON', () => {
    const malicious: SliceContent[] = [
      {
        sliceKey: 'launches_shipped',
        headline: '</script><script>alert(1)</script>',
        body: 'safe body',
      },
    ];
    const { indexHtml } = renderShareBundle({ sliceContent: malicious, mode: 'snapshot' });
    // The inline JSON payload must not contain a literal </script> tag.
    const inlineMatch = indexHtml.match(/<script type="application\/json" id="wrap-data">([\s\S]*?)<\/script>/);
    expect(inlineMatch).not.toBeNull();
    expect(inlineMatch![1]).not.toContain('</script>');
    expect(inlineMatch![1]).toContain('\\u003c/script');
  });

  it('emits the noindex meta tag so the bundle is unlisted, not searchable', () => {
    const { indexHtml } = renderShareBundle({ sliceContent: FIXTURE, mode: 'snapshot' });
    expect(indexHtml).toContain('noindex');
    expect(indexHtml).toContain('nofollow');
    expect(indexHtml).toContain('noarchive');
  });

  it('reserves the spec-30 video link but keeps it hidden by default', () => {
    const { indexHtml } = renderShareBundle({ sliceContent: FIXTURE, mode: 'snapshot' });
    expect(indexHtml).toMatch(/id="video-link"[^>]*\bhidden\b/);
  });

  it('does not contain installId, jobId, externalId, userId, or token tokens', () => {
    const { indexHtml, assets } = renderShareBundle({
      sliceContent: FIXTURE,
      mode: 'snapshot',
      displayName: 'My retro',
    });
    const dump = indexHtml + assets['viewer.js'].toString('utf8');
    expect(dump).not.toContain('installId');
    expect(dump).not.toContain('externalId');
    expect(dump).not.toContain('userId');
    expect(dump).not.toContain('jobId');
  });
});
