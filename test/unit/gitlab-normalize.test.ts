import { describe, expect, it } from 'vitest';
import { externalIdFor, normalize } from '@/lib/providers/gitlab-dedicated/normalize';
import type { ExternalIdentity, RawEvent } from '@/lib/providers/types';
import type { GitLabEventFixture } from '../fixtures/gitlab';

const identity: ExternalIdentity = {
  providerId: 'gitlab-dedicated',
  instanceUrl: 'https://gitlab.test.example.com',
  externalUserId: '4242',
  username: 'alice',
};

function asRawEvent(event: GitLabEventFixture): RawEvent {
  return {
    type: event.action_name,
    occurredAt: new Date(event.created_at).getTime(),
    payload: event,
  };
}

describe('gitlab-dedicated/normalize', () => {
  it('externalIdFor returns a stable namespaced id', () => {
    const event: GitLabEventFixture = {
      id: 123,
      project_id: 1,
      action_name: 'pushed to',
      target_type: null,
      created_at: '2025-04-15T10:00:00.000Z',
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };
    expect(externalIdFor(asRawEvent(event))).toBe('gitlab:event:123');
  });

  it('normalizes a push event into a single delivery contribution', () => {
    const event: GitLabEventFixture = {
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
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };

    const out = normalize({ event: asRawEvent(event), identity });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('gitlab');
    expect(out[0].category).toBe('delivery');
    expect(out[0].externalId).toBe('gitlab:event:9001');
    expect(out[0].signal).toMatch(/Add rate limiting middleware/);
    expect(out[0].signal).toMatch(/3 commits?/);
    expect(out[0].weight).toBeGreaterThanOrEqual(2);
    expect(out[0].occurredAt.toISOString()).toBe('2025-04-15T10:00:00.000Z');
  });

  it('normalizes a merged MR event into a delivery contribution with externalUrl', () => {
    const event: GitLabEventFixture = {
      id: 9002,
      project_id: 1,
      action_name: 'accepted',
      target_type: 'MergeRequest',
      target_id: 2001,
      target_iid: 12,
      target_title: 'Migrate auth to OAuth2',
      created_at: '2025-04-18T12:30:00.000Z',
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };

    const out = normalize({ event: asRawEvent(event), identity });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('delivery');
    expect(out[0].signal).toMatch(/Migrate auth to OAuth2/);
    expect(out[0].externalUrl).toContain('https://gitlab.test.example.com');
    expect(out[0].weight).toBeGreaterThanOrEqual(3);
  });

  it('normalizes a comment event into a collaboration contribution', () => {
    const event: GitLabEventFixture = {
      id: 9003,
      project_id: 1,
      action_name: 'commented on',
      target_type: 'Note',
      target_iid: 7,
      target_title: 'Re: Index strategy for jobs table',
      created_at: '2025-04-20T08:00:00.000Z',
      note: {
        id: 7777,
        body: 'Verified — the partial index covers our hot path.',
        noteable_type: 'MergeRequest',
        noteable_iid: 7,
      },
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };

    const out = normalize({ event: asRawEvent(event), identity });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('collaboration');
    expect(out[0].signal).toMatch(/(Index strategy|partial index|comment)/i);
  });

  it('normalizes opened and closed issues into delivery contributions', () => {
    const opened: GitLabEventFixture = {
      id: 9004,
      project_id: 2,
      action_name: 'opened',
      target_type: 'Issue',
      target_iid: 42,
      target_title: 'Investigate p99 latency on /search',
      created_at: '2025-04-25T15:00:00.000Z',
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };
    const closed: GitLabEventFixture = {
      ...opened,
      id: 9005,
      action_name: 'closed',
      created_at: '2025-04-28T16:00:00.000Z',
    };

    const a = normalize({ event: asRawEvent(opened), identity });
    const b = normalize({ event: asRawEvent(closed), identity });
    expect(a[0].category).toBe('delivery');
    expect(b[0].category).toBe('delivery');
    expect(a[0].signal).toMatch(/Investigate p99 latency/);
    expect(b[0].signal).toMatch(/Investigate p99 latency/);
  });

  it('returns an empty array for unknown event types', () => {
    const event: GitLabEventFixture = {
      id: 1,
      project_id: 1,
      action_name: 'imported',
      target_type: 'WikiPage',
      created_at: '2025-04-15T10:00:00.000Z',
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };
    const out = normalize({ event: asRawEvent(event), identity });
    expect(out).toEqual([]);
  });

  it('source is always "gitlab" and rawData carries the event id', () => {
    const event: GitLabEventFixture = {
      id: 1234,
      project_id: 1,
      action_name: 'pushed to',
      target_type: null,
      created_at: '2025-04-15T10:00:00.000Z',
      push_data: { commit_count: 1, action: 'pushed', ref_type: 'branch' },
      author: { id: 4242, username: 'alice', name: 'Alice' },
    };
    const [c] = normalize({ event: asRawEvent(event), identity });
    expect(c.source).toBe('gitlab');
    expect(c.rawData).toMatchObject({ eventId: 1234, source: 'gitlab' });
  });
});
