# JWT secret rotation runbook

## Overview

Install tokens are signed with HS256 using a named key (`kid`). Multiple
keys can be active simultaneously so that old tokens continue to verify
while new tokens are signed with the current key. This enables planned,
zero-downtime rotation.

## Env vars

| Variable | Role |
|---|---|
| `WRAP_JWT_KEY_<kid>` | Registers a signing key under the given kid. Any number of these may be present. |
| `WRAP_JWT_ACTIVE_KID` | Which kid signs new tokens. Must match one of the `WRAP_JWT_KEY_*` vars. |
| `WRAP_JWT_SECRET` | **Legacy only.** If present and no `WRAP_JWT_KEY_*` vars exist, treated as `kid=legacy`. Remove after migrating. |

## Routine rotation (planned, no breach)

```
1. Generate a new secret (32+ random bytes, base64-encoded):
     openssl rand -base64 32

2. Add the new key to the Functions app config:
     WRAP_JWT_KEY_<newKid> = <new-secret>
   where <newKid> follows the convention v<year> (e.g. v2026).

3. Deploy. The old kid is still active; the new kid is registered but
   not yet used for signing.

4. Set WRAP_JWT_ACTIVE_KID=<newKid> and deploy again.
   From this point all new tokens are signed with the new kid.

5. Wait for old tokens to drain — up to 365 days (the token TTL), or
   less if you know the oldest active install.

6. Remove WRAP_JWT_KEY_<oldKid> and deploy.
   Tokens signed by the old kid will now be rejected.
```

## Emergency rotation (suspected key compromise)

**Skip step 5.** Remove the leaked key in the same deploy as step 4.

Consequence: installs holding tokens signed by the leaked kid receive a 401
on their next request. The client re-registers via `POST /auth/register` and
receives a fresh token signed by the new active kid. Some in-flight requests
will fail — this is an accepted cost of the emergency response.

> **Note:** The `kid` header is a label, not a secret. An attacker who has
> obtained the leaked key can still forge tokens with that kid until the key
> is removed. Removing the key makes those forgeries useless, but does not
> retroactively invalidate tokens that were already accepted. This runbook
> enables planned rotation; it does not provide cryptographic revocation of
> individual tokens.

## Migrating from WRAP_JWT_SECRET (legacy) to the key map

```
1. Pick a kid, e.g. v2025.
2. Add WRAP_JWT_KEY_v2025=<your-current-secret-value>.
3. Add WRAP_JWT_ACTIVE_KID=v2025.
4. Deploy. Existing tokens (signed with the legacy shim) still verify
   because the shim's Uint8Array matches the same secret value.
5. After all active tokens have renewed (≤ 365 days), remove
   WRAP_JWT_SECRET from config.
```

If you want to also rotate the secret value at the same time, follow the
routine rotation steps above using a new secret value for the new kid.
