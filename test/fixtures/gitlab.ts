/**
 * Fixtures for GitLab Dedicated. Shaped to match real `/api/v4` responses
 * closely enough for sync/normalize tests, but trimmed to the fields the
 * provider actually consumes.
 */

export type GitLabEventFixture = {
  id: number;
  project_id: number;
  action_name: string;
  target_type: string | null;
  target_id?: number | null;
  target_iid?: number | null;
  target_title?: string | null;
  created_at: string;
  push_data?: {
    commit_count: number;
    action: string;
    ref_type: string;
    commit_title?: string;
    ref?: string;
  };
  note?: {
    id: number;
    body: string;
    noteable_type: string;
    noteable_iid?: number;
  };
  author: { id: number; username: string; name: string };
};

export const GITLAB_USER_FIXTURE = {
  id: 4242,
  username: 'alice',
  name: 'Alice Example',
  email: 'alice@example.com',
  state: 'active',
  web_url: 'https://gitlab.test.example.com/alice',
};

export const GITLAB_VERSION_FIXTURE = {
  version: '17.6.0-ee',
  revision: 'abcdef',
  enterprise: true,
};

export const GITLAB_EVENTS_PAGE_1: GitLabEventFixture[] = [
  {
    id: 9001,
    project_id: 1,
    action_name: 'pushed to',
    target_type: null,
    created_at: '2025-04-15T10:00:00.000Z',
    push_data: {
      commit_count: 3,
      action: 'pushed',
      ref_type: 'branch',
      commit_title: 'Add rate limiting middleware',
      ref: 'main',
    },
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
  {
    id: 9002,
    project_id: 1,
    action_name: 'accepted',
    target_type: 'MergeRequest',
    target_id: 2001,
    target_iid: 12,
    target_title: 'Migrate auth to OAuth2',
    created_at: '2025-04-18T12:30:00.000Z',
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
  {
    id: 9003,
    project_id: 1,
    action_name: 'commented on',
    target_type: 'Note',
    target_id: 3001,
    target_iid: 7,
    target_title: 'Re: Index strategy for jobs table',
    created_at: '2025-04-20T08:00:00.000Z',
    note: {
      id: 7777,
      body: 'Verified — the partial index covers our hot path.',
      noteable_type: 'MergeRequest',
      noteable_iid: 7,
    },
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
];

export const GITLAB_EVENTS_PAGE_2: GitLabEventFixture[] = [
  {
    id: 9004,
    project_id: 2,
    action_name: 'opened',
    target_type: 'Issue',
    target_id: 5001,
    target_iid: 42,
    target_title: 'Investigate p99 latency on /search',
    created_at: '2025-04-25T15:00:00.000Z',
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
  {
    id: 9005,
    project_id: 2,
    action_name: 'closed',
    target_type: 'Issue',
    target_id: 5001,
    target_iid: 42,
    target_title: 'Investigate p99 latency on /search',
    created_at: '2025-04-28T16:00:00.000Z',
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
];
