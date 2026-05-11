/*
 * PRIVACY: Health check endpoint. Returns static status only. No auth required.
 * No request data, no tokens, and no IP addresses are logged or returned.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

export async function healthHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return { status: 200, jsonBody: { status: 'ok' } };
}

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: healthHandler,
});
