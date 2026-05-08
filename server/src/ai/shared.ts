import { format } from 'date-fns';
import { callModel } from './client';
import type { Contribution, ContributionCategory, SliceContent, WrapMode } from '@wrapped/shared';

export const SLICE_SYSTEM_PROMPT = `You are writing a slide for "Wrapped for Work" — a Spotify Wrapped-style
year-in-review for a GovTech software team member.
Write in second person ("You", "Your").
Be specific and confident. Use the actual signals provided.
Respond ONLY with valid JSON. No preamble, no markdown.`;

export const modeInstruction = (mode: WrapMode) =>
  mode === 'snapshot'
    ? 'Punchy and stat-forward. Like a personal check-in. Short, direct sentences.'
    : 'Editorial and narrative. Write for a senior evaluator. Find the arc. Reference timing (e.g. "By Q3..."). Can include 2–3 specific examples in supporting[].';

export const fallbackForSlice = (sliceKey: string): SliceContent => ({
  sliceKey,
  headline: 'Still building this story.',
  body: 'Not enough data for this window yet.',
  stat: null,
  supporting: null,
});

export const formatContributionList = (contributions: Contribution[]) =>
  contributions
    .map((item) => `- [${format(new Date(item.occurredAt), 'yyyy-MM-dd')}] [weight:${item.weight}] ${item.signal}`)
    .join('\\n');

export const filterContributions = (
  contributions: Contribution[],
  categories: ContributionCategory[] | 'all',
  options?: { minWeight?: number; limit?: number },
) => {
  let filtered = categories === 'all'
    ? contributions
    : contributions.filter((item) => categories.includes(item.category));

  if (options?.minWeight) {
    filtered = filtered.filter((item) => item.weight >= options.minWeight!);
  }

  filtered = [...filtered].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
};

export const statFromContributions = (label: string, contributions: Contribution[]) => {
  if (!contributions.length) return null;
  return `${contributions.length} ${label}`;
};

export const createSlice = async (args: {
  sliceKey: string;
  sliceName: string;
  coverage: string;
  mode: WrapMode;
  contributions: Contribution[];
  categories: ContributionCategory[] | 'all';
  minWeight?: number;
  limit?: number;
  extraInstructions?: string;
  statHint: string;
  modelId?: string;
}): Promise<SliceContent> => {
  const relevant = filterContributions(args.contributions, args.categories, {
    minWeight: args.minWeight,
    limit: args.limit,
  });

  if (relevant.length < 2) {
    return fallbackForSlice(args.sliceKey);
  }

  const charLimit = args.mode === 'snapshot' ? 140 : 280;
  const userMessage = [
    `Slice: ${args.sliceName}`,
    `What it covers: ${args.coverage}`,
    `Mode: ${args.mode}`,
    `Tone: ${modeInstruction(args.mode)}`,
    '',
    'Relevant contributions:',
    formatContributionList(relevant),
    '',
    args.extraInstructions ?? '',
    'Respond with exactly this JSON:',
    '{',
    `  "sliceKey": "${args.sliceKey}",`,
    '  "headline": "max 60 chars — punchy, second-person",',
    `  "body": "max ${charLimit} chars",`,
    `  "stat": "optional short number string e.g. ${args.statHint}",`,
    '  "supporting": ["optional", "2-3 items", "year-end only"]',
    '}',
    '',
    `If there are fewer than 2 contributions, return: ${JSON.stringify(fallbackForSlice(args.sliceKey))}`,
  ].filter(Boolean).join('\\n');

  try {
    const raw = await callModel(SLICE_SYSTEM_PROMPT, userMessage, args.modelId);
    const parsed = JSON.parse(raw) as SliceContent;
    return {
      sliceKey: parsed.sliceKey || args.sliceKey,
      headline: parsed.headline || fallbackForSlice(args.sliceKey).headline,
      body: parsed.body || fallbackForSlice(args.sliceKey).body,
      stat: parsed.stat ?? statFromContributions(args.statHint.split(' ').slice(1).join(' ') || 'moments', relevant),
      supporting: args.mode === 'year-end' ? parsed.supporting ?? null : null,
    };
  } catch (error) {
    console.error(`Slice generation failed for ${args.sliceKey}:`, (error as Error).name, (error as Error).message);
    return fallbackForSlice(args.sliceKey);
  }
};
