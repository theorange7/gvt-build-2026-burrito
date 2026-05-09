import type { Contribution, SliceContent, WrapMode } from '@wrapped/shared';
import { createSlice } from '../shared';

export function generateVelocity(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'velocity',
    sliceName: 'Velocity',
    coverage: 'Your pace of delivery, ticket closure, and throughput across the selected window.',
    mode,
    contributions,
    categories: ['delivery'],
    statHint: '"47 PRs"',
    modelId,
  });
}
