// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classify } from './classify';

vi.mock('./client', () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from './client';

const mockedCallClaude = vi.mocked(callClaude);

describe('classify', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns validated AI output when the payload is well formed', async () => {
    mockedCallClaude.mockResolvedValue(
      JSON.stringify({ signal: 'You unblocked deployment readiness.', category: 'delivery', weight: 4 }),
    );

    await expect(classify({ source: 'manual', freeText: 'Helped ship the release.' })).resolves.toEqual({
      signal: 'You unblocked deployment readiness.',
      category: 'delivery',
      weight: 4,
    });
  });

  it('falls back when the AI payload is malformed', async () => {
    mockedCallClaude.mockResolvedValue('{invalid json');

    await expect(classify({ source: 'manual', freeText: 'Updated the runbook for the team.' })).resolves.toEqual({
      signal: 'Updated the runbook for the team.',
      category: 'other',
      weight: 2,
    });
  });

  it('falls back when the client throws', async () => {
    mockedCallClaude.mockRejectedValue(new Error('network failed'));

    await expect(classify({ source: 'manual', freeText: 'Mentored two engineers through onboarding.' })).resolves.toEqual({
      signal: 'Mentored two engineers through onboarding.',
      category: 'other',
      weight: 2,
    });
  });
});
