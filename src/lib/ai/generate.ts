import type { Contribution, SliceContent, WrapMode } from '@/lib/types';
import { fallbackForSlice } from './shared';
import { generateLaunchesShipped } from './prompts/launchesShipped';
import { generateVelocity } from './prompts/velocity';
import { generateCrossTeamImpact } from './prompts/crossTeamImpact';
import { generateDeepWorkStreak } from './prompts/deepWorkStreak';
import { generateMentorship } from './prompts/mentorship';
import { generateInitiative } from './prompts/initiative';
import { generateCollaborationStyle } from './prompts/collaborationStyle';
import { generateConsistency } from './prompts/consistency';
import { generateHighlightReel } from './prompts/highlightReel';
import { generateIdentity } from './prompts/identity';

const sliceEntries = [
  ['launches_shipped', generateLaunchesShipped],
  ['velocity', generateVelocity],
  ['cross_team_impact', generateCrossTeamImpact],
  ['deep_work_streak', generateDeepWorkStreak],
  ['mentorship', generateMentorship],
  ['initiative', generateInitiative],
  ['collaboration_style', generateCollaborationStyle],
  ['consistency', generateConsistency],
  ['highlight_reel', generateHighlightReel],
  ['identity', generateIdentity],
] as const;

export async function generateWrap(input: {
  contributions: Contribution[];
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  modelId?: string;
}): Promise<SliceContent[]> {
  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    sliceEntries.map(([_, generator]) => generator(input.contributions, input.mode, input.modelId)),
  );

  const succeeded: string[] = [];
  const fellBack: string[] = [];

  const output = settled.map((result, index) => {
    const [sliceKey] = sliceEntries[index];
    if (result.status === 'fulfilled') {
      succeeded.push(sliceKey);
      return result.value;
    }
    fellBack.push(sliceKey);
    return fallbackForSlice(sliceKey);
  });

  console.log('Wrapped generation complete', {
    mode: input.mode,
    model: input.modelId ?? 'default',
    success: succeeded,
    fallback: fellBack,
    totalMs: Date.now() - startedAt,
  });

  return output;
}
