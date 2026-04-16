import { z } from 'zod';
import { callClaude } from './client';
import type { ContributionCategory } from '@/lib/types';
import { ContributionCategorySchema } from '@/lib/validation';

type Classification = {
  signal: string;
  category: ContributionCategory;
  weight: number;
};

const SYSTEM_PROMPT = `You are a work contribution classifier for a GovTech team.
Given a raw contribution description, extract a clean signal and classify it.
Respond ONLY with valid JSON. No preamble, no markdown, no explanation.`;

const CLASSIFICATION_SCHEMA = z.object({
  signal: z.string().optional(),
  category: ContributionCategorySchema.optional(),
  weight: z.number().int().min(1).max(5).optional(),
});

export async function classify(input: { source: string; freeText: string }): Promise<Classification> {
  const fallback: Classification = {
    signal: input.freeText.slice(0, 200),
    category: 'other',
    weight: 2,
  };

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
    const parsedJson = JSON.parse(raw);
    const parsed = CLASSIFICATION_SCHEMA.safeParse(parsedJson);

    if (!parsed.success) {
      return fallback;
    }

    return {
      signal: parsed.data.signal?.trim() || fallback.signal,
      category: parsed.data.category ?? fallback.category,
      weight: parsed.data.weight ?? fallback.weight,
    };
  } catch {
    return fallback;
  }
}
