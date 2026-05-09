import type { ClassifyResponse, ContributionCategory } from '@wrapped/shared';
import { authHeader, backendUrl } from './endpoint';

/**
 * Classify a free-text contribution. Calls the backend's `/classify`
 * endpoint. The shape and fallback semantics match the previous in-process
 * implementation so call sites in `ManualInputForm` don't need to change.
 *
 * Future local-mode swap-point: branch on `process.env.NEXT_PUBLIC_LLM_MODE
 * === 'local'` here and dispatch to an in-process classifier instead. Not
 * implemented in this change.
 */
export async function classify(input: { source: string; freeText: string }): Promise<ClassifyResponse> {
  try {
    const response = await fetch(backendUrl('/classify'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body = (await response.json()) as Partial<ClassifyResponse>;
    return {
      signal: body.signal || input.freeText.slice(0, 200),
      category: (body.category ?? 'other') as ContributionCategory,
      weight: Math.min(5, Math.max(1, Number(body.weight) || 2)),
    };
  } catch {
    return {
      signal: input.freeText.slice(0, 200),
      category: 'other',
      weight: 2,
    };
  }
}
