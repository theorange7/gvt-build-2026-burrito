import { authHeader, backendUrl } from './endpoint';

export type ResetDataResult =
  | { partial: false }
  | { partial: true; failed: Array<'jobs' | 'results' | 'lookups' | 'shares'> };

export async function deleteServerData(): Promise<ResetDataResult> {
  const response = await fetch(backendUrl('/me/data'), {
    method: 'DELETE',
    headers: await authHeader(),
  });
  if (response.status === 204) return { partial: false };
  if (response.status === 207) {
    const body = (await response.json()) as { failed?: string[] };
    return {
      partial: true,
      failed: (body.failed ?? []) as Array<'jobs' | 'results' | 'lookups' | 'shares'>,
    };
  }
  throw new Error(`Unexpected status ${response.status}`);
}
