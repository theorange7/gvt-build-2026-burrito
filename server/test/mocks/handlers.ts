import { http, HttpResponse } from 'msw';
import { CLASSIFY_RESPONSE, pickResponseFor, SLICE_RESPONSES } from '../fixtures/anthropic';

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

// Claude-on-Foundry deployments answer the Anthropic Messages API at
// {endpoint}/v1/messages. Tests that exercise the azure-foundry-anthropic
// provider point AZURE_FOUNDRY_ANTHROPIC_ENDPOINT at this base URL.
export const FOUNDRY_ANTHROPIC_ENDPOINT =
  'https://test-foundry.services.ai.azure.com/anthropic';

const messagesResolver = async ({ request }: { request: Request }) => {
  const body = (await request.json()) as AnthropicRequestBody;
  const systemPrompt = body.system ?? '';
  const userMessage = body.messages?.[0]?.content ?? '';
  anthropicCalls.push({
    systemPrompt,
    userMessage,
    // Direct Anthropic uses x-api-key; Foundry uses an Entra bearer token.
    apiKey: request.headers.get('x-api-key') ?? request.headers.get('authorization'),
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
};

export const handlers = [
  http.post('https://api.anthropic.com/v1/messages', messagesResolver),
  http.post(`${FOUNDRY_ANTHROPIC_ENDPOINT}/v1/messages`, messagesResolver),
];

export function clearAnthropicCalls(): void {
  anthropicCalls.length = 0;
}

export { SLICE_RESPONSES };
