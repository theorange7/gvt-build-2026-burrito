import { ProviderAuthError, ProviderRateLimitError, ProviderTransientError } from '../types';

export type GitLabFetchOptions = {
  instanceUrl: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  token?: string;
  signal?: AbortSignal;
};

export type GitLabResponse<T> = {
  data: T;
  headers: Headers;
};

export function canonicalInstanceUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid instance URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `Insecure GitLab instance URL: ${raw}. The GitLab provider only talks over HTTPS to keep tokens off the wire in plaintext.`,
    );
  }
  return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
}

function buildUrl(instanceUrl: string, path: string, query?: GitLabFetchOptions['query']): string {
  const base = canonicalInstanceUrl(instanceUrl);
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function gitlabFetch<T>(opts: GitLabFetchOptions): Promise<GitLabResponse<T>> {
  const url = buildUrl(opts.instanceUrl, opts.path, opts.query);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const response = await fetch(url, { method: 'GET', headers, signal: opts.signal });

  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(
      `GitLab auth failed: ${response.status}`,
      response.status,
    );
  }
  if (response.status === 429) {
    const raw = response.headers.get('Retry-After');
    const parsed = raw !== null ? Number(raw) : NaN;
    const retryAfterSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    throw new ProviderRateLimitError(`GitLab rate limit exceeded`, retryAfterSeconds);
  }
  if (response.status >= 500) {
    throw new ProviderTransientError(
      `GitLab transient error: ${response.status}`,
      response.status,
    );
  }
  if (!response.ok) {
    throw new Error(`GitLab request failed: ${response.status}`);
  }

  const data = (await response.json()) as T;
  return { data, headers: response.headers };
}

export function parseScopesHeader(headers: Headers): string[] {
  const raw = headers.get('X-OAuth-Scopes');
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseRateLimitHeaders(headers: Headers): {
  remaining: number | null;
  resetAt: number | null;
} {
  const remainingRaw = headers.get('RateLimit-Remaining');
  const resetRaw = headers.get('RateLimit-Reset');
  const toNum = (raw: string | null): number | null => {
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return { remaining: toNum(remainingRaw), resetAt: toNum(resetRaw) };
}

export function parseNextPage(headers: Headers): number | null {
  const next = headers.get('X-Next-Page');
  if (!next || next.trim() === '') return null;
  const n = Number(next);
  return Number.isFinite(n) && n > 0 ? n : null;
}
