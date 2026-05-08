import type { Contribution, SliceContent, WrapMode } from '@wrapped/shared';
import { createSlice } from '../shared';

export function generateLaunchesShipped(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'launches_shipped',
    sliceName: 'Launches Shipped',
    coverage: 'The launches, high-impact deliveries, and major shipped outcomes you pushed over the line.',
    mode,
    contributions,
    categories: ['delivery'],
    minWeight: 4,
    statHint: '"3 launches"',
    modelId,
  });
}
