import type { ContributionCategory } from '@/lib/types';
        import { callClaude } from './client';

        type Classification = {
          signal: string;
          category: ContributionCategory;
          weight: number;
        };

        const SYSTEM_PROMPT = `You are a work contribution classifier for a GovTech team.
Given a raw contribution description, extract a clean signal and classify it.
Respond ONLY with valid JSON. No preamble, no markdown, no explanation.`;

        export async function classify(input: { source: string; freeText: string }): Promise<Classification> {
          const userMessage = `Source: ${input.source}
Description: ${input.freeText}

Respond with exactly this JSON:
{
  "signal": "1-2 sentence plain-English summary of what this person contributed",
  "category": "delivery|collaboration|mentorship|process|leadership|other",
  "weight": 1-5
}

Weight guide: 5=major impact (launched feature, led migration, unblocked critical path),
4=significant (substantial PR, important doc, cross-team coordination),
3=solid contribution (normal PR, helpful review, useful process improvement),
2=minor (small fix, brief review, short doc),
1=minimal (tiny fix, one-line change, brief note)`;

          try {
            const raw = await callClaude(SYSTEM_PROMPT, userMessage);
            const parsed = JSON.parse(raw) as Classification;
            return {
              signal: parsed.signal || input.freeText.slice(0, 200),
              category: parsed.category || 'other',
              weight: Math.min(5, Math.max(1, Number(parsed.weight) || 2)),
            };
          } catch {
            return {
              signal: input.freeText.slice(0, 200),
              category: 'other',
              weight: 2,
            };
          }
        }
