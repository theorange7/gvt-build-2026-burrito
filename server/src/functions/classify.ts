/*
 * PRIVACY: Single-signal classifier. Forwards freeText to the LLM and returns
 * the structured classification. Never persists the input or output. Logs
 * only error codes/messages — never the freeText, never the response signal.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { classifyRequestSchema } from '@wrapped/shared';
import { classify } from '../ai/classify';
import { requireInstallToken, HttpAuthError } from '../auth/middleware';
import { safeError } from '../privacy';

export async function classifyHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await requireInstallToken(request);
    const body = classifyRequestSchema.parse(await request.json());
    const result = await classify({ source: body.source, freeText: body.freeText });
    return { status: 200, jsonBody: result };
  } catch (err) {
    if (err instanceof HttpAuthError) {
      return { status: err.status, jsonBody: { error: err.message } };
    }
    context.error('classify failed', safeError(err));
    return { status: 500, jsonBody: { error: 'classify-failed' } };
  }
}

app.http('classify', {
  route: 'classify',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: classifyHandler,
});
