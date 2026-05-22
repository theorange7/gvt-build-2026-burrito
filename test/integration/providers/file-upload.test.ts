// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { hasProvider, registerProvider } from '@/lib/providers/registry';
import { fileUploadProvider } from '@/lib/providers/file-upload';
import {
  connectFileUploadIdentity,
  disconnectIdentity,
  ImportCancelledError,
  importIntoIdentity,
  type ReviewableContribution,
} from '@/lib/providers/orchestrator';
import { listContributions } from '@/lib/local-store/contributions';
import { listIdentities } from '@/lib/local-store/identities';
import { loadTestKey } from '../../setup/key';

const BACKEND = 'http://test-backend';

beforeEach(async () => {
  await loadTestKey();
  process.env.NEXT_PUBLIC_WRAP_API_URL = BACKEND;
  if (!hasProvider('file-upload')) {
    registerProvider(fileUploadProvider);
  }
  // Pre-seed an install token so getOrRegisterInstallToken doesn't try to
  // hit /auth/register.
  const { db, META_KEYS } = await import('@/lib/local-store/db');
  await db().meta.put({
    key: META_KEYS.wrapInstallToken,
    value: { token: 'test-install-token', expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  });
});

afterEach(() => {
  server.resetHandlers();
});

function mockImport(args: { rows: unknown[]; rejectedRows?: number }) {
  let callCount = 0;
  const calls: { authorization: string | null }[] = [];
  server.use(
    http.post(`${BACKEND}/import`, async ({ request }) => {
      callCount += 1;
      calls.push({ authorization: request.headers.get('authorization') });
      return HttpResponse.json({
        contributions: args.rows,
        rejectedRows: args.rejectedRows ?? 0,
      });
    }),
  );
  return {
    get callCount() {
      return callCount;
    },
    calls,
  };
}

function makeFile(content: string, name = 'commits.txt'): File {
  return new File([content], name, { type: 'text/plain' });
}

const SAMPLE_ROWS = [
  {
    source: 'github',
    category: 'delivery',
    signal: 'Shipped login redesign',
    rawData: { pr: 42 },
    occurredAt: '2026-02-01T00:00:00Z',
    weight: 4,
    externalId: 'gh:42',
  },
  {
    source: 'github',
    category: 'collaboration',
    signal: 'Reviewed payments PR',
    rawData: {},
    occurredAt: '2026-02-03T00:00:00Z',
    weight: 2,
    externalId: 'gh:43',
  },
  {
    source: 'manual',
    category: 'delivery',
    signal: 'Wrote runbook for incident-response',
    rawData: {},
    occurredAt: '2026-02-05T00:00:00Z',
    weight: 3,
    externalId: 'rb:001',
  },
];

describe('file-upload provider — connect + import round-trip', () => {
  it('connects an identity from a label and stores no tokens', async () => {
    const result = await connectFileUploadIdentity({ label: 'Q1 commits' });
    expect(result.identityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.isNew).toBe(true);

    const identities = await listIdentities();
    expect(identities).toHaveLength(1);
    expect(identities[0].providerId).toBe('file-upload');
    expect(identities[0].externalUserId).toBe('q1-commits');
    expect(identities[0].displayName).toBe('Q1 commits');
  });

  it('re-connecting under the same label is idempotent', async () => {
    const a = await connectFileUploadIdentity({ label: 'Q1 commits' });
    const b = await connectFileUploadIdentity({ label: 'Q1 commits' });
    expect(a.identityId).toBe(b.identityId);
    expect(b.isNew).toBe(false);
    expect(await listIdentities()).toHaveLength(1);
  });

  it('imports rows and persists them through the encrypted store', async () => {
    const mock = mockImport({ rows: SAMPLE_ROWS });
    const { identityId } = await connectFileUploadIdentity({ label: 'Q1 commits' });

    const result = await importIntoIdentity(identityId, makeFile('hello'), {
      modelId: 'anthropic:claude-sonnet-4',
    });

    expect(result).toEqual({ added: 3, skippedExisting: 0, rejectedRows: 0 });
    expect(mock.callCount).toBe(1);
    expect(mock.calls[0].authorization).toBe('Bearer test-install-token');

    const all = await listContributions();
    expect(all).toHaveLength(3);
    for (const c of all) {
      expect(c.identityId).toBe(identityId);
    }
  });

  it('importing twice with the same mocked LLM response yields { added: 3, skippedExisting: 3 }', async () => {
    mockImport({ rows: SAMPLE_ROWS });
    const { identityId } = await connectFileUploadIdentity({ label: 'Q1 commits' });

    const first = await importIntoIdentity(identityId, makeFile('hello'), {
      modelId: 'anthropic:claude-sonnet-4',
    });
    expect(first).toEqual({ added: 3, skippedExisting: 0, rejectedRows: 0 });

    const second = await importIntoIdentity(identityId, makeFile('hello'), {
      modelId: 'anthropic:claude-sonnet-4',
    });
    expect(second).toEqual({ added: 0, skippedExisting: 3, rejectedRows: 0 });

    const all = await listContributions();
    expect(all).toHaveLength(3);
  });

  it('passes through rejectedRows count from the server', async () => {
    mockImport({ rows: SAMPLE_ROWS, rejectedRows: 2 });
    const { identityId } = await connectFileUploadIdentity({ label: 'mixed file' });
    const result = await importIntoIdentity(identityId, makeFile('hello'), {
      modelId: 'anthropic:claude-sonnet-4',
    });
    expect(result.rejectedRows).toBe(2);
  });

  it('disconnect removes only the file-upload identity and its contributions', async () => {
    mockImport({ rows: SAMPLE_ROWS });
    const fu = await connectFileUploadIdentity({ label: 'work laptop' });
    await importIntoIdentity(fu.identityId, makeFile('hello'), {
      modelId: 'anthropic:claude-sonnet-4',
    });

    await disconnectIdentity(fu.identityId, { deleteContributions: true });

    expect(await listIdentities()).toHaveLength(0);
    expect(await listContributions()).toHaveLength(0);
  });

  it('with a review hook: passes extracted rows through and persists what the hook returns', async () => {
    mockImport({ rows: SAMPLE_ROWS });
    const { identityId } = await connectFileUploadIdentity({ label: 'reviewed' });
    let received: ReviewableContribution[] | null = null;
    const result = await importIntoIdentity(identityId, makeFile('hi'), {
      modelId: 'anthropic:claude-sonnet-4',
      review: async (rows) => {
        received = rows;
        // Drop the third row entirely and rewrite the first row's signal —
        // proving the hook can shape what lands in the store.
        return [
          { ...rows[0], signal: 'edited shipped login redesign' },
          rows[1],
        ];
      },
    });
    expect(result.added).toBe(2);
    expect(received).not.toBeNull();
    const persisted = await listContributions();
    expect(persisted).toHaveLength(2);
    const signals = persisted.map((c) => c.signal).sort();
    expect(signals).toContain('edited shipped login redesign');
    expect(signals).toContain('Reviewed payments PR');
  });

  it('with a review hook returning null: throws ImportCancelledError and persists nothing', async () => {
    mockImport({ rows: SAMPLE_ROWS });
    const { identityId } = await connectFileUploadIdentity({ label: 'aborted' });
    await expect(
      importIntoIdentity(identityId, makeFile('hi'), {
        modelId: 'anthropic:claude-sonnet-4',
        review: async () => null,
      }),
    ).rejects.toBeInstanceOf(ImportCancelledError);
    expect(await listContributions()).toHaveLength(0);
  });

  it('with a review hook: auto-dates rows with an invalid occurredAt to today and flags them', async () => {
    mockImport({
      rows: [
        {
          source: 'manual',
          category: 'delivery',
          signal: 'Shipped X',
          rawData: {},
          occurredAt: 'definitely-not-a-date',
          weight: 4,
        },
        {
          source: 'manual',
          category: 'delivery',
          signal: 'Shipped Y',
          rawData: {},
          occurredAt: '2026-02-01T00:00:00Z',
          weight: 4,
        },
      ],
    });
    const { identityId } = await connectFileUploadIdentity({ label: 'autodate' });
    let observed: ReviewableContribution[] = [];
    await importIntoIdentity(identityId, makeFile('hi'), {
      modelId: 'anthropic:claude-sonnet-4',
      review: async (rows) => {
        observed = rows;
        return rows;
      },
    });
    expect(observed).toHaveLength(2);
    const bad = observed.find((r) => r.signal === 'Shipped X')!;
    const good = observed.find((r) => r.signal === 'Shipped Y')!;
    expect(bad.autoDated).toBe(true);
    expect(Number.isNaN(bad.occurredAt.getTime())).toBe(false);
    expect(good.autoDated).toBe(false);
    expect(good.occurredAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('makes zero calls to /classify or /wrap during import', async () => {
    let classifyCalls = 0;
    let wrapCalls = 0;
    server.use(
      http.post(`${BACKEND}/classify`, () => {
        classifyCalls += 1;
        return HttpResponse.json({ signal: 'x', category: 'other', weight: 2 });
      }),
      http.post(`${BACKEND}/wrap`, () => {
        wrapCalls += 1;
        return HttpResponse.json({ jobId: 'x', status: 'queued' });
      }),
    );
    mockImport({ rows: SAMPLE_ROWS });
    const { identityId } = await connectFileUploadIdentity({ label: 'no extra hops' });
    await importIntoIdentity(identityId, makeFile('hi'), {
      modelId: 'anthropic:claude-sonnet-4',
    });
    expect(classifyCalls).toBe(0);
    expect(wrapCalls).toBe(0);
  });
});
