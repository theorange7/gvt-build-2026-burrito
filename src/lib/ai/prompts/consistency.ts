import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateConsistency(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'consistency',
    sliceName: 'Consistency',
    coverage: 'Your rhythm across the window: where work clustered, where it stayed steady, and how momentum changed over time.',
    mode,
    contributions,
    categories: ['delivery', 'collaboration'],
    extraInstructions: 'Comment on the distribution across time. Mention notable streaks, pauses, or surges if they are visible in the dates.',
    statHint: '"42 active weeks"',
    modelId,
  });
}
