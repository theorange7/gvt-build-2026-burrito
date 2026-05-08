import type { Contribution, SliceContent, WrapMode } from '@wrapped/shared';
import { createSlice } from '../shared';

export function generateCrossTeamImpact(contributions: Contribution[], mode: WrapMode, modelId?: string): Promise<SliceContent> {
  return createSlice({
    sliceKey: 'cross_team_impact',
    sliceName: 'Cross-Team Impact',
    coverage: 'The reviews, unblockers, and cross-functional contributions that moved other teams forward.',
    mode,
    contributions,
    categories: ['collaboration'],
    statHint: '"12 unblockers"',
    modelId,
  });
}
