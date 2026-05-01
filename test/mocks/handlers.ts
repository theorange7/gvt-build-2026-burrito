import { http, HttpResponse } from 'msw';
import { CLASSIFY_RESPONSE, pickResponseFor, SLICE_RESPONSES } from '../fixtures/anthropic';
import demoData from '../../public/demo-contributions.json';

export type AnthropicCall = {
  systemPrompt: string;
  userMessage: string;
  apiKey: string | null;
};

export const anthropicCalls: AnthropicCall[] = [];

type AnthropicRequestBody = {
  system?: string;
  messages?: Array<{ role: string; content: string }>;
};

function classifyResponseText(): string {
  return JSON.stringify(CLASSIFY_RESPONSE);
}

function sliceResponseText(systemPrompt: string): string {
  const isClassifier = systemPrompt.toLowerCase().includes('classifier');
  if (isClassifier) return classifyResponseText();
  const slice = pickResponseFor(systemPrompt);
  return JSON.stringify(slice);
}

export const handlers = [
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = (await request.json()) as AnthropicRequestBody;
    const systemPrompt = body.system ?? '';
    const userMessage = body.messages?.[0]?.content ?? '';
    anthropicCalls.push({
      systemPrompt,
      userMessage,
      apiKey: request.headers.get('x-api-key'),
    });

    return HttpResponse.json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-20250514',
      content: [{ type: 'text', text: sliceResponseText(systemPrompt) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
    });
  }),

  http.get('http://localhost/demo-contributions.json', () =>
    new HttpResponse(JSON.stringify(demoData), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  http.get('http://localhost:3000/demo-contributions.json', () =>
    new HttpResponse(JSON.stringify(demoData), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ),
];

export function clearAnthropicCalls(): void {
  anthropicCalls.length = 0;
}

export { SLICE_RESPONSES };
