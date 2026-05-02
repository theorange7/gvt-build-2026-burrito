import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateIdentity(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'identity',
    sliceName: 'Identity',
    coverage: 'Your signature contribution style and the role you played across the selected period.',
    mode,
    contributions,
    categories: 'all',
    limit: 5,
    extraInstructions: 'Synthesize the top five contributions into a concise description of how this person is experienced by their team.',
    statHint: '"5 signature signals"',
    modelId,
  });
}
