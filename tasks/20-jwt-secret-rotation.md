# Spec 20 — JWT secret rotation (`kid` + key map)

**Status**: Done
**Branch**: server
**Appetite**: medium (≤ 3 days; realistically ~1 day plus runbook)
**Last shaped**: 2026-05-09

## Problem

`server/src/auth/jwt.ts` signs every install JWT with a single
`WRAP_JWT_SECRET` and sets a 365-day expiry. `verifyInstallToken` verifies
with the same single secret. There is no way to introduce a new secret
without simultaneously invalidating every token signed by the old one.

Three real scenarios where this hurts:

1. **Routine hygiene.** Yearly secret rotation (the way you rotate any
   long-lived credential) requires a hard cutover that 401s every active
   install. Today, "rotate" is a deployment event, not a routine task —
   which means in practice it doesn't happen, and the secret just ages.
2. **Suspected leak.** You think the secret may have leaked. You want to
   make forgeries useless without telling every user their session has
   disintegrated. Today: pick one.
3. **Multi-key signing.** Running staging and prod with different secrets,
   but allowing tokens issued by one to verify on the other for testing,
   is impossible.

## Solution shape

Use the JWT spec's `kid` ("key ID") header to label which key signed each
token. Maintain multiple secrets in env, registered under their kid in a
key map. The verifier looks up the kid on the incoming token and uses the
matching key.

### Env shape

```
WRAP_JWT_KEY_v2024 = "<old secret>"
WRAP_JWT_KEY_v2025 = "<new secret>"
WRAP_JWT_ACTIVE_KID = "v2025"
```

`WRAP_JWT_KEY_*` env vars enumerate all currently-valid signing keys.
`WRAP_JWT_ACTIVE_KID` selects which one signs new tokens. Naming convention:
`v<year>` is fine for routine rotation; `<env>-<year>` if multi-environment
parity is needed.

For backwards compatibility during the rollout: if `WRAP_JWT_SECRET` is set
and no `WRAP_JWT_KEY_*` vars exist, treat that as a single key with
`kid='legacy'` and accept it for verification. This is a one-release
compatibility shim — drop it in the next release after this lands.

### Code shape

`server/src/auth/jwt.ts`:

```ts
function loadKeys(): { active: string; keys: Record<string, Uint8Array> } {
  const keys: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(process.env)) {
    const m = name.match(/^WRAP_JWT_KEY_(.+)$/);
    if (m && value) keys[m[1]] = new TextEncoder().encode(value);
  }
  // Compatibility shim — to remove next release.
  if (Object.keys(keys).length === 0 && process.env.WRAP_JWT_SECRET) {
    keys.legacy = new TextEncoder().encode(process.env.WRAP_JWT_SECRET);
  }
  const active = process.env.WRAP_JWT_ACTIVE_KID
    ?? (keys.legacy ? 'legacy' : Object.keys(keys)[0]);
  if (!active || !keys[active]) {
    throw new Error('No active JWT signing key configured');
  }
  return { active, keys };
}

export async function signInstallToken() {
  const { active, keys } = loadKeys();
  const installId = crypto.randomUUID();
  const expiresAt = ...;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', kid: active })
    .setSubject(installId)
    .setIssuer(ISSUER).setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(keys[active]);
  return { token, expiresAt, installId };
}

export async function verifyInstallToken(token: string) {
  const { keys } = loadKeys();
  const { payload } = await jwtVerify(token, async (header) => {
    const kid = header.kid as string | undefined;
    if (!kid) throw new Error('Token missing kid');
    const key = keys[kid];
    if (!key) throw new Error('Unknown kid');
    return key;
  }, { issuer: ISSUER, audience: AUDIENCE });
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Token missing subject');
  }
  return { installId: payload.sub };
}
```

`jose`'s `jwtVerify` takes a key resolver function as the second arg —
that's the canonical way to do kid-keyed verification with shared
secrets.

### Rotation runbook (drop into `tasks/runbooks/jwt-rotation.md`)

```
1. Generate new secret (32+ random bytes, base64).
2. Add WRAP_JWT_KEY_<newKid>=<value> to the Functions app config.
3. Deploy. Old kid still valid; new kid is registered but not active yet.
4. Set WRAP_JWT_ACTIVE_KID=<newKid>. Deploy.
5. Wait for old tokens to drain (up to 365 days, or longer if installs
   are long-lived).
6. Remove WRAP_JWT_KEY_<oldKid>. Deploy.

For emergency rotation (suspected compromise of <oldKid>):
- Skip step 5; remove the leaked key in step 4's deploy.
- Users with tokens signed by the leaked kid will get 401 on next call.
- The client retries via /auth/register and gets a new token signed by
  the active kid. Some inflight requests will fail — accepted cost.
```

## Rabbit holes

- **The `kid` is a label, not a secret**. An attacker who has the leaked
  key can sign their own `kid: <leaked-kid>` tokens at will. This spec
  enables planned rotation; it does not enable revocation of compromised
  tokens. Don't write copy that suggests otherwise.
- **Don't add a deny-list / revocation list**. That's a separate, much
  bigger project (requires persistence, replication, propagation latency
  thinking, an admin surface). It is **out of scope** here.
- **Don't drop `WRAP_JWT_SECRET` on day one**. Leave the compatibility
  shim for one release so deployments don't have to atomically reconfigure
  env. Drop it in the spec immediately after this one.
- **Don't try to support "multiple active kids" simultaneously** (e.g.
  random-pick a kid for each new token to spread load). That's
  cryptographically pointless and creates debugging nightmares.

## No-gos

- JWKS endpoint / asymmetric keys (RS256 / ES256). HS256 is fine for this
  workload — there's only one verifier, one signer, both are us.
- Token refresh / shorter TTLs as a substitute for revocation. Conceptually
  related but a much bigger spec.
- Persisted denylist of revoked tokens.
- Rotating the install token's `installId` (the JWT `sub`). That would
  invalidate the user's wrap-row partition keys — different problem,
  different scope.

## Verification

- **Unit test**: register two kids in env; sign with the active one; verify
  with both. Expect tokens signed with non-active kid to verify if their
  kid is registered, and to fail if not.
- **Unit test**: token with no `kid` header → verify rejects.
- **Unit test**: token with unknown `kid` → verify rejects.
- **Unit test**: missing `WRAP_JWT_ACTIVE_KID` and no `WRAP_JWT_SECRET` →
  `loadKeys()` throws clearly.
- **Backwards-compat test**: `WRAP_JWT_SECRET` set with no `WRAP_JWT_KEY_*`
  → tokens sign and verify under `kid='legacy'`.
- **Integration test**: rotate scenario — sign a token with kidA, change
  active to kidB, verify the kidA token still works (until kidA is
  removed); sign a new token, verify it verifies as kidB.

## Notes

- `server/src/auth/jwt.ts` is the only file that needs structural change.
- `server/src/auth/middleware.ts` doesn't need touching — it already calls
  `verifyInstallToken` and consumes the result.
- The runbook should live in `tasks/runbooks/jwt-rotation.md` (create that
  directory as part of this work) so it's findable by future operators.
- This spec is **independent** of specs 10–13 — different layer, different
  branch. Land in any order.
- After this lands, follow-up spec idea (not yet written): shorter token
  TTLs (e.g. 30 days) with a refresh endpoint. That makes the rotation
  drain-window much shorter and brings revocation closer to the table.

## Done

**Completed**: 2026-05-10
**PR**: claude/spec-20-9mk1y
**Summary**: Implemented `loadKeys()` which reads all `WRAP_JWT_KEY_<kid>` env vars into a key map and selects the active signer via `WRAP_JWT_ACTIVE_KID`. `signInstallToken` now stamps each token with `kid` in the protected header. `verifyInstallToken` passes a resolver function to `jwtVerify` that looks up the incoming `kid` in the map, rejecting tokens with missing or unregistered kids. The backwards-compat shim for `WRAP_JWT_SECRET` (mapped to `kid=legacy`) is in place. Unit tests cover all six verification scenarios from the spec. The rotation runbook was added to `tasks/runbooks/jwt-rotation.md`. No deviations from the solution shape.
