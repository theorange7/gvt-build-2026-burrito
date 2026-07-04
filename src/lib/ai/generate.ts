import type {
  ContributionForAI,
  EnqueueWrapRequest,
  EnqueueWrapResponse,
  GetWrapResponse,
  WrapMode,
} from '@wrapped/shared';
import { authHeader, backendUrl } from './endpoint';

/**
 * Submit a wrap-generation job to the backend queue. Returns immediately with
 * `{ jobId, status, busy? }`. Clients should poll `/wrap/{jobId}` via
 * `pollWrap` until `complete` or `failed`. Replaces the previous in-process
 * `generateWrap` — generation now happens in the Functions worker.
 */
export async function enqueueWrap(input: {
  jobId: string;
  contributions: ContributionForAI[];
  mode: WrapMode;
  windowStart: string;
  windowEnd: string;
  modelId?: string;
  share?: boolean;
  shareName?: string;
}): Promise<EnqueueWrapResponse> {
  const payload: EnqueueWrapRequest = input;
  const response = await fetch(backendUrl('/wrap'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `enqueue failed (${response.status})`);
  }
  return (await response.json()) as EnqueueWrapResponse;
}

export async function pollWrap(jobId: string): Promise<GetWrapResponse> {
  const response = await fetch(backendUrl(`/wrap/${jobId}`), {
    headers: { ...(await authHeader()) },
  });
  if (response.status === 404) {
    return { status: 'failed', error: 'not-found' };
  }
  if (response.status === 410) {
    return { status: 'failed', error: 'result-already-fetched' };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `poll failed (${response.status})`);
  }
  return (await response.json()) as GetWrapResponse;
}
