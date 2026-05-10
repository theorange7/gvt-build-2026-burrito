import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'wrapped-server';
const AUDIENCE = 'wrapped-client';
const TOKEN_TTL_DAYS = 365;

function loadKeys(): { active: string; keys: Record<string, Uint8Array> } {
  const keys: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(process.env)) {
    const m = name.match(/^WRAP_JWT_KEY_(.+)$/);
    if (m && value) keys[m[1]] = new TextEncoder().encode(value);
  }
  // Compatibility shim — to remove next release.
  if (Object.keys(keys).length === 0 && process.env.WRAP_JWT_SECRET) {
    keys['legacy'] = new TextEncoder().encode(process.env.WRAP_JWT_SECRET);
  }
  const active =
    process.env.WRAP_JWT_ACTIVE_KID ??
    (keys['legacy'] ? 'legacy' : Object.keys(keys)[0]);
  if (!active || !keys[active]) {
    throw new Error('No active JWT signing key configured. Set WRAP_JWT_KEY_<kid> and WRAP_JWT_ACTIVE_KID, or WRAP_JWT_SECRET for legacy mode.');
  }
  return { active, keys };
}

export async function signInstallToken(): Promise<{ token: string; expiresAt: number; installId: string }> {
  const { active, keys } = loadKeys();
  const installId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 24 * 60 * 60;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', kid: active })
    .setSubject(installId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(keys[active]);
  return { token, expiresAt, installId };
}

export async function verifyInstallToken(token: string): Promise<{ installId: string }> {
  const { keys } = loadKeys();
  const { payload } = await jwtVerify(
    token,
    async (header) => {
      const kid = header.kid as string | undefined;
      if (!kid) throw new Error('Token missing kid');
      const key = keys[kid];
      if (!key) throw new Error(`Unknown kid: ${kid}`);
      return key;
    },
    { issuer: ISSUER, audience: AUDIENCE },
  );
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token missing subject');
  }
  return { installId: payload.sub };
}
