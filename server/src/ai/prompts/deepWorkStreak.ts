import type { Contribution, SliceContent, WrapMode } from '@wrapped/shared';
import { createSlice } from '../shared';

export function generateDeepWorkStreak(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'deep_work_streak',
    sliceName: 'Deep Work Streak',
    coverage: 'Your most concentrated burst of focused work across delivery and process improvements.',
    mode,
    contributions,
    categories: ['delivery', 'process'],
    minWeight: 3,
    statHint: '"5-week run"',
    modelId,
  });
}
