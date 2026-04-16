import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { createSlice } from '../shared';

export function generateLaunchesShipped(contributions: Contribution[], mode: WrapMode): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'launches_shipped',
    sliceName: 'Launches Shipped',
    coverage: 'The launches, high-impact deliveries, and major shipped outcomes you pushed over the line.',
    mode,
    contributions,
    categories: ['delivery'],
    minWeight: 4,
    statHint: '"3 launches"',
  });
}
