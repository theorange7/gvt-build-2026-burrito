import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateInitiative(contributions: Contribution[], mode: WrapMode): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'initiative',
    sliceName: 'Initiative',
    coverage: 'The self-started work, proposals, and leadership moments that existed because you made them happen.',
    mode,
    contributions,
    categories: ['leadership', 'delivery'],
    minWeight: 4,
    statHint: '"2 self-started bets"',
  });
}
