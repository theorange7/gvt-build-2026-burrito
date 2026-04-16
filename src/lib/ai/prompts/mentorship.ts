import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateMentorship(contributions: Contribution[], mode: WrapMode): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'mentorship',
    sliceName: 'Mentorship',
    coverage: 'How you helped teammates grow through reviews, coaching, answers, and guidance.',
    mode,
    contributions,
    categories: ['mentorship'],
    statHint: '"9 teammates supported"',
  });
}
