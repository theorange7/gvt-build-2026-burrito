/**
 * Known-gap regression signals.
 *
 * Each test.fail() block asserts the SUCCESS outcome — the thing that
 * would be true IF the bug were fixed. test.fail() means:
 *   - If the assertion PASSES (bug fixed): Playwright reports "unexpectedly passed" → red in CI.
 *     Remove test.fail() and confirm the corresponding UAT spec passes cleanly.
 *   - If the assertion FAILS (bug still exists): Playwright reports "known failure" → green in CI.
 *
 * KG-2 (pendingWrapRequests not encrypted) — Spec 12.
 *   Rows in pendingWrapRequests have plaintext mode/windowStart/windowEnd etc.
 *   Covered structurally by UAT-005 observation. No browser-visible error.
 *   Fix: implement Spec 12. When fixed, remove this comment and add encryption assertion to 05-wrap-generation.spec.ts.
 *
 * KG-6 (404-on-pending branch not graceful) — Spec 13.
 *   When pending row exists locally but server returns 404, shows "Generation failed." not graceful copy.
 *   UAT-016 only covers the no-pending-row branch (already graceful).
 *   Requires backend manipulation to test the 404-on-pending branch. No test.fail() here.
 *   Fix: implement Spec 13 graceful-404 branch. Then add a test to 16-stale-wrap-link.spec.ts.
 *
 * KG-7 (stuck-running recovery) — Spec 10. Backend-only sweeper. Not browser-observable.
 *
 * KG-8 (hide-/offline-aware pause polling) — Spec 11. No visible effect currently.
 *
 * KG-9 (JWT kid rotation) — Spec 20. Backend-only. No client-visible effect.
 *
 * KG-10 (partially resolved) — Share Link (Spec 31) and File Upload provider (Spec 50)
 *   have shipped. Archive view, weight editing, per-slide edit, draft save,
 *   Slack/Jira/Confluence remain absent. No regression signal needed for remaining items.
 *
 * KG-11 (dead code) — Informational only. No regression signal needed.
 */

import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

// ---------------------------------------------------------------------------
// KG-1: ManualInputForm classify call endpoint — RESOLVED
// ---------------------------------------------------------------------------
// The uat-plan documented ManualInputForm calling fetch('/api/classify') as a
// relative URL. The current build already imports classify() from
// src/lib/ai/classify.ts which correctly calls backendUrl('/classify').
// test.fail() was removed because this gap is no longer present — the
// 04-manual-entry.spec.ts client-only test confirms success. No signal needed.

// ---------------------------------------------------------------------------
// KG-3: Wrap viewer renders mock data, not real sliceContent — RESOLVED
// ---------------------------------------------------------------------------
// WrapViewer.tsx passes wrap.sliceContent as slices to WrapExperience, which
// forwards it to WrapDesktop/WrapPhone. WrapDesktop renders slice.headline.
// Stub returns "Stub headline" which is now visible in the wrap viewer.

test('KG-3: Wrap viewer renders real sliceContent instead of hardcoded mock (regression signal)', async ({ page }) => {
  await stubBackend(page);
  await page.goto('/dashboard');
  await clearStorage(page);
  await page.goto('/dashboard');
  await setupPassphrase(page, PASS);
  await seedDemoData(page);

  await page.getByRole('button', { name: /wrap it/i }).click();
  await page.getByRole('button', { name: /^generate$/i }).click();
  const link = page.getByRole('link', { name: /view status/i });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  // Wait for poll to resolve (stub returns complete immediately)
  await page.waitForTimeout(3000);
  // If fixed: stub's sliceContent headlines are rendered
  await expect(page.getByRole('heading', { name: /stub headline/i })).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// KG-5: Pending-wrap polling does not pause on lock — RESOLVED
// ---------------------------------------------------------------------------
// usePendingWrap checks hasActiveKey() before each poll tick. When the key is
// null (cleared by beforeunload), it sets phase:'paused-locked'.
// PendingWrapView renders "Unlock your local store to resume." for that phase.

test('KG-5: Lock during pending wrap shows unlock prompt not failure (regression signal)', async ({ page }) => {
  await stubBackend(page, { pollStatus: 'queued' });
  await page.goto('/dashboard');
  await clearStorage(page);
  await page.goto('/dashboard');
  await setupPassphrase(page, PASS);
  await seedDemoData(page);

  await page.getByRole('button', { name: /wrap it/i }).click();
  await page.getByRole('button', { name: /^generate$/i }).click();
  const link = page.getByRole('link', { name: /view status/i });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();

  // Simulate lock via beforeunload
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));

  // If fixed: PendingWrapView shows the paused-locked unlock prompt instead of
  // staying in queued/failed state. usePendingWrap sets phase:'paused-locked' on
  // the next tick after the key is cleared, which renders this text.
  await expect(page.getByText(/unlock your local store to resume/i)).toBeVisible({ timeout: 10_000 });
});
