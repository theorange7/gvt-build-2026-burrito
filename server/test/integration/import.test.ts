import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { http, HttpResponse } from 'msw';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import { signInstallToken } from '../../src/auth/jwt';
import { importHandler } from '../../src/functions/import';
import { server } from '../mocks/server';
import { anthropicCalls, clearAnthropicCalls } from '../mocks/handlers';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

beforeEach(() => {
  clearAnthropicCalls();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(opts: {
  method?: 'POST';
  body?: FormData;
  token?: string;
}): HttpRequest {
  const headers = new Map<string, string>();
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  return {
    method: opts.method ?? 'POST',
    url: 'http://localhost/api/import',
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    params: {},
    formData: async () => {
      if (!opts.body) throw new Error('no body');
      return opts.body;
    },
  } as unknown as HttpRequest;
}

function makeContext(logs?: unknown[]): InvocationContext {
  return {
    error: (...args: unknown[]) => logs?.push({ level: 'error', args }),
    log: (...args: unknown[]) => logs?.push({ level: 'log', args }),
    info: () => undefined,
    warn: () => undefined,
  } as unknown as InvocationContext;
}

function makeForm(args: {
  fileText?: string;
  fileBytes?: Uint8Array;
  filename?: string;
  meta: unknown;
}): FormData {
  const fd = new FormData();
  // Default filename to .txt so bytes-vs-text tests share the plaintext
  // extractor; per-test overrides can pass `filename` to exercise other
  // extension paths (.docx, unsupported types, etc).
  const filename = (args as { filename?: string }).filename ?? 'upload.txt';
  if (args.fileBytes) {
    fd.append('file', new Blob([args.fileBytes]), filename);
  } else {
    fd.append('file', new Blob([args.fileText ?? ''], { type: 'text/plain' }), filename);
  }
  fd.append('meta', typeof args.meta === 'string' ? args.meta : JSON.stringify(args.meta));
  return fd;
}

const META = { modelId: 'anthropic:claude-sonnet-4', label: 'Q1 commits' };

function mockExtractor(rows: unknown[] | { text: string }): void {
  const text = 'text' in (rows as { text?: string })
    ? (rows as { text: string }).text
    : JSON.stringify({ contributions: rows });
  server.use(
    http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
      // Mirror the default handler's bookkeeping so anthropicCalls stays
      // an accurate cross-test counter.
      const body = (await request.json().catch(() => ({}))) as {
        system?: string;
        messages?: Array<{ role: string; content: string }>;
      };
      anthropicCalls.push({
        systemPrompt: body.system ?? '',
        userMessage: body.messages?.[0]?.content ?? '',
        apiKey: request.headers.get('x-api-key'),
      });
      return HttpResponse.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 50 },
      });
    }),
  );
}

describe('POST /import — auth and basic shape', () => {
  it('returns 401 without a bearer token', async () => {
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'hi', meta: META }) }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing file', async () => {
    const { token } = await signInstallToken();
    const fd = new FormData();
    fd.append('meta', JSON.stringify(META));
    const res = await importHandler(makeRequest({ body: fd, token }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing meta', async () => {
    const { token } = await signInstallToken();
    const fd = new FormData();
    fd.append('file', new Blob(['hello'], { type: 'text/plain' }));
    const res = await importHandler(makeRequest({ body: fd, token }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed meta JSON', async () => {
    const { token } = await signInstallToken();
    const res = await importHandler(
      makeRequest({
        body: makeForm({ fileText: 'hi', meta: '{not json' }),
        token,
      }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /import — size and encoding bounds', () => {
  it('returns 413 when the file exceeds 256 KB', async () => {
    const { token } = await signInstallToken();
    const big = new Uint8Array(256 * 1024 + 1).fill(65);
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileBytes: big, meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(413);
  });

  it('returns 415 when the file is not valid UTF-8', async () => {
    const { token } = await signInstallToken();
    // 0xC3 0x28 is an invalid 2-byte UTF-8 sequence.
    const bad = new Uint8Array([0xc3, 0x28, 0xff, 0xfe]);
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileBytes: bad, meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(415);
  });

  it('returns 400 when the file decodes to empty text', async () => {
    const { token } = await signInstallToken();
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: '   \n  ', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it('returns 415 when the filename has an unsupported extension', async () => {
    const { token } = await signInstallToken();
    const res = await importHandler(
      makeRequest({
        body: makeForm({ fileText: 'log', filename: 'report.pdf', meta: META }),
        token,
      }),
      makeContext(),
    );
    expect(res.status).toBe(415);
    expect(res.jsonBody).toEqual({ error: 'unsupported-file-type' });
  });
});

describe('POST /import — .docx extraction', () => {
  it('extracts plain text from a .docx and feeds it to the model', async () => {
    const { token } = await signInstallToken();
    const docx = new Uint8Array(
      readFileSync(join(__dirname, '..', 'fixtures', 'sample.docx')),
    );

    // Capture what the model receives so we can confirm the docx text
    // (not the raw zip bytes) hit the prompt.
    let receivedUserMessage = '';
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        const body = (await request.json()) as {
          messages?: Array<{ role: string; content: string }>;
        };
        receivedUserMessage = body.messages?.[0]?.content ?? '';
        return HttpResponse.json({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                contributions: [
                  {
                    source: 'github',
                    category: 'delivery',
                    signal: 'Shipped login redesign (PR #42)',
                    occurredAt: '2026-02-01T00:00:00Z',
                    weight: 4,
                    externalId: 'gh:42',
                  },
                ],
              }),
            },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      }),
    );

    const res = await importHandler(
      makeRequest({
        body: makeForm({ fileBytes: docx, filename: 'sample.docx', meta: META }),
        token,
      }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(receivedUserMessage).toContain('Shipped login redesign');
    expect(receivedUserMessage).toContain('Reviewed payments PR');
  });
});

describe('POST /import — extraction and validation', () => {
  it('happy path: returns normalized contributions and rejectedRows=0', async () => {
    const { token } = await signInstallToken();
    mockExtractor([
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
        occurredAt: '2026-02-03T00:00:00Z',
        weight: 2,
        externalId: 'gh:43',
      },
    ]);
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'commits...', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = res.jsonBody as { contributions: unknown[]; rejectedRows: number };
    expect(body.contributions).toHaveLength(2);
    expect(body.rejectedRows).toBe(0);
  });

  it('rejected rows are counted and dropped, not surfaced', async () => {
    const { token } = await signInstallToken();
    mockExtractor([
      {
        source: 'github',
        category: 'delivery',
        signal: 'Real one',
        occurredAt: '2026-02-01T00:00:00Z',
        weight: 4,
      },
      { source: 'github' }, // missing fields
      { not: 'a contribution' }, // garbage
    ]);
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'commits...', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = res.jsonBody as { contributions: unknown[]; rejectedRows: number };
    expect(body.contributions).toHaveLength(1);
    expect(body.rejectedRows).toBe(2);
  });

  it('accepts a bare-array response from the LLM (no wrapper object)', async () => {
    const { token } = await signInstallToken();
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  source: 'gitlab',
                  category: 'delivery',
                  signal: 'Merged !12',
                  occurredAt: '2026-02-05T00:00:00Z',
                  weight: 3,
                },
              ]),
            },
          ],
        }),
      ),
    );
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'log', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as { contributions: unknown[] }).contributions).toHaveLength(1);
  });

  it('returns 502 when the LLM upstream fails', async () => {
    const { token } = await signInstallToken();
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        new HttpResponse('boom', { status: 500 }),
      ),
    );
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'log', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(502);
    // Error body must not include any file content.
    const body = res.jsonBody as { error: string };
    expect(JSON.stringify(body)).not.toMatch(/log/);
  });

  it('returns 502 when the LLM returns unparseable output', async () => {
    const { token } = await signInstallToken();
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({ content: [{ type: 'text', text: 'not json at all' }] }),
      ),
    );
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'log', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(502);
  });
});

describe('POST /import — privacy guarantees', () => {
  it('does not write to any storage primitive — queue modules are not even imported', async () => {
    // If import.ts imported these, instantiating their fakes would matter.
    // We assert the absence via a static read in privacy-invariants.test.ts;
    // here we sanity-check at runtime that no Service Bus / Tables module
    // call happens during a successful import. The simplest signal: the
    // function still works without ANY Azure env var set.
    delete process.env.AZURE_TABLES_ENDPOINT;
    delete process.env.AZURE_SERVICE_BUS_NAMESPACE;

    const { token } = await signInstallToken();
    mockExtractor([
      {
        source: 'manual',
        category: 'other',
        signal: 'A note',
        occurredAt: '2026-02-01T00:00:00Z',
        weight: 2,
      },
    ]);
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'notes', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
  });

  it('does not log file body, label, or per-row signals (canary spy)', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctxLogs: unknown[] = [];

    const fileCanary = 'CANARY-FILE-aZ91';
    const labelCanary = 'CANARY-LABEL-7q4r';
    const signalCanary = 'CANARY-SIGNAL-mm00';

    const { token } = await signInstallToken();
    mockExtractor([
      {
        source: 'manual',
        category: 'other',
        signal: signalCanary,
        occurredAt: '2026-02-01T00:00:00Z',
        weight: 2,
      },
    ]);
    await importHandler(
      makeRequest({
        body: makeForm({
          fileText: `header\n${fileCanary}\nfooter`,
          meta: { ...META, label: labelCanary },
        }),
        token,
      }),
      makeContext(ctxLogs),
    );

    const allText = [
      ...consoleLog.mock.calls.flat(),
      ...consoleInfo.mock.calls.flat(),
      ...consoleError.mock.calls.flat(),
      ...ctxLogs,
    ]
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

    expect(allText).not.toContain(fileCanary);
    expect(allText).not.toContain(labelCanary);
    expect(allText).not.toContain(signalCanary);
  });

  it('makes exactly one upstream LLM call per request (no replay, no second hop)', async () => {
    const { token } = await signInstallToken();
    mockExtractor([
      {
        source: 'manual',
        category: 'delivery',
        signal: 'one',
        occurredAt: '2026-02-01T00:00:00Z',
        weight: 3,
      },
    ]);
    const res = await importHandler(
      makeRequest({ body: makeForm({ fileText: 'data', meta: META }), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(anthropicCalls).toHaveLength(1);
  });
});
