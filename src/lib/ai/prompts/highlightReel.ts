import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateHighlightReel(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'highlight_reel',
    sliceName: 'Highlight Reel',
    coverage: 'The three defining moments that best represent this window or year.',
    mode,
    contributions,
    categories: 'all',
    minWeight: 4,
    limit: 3,
    extraInstructions: 'Pick exactly 3 moments and name them specifically using the provided signal text. The supporting field should list those 3 moments in year-end mode.',
    statHint: '"3 defining moments"',
    modelId,
  });
}
