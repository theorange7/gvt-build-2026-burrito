import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'wrapped-server';
const AUDIENCE = 'wrapped-client';
const TOKEN_TTL_DAYS = 365;

function getSecret(): Uint8Array {
  const raw = process.env.WRAP_JWT_SECRET;
  if (!raw) {
    throw new Error('WRAP_JWT_SECRET is not set. Configure it in the Functions app settings.');
  }
  return new TextEncoder().encode(raw);
}

export async function signInstallToken(): Promise<{ token: string; expiresAt: number; installId: string }> {
  const installId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 24 * 60 * 60;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(installId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(getSecret());
  return { token, expiresAt, installId };
}

export async function verifyInstallToken(token: string): Promise<{ installId: string }> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER, audience: AUDIENCE });
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token missing subject');
  }
  return { installId: payload.sub };
}
