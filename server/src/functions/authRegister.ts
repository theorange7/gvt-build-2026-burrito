/*
 * PRIVACY: Issues a per-install JWT. Logs only the decision (rate-limited or
 * issued) and never logs the signed token. The body is empty and is never
 * read.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { signInstallToken } from '../auth/jwt';
import { checkIpRateLimit } from '../auth/rateLimit';
import { registerRateLimitPerHour } from '../queue/concurrency';
import { safeError } from '../privacy';

function clientIp(request: HttpRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-azure-clientip') ??
    'unknown'
  );
}

export async function authRegister(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const ip = clientIp(request);
  const limit = checkIpRateLimit(ip, registerRateLimitPerHour());
  if (!limit.ok) {
    return {
      status: 429,
      jsonBody: { error: 'rate-limited', resetAt: limit.resetAt },
    };
  }

  try {
    const { token, expiresAt } = await signInstallToken();
    return { status: 200, jsonBody: { token, expiresAt } };
  } catch (err) {
    context.error('authRegister failed', safeError(err));
    return { status: 500, jsonBody: { error: 'register-failed' } };
  }
}

app.http('authRegister', {
  route: 'auth/register',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: authRegister,
});
