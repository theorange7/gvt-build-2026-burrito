import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateCollaborationStyle(contributions: Contribution[], mode: WrapMode): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'collaboration_style',
    sliceName: 'Collaboration Style',
    coverage: 'The way you show up for others through async coordination, reviews, and process habits.',
    mode,
    contributions,
    categories: ['collaboration', 'process'],
    statHint: '"68 shared moments"',
  });
}
