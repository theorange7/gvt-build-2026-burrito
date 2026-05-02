import { http, HttpResponse } from 'msw';
import {
  GITLAB_EVENTS_PAGE_1,
  GITLAB_EVENTS_PAGE_2,
  GITLAB_USER_FIXTURE,
  GITLAB_VERSION_FIXTURE,
  type GitLabEventFixture,
} from '../fixtures/gitlab';

export const TEST_GITLAB_BASE = 'https://gitlab.test.example.com';
export const TEST_GITLAB_PAT = 'glpat-test-token-AAA';

export type GitLabCall = {
  url: string;
  method: string;
  authorization: string | null;
};

export const gitlabCalls: GitLabCall[] = [];

function record(request: Request) {
  gitlabCalls.push({
    url: request.url,
    method: request.method,
    authorization: request.headers.get('authorization'),
  });
}

function unauthIfMissingPat(request: Request): HttpResponse<string> | null {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${TEST_GITLAB_PAT}`) {
    return new HttpResponse(JSON.stringify({ message: '401 Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

function paged(events: GitLabEventFixture[], page: number, totalPages: number) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Page': String(page),
    'X-Per-Page': '20',
    'X-Total-Pages': String(totalPages),
  };
  if (page < totalPages) headers['X-Next-Page'] = String(page + 1);
  return new HttpResponse(JSON.stringify(events), { status: 200, headers });
}

export const gitlabHandlers = [
  http.get(`${TEST_GITLAB_BASE}/api/v4/version`, ({ request }) => {
    record(request);
    const unauth = unauthIfMissingPat(request);
    if (unauth) return unauth;
    return HttpResponse.json(GITLAB_VERSION_FIXTURE);
  }),

  http.get(`${TEST_GITLAB_BASE}/api/v4/user`, ({ request }) => {
    record(request);
    const unauth = unauthIfMissingPat(request);
    if (unauth) return unauth;
    return new HttpResponse(JSON.stringify(GITLAB_USER_FIXTURE), {
      status: 200,
      headers: { 'content-type': 'application/json', 'X-OAuth-Scopes': 'read_api,read_user' },
    });
  }),

  http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, ({ request }) => {
    record(request);
    const unauth = unauthIfMissingPat(request);
    if (unauth) return unauth;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    if (page === 1) return paged(GITLAB_EVENTS_PAGE_1, 1, 2);
    if (page === 2) return paged(GITLAB_EVENTS_PAGE_2, 2, 2);
    return paged([], page, 2);
  }),
];

export function clearGitlabCalls(): void {
  gitlabCalls.length = 0;
}
