/*
 * Pre-baked Claude responses keyed by the system prompt's slice key. The slice
 * generators in src/ai/prompts/* embed identifying strings in their system
 * prompts; we match on those to return a deterministic body per slice.
 */

export const SLICE_RESPONSES: Record<string, { headline: string; body: string; stat?: string; supporting?: string[] }> = {
  launches_shipped: {
    headline: 'Twelve launches, one signature pattern.',
    body: 'You consistently shipped features that quieted incident pages.',
    stat: '12 launches',
  },
  velocity: {
    headline: 'Steady, deliberate cadence.',
    body: 'Throughput trended up without burst-and-crash spikes.',
    stat: '38 PRs/quarter',
  },
  cross_team_impact: {
    headline: 'You closed loops other people opened.',
    body: 'Your reviews unblocked downstream work in three squads.',
    stat: '47 reviews',
  },
  deep_work_streak: {
    headline: 'A 14-day arc of focus.',
    body: 'When you went deep, the artifacts showed it.',
    stat: '14 days',
  },
  mentorship: {
    headline: 'Quietly raising the floor.',
    body: 'You answered the questions that helped other people ship.',
    stat: '8 mentorship moments',
  },
  initiative: {
    headline: 'Started before being asked.',
    body: 'Two initiatives became team defaults this year.',
    stat: '2 self-started',
  },
  collaboration_style: {
    headline: 'Async-first, decision-final.',
    body: 'You wrote things down, then closed the loop.',
    stat: '12 threads resolved',
  },
  consistency: {
    headline: 'You showed up across the calendar.',
    body: 'Distribution beats spikes.',
    stat: '11 active months',
  },
  highlight_reel: {
    headline: 'Three moments worth keeping.',
    body: 'These three defined the year.',
    stat: '3 defining moments',
    supporting: [
      'The rate-limiting launch.',
      'The Q2 reconciliation rewrite.',
      'The Confluence ADR that shifted the roadmap.',
    ],
  },
  identity: {
    headline: 'A pattern emerges.',
    body: 'You are the engineer who closes the last 10%.',
    stat: '·',
  },
};

export function pickResponseFor(systemPrompt: string): { headline: string; body: string; stat?: string; supporting?: string[] } {
  const lower = systemPrompt.toLowerCase();
  if (lower.includes('launches')) return SLICE_RESPONSES.launches_shipped;
  if (lower.includes('velocity')) return SLICE_RESPONSES.velocity;
  if (lower.includes('cross-team') || lower.includes('cross team')) return SLICE_RESPONSES.cross_team_impact;
  if (lower.includes('deep work') || lower.includes('deep-work')) return SLICE_RESPONSES.deep_work_streak;
  if (lower.includes('mentorship')) return SLICE_RESPONSES.mentorship;
  if (lower.includes('initiative')) return SLICE_RESPONSES.initiative;
  if (lower.includes('collaboration style') || lower.includes('async')) return SLICE_RESPONSES.collaboration_style;
  if (lower.includes('consistency')) return SLICE_RESPONSES.consistency;
  if (lower.includes('highlight reel') || lower.includes('three defining moments') || lower.includes('three moments')) return SLICE_RESPONSES.highlight_reel;
  if (lower.includes('identity') || lower.includes('signature')) return SLICE_RESPONSES.identity;
  return SLICE_RESPONSES.identity;
}

export const CLASSIFY_RESPONSE = {
  signal: 'Captured stakeholder feedback after launch and translated into a follow-up plan.',
  category: 'leadership' as const,
  weight: 4,
};
