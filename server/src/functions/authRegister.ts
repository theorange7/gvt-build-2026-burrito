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

export function validateInviteCode(code: string): boolean {
  const raw = process.env.INVITE_CODES;
  if (!raw) return true; // no gate configured — open access
  const allowed = raw.split(',').map((c) => c.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(code.trim());
}

export async function authRegister(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Invite code gate — only enforced when INVITE_CODES env var is set.
  const rawInviteCodes = process.env.INVITE_CODES;
  if (rawInviteCodes) {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore parse errors — missing body means missing code
    }
    const code = typeof body.inviteCode === 'string' ? body.inviteCode : '';
    if (!validateInviteCode(code)) {
      return { status: 403, jsonBody: { error: 'invalid-invite-code' } };
    }
  }

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
