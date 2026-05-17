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

## Terraform bootstrap state

Terraform provisions the initial key automatically:
- Key Vault secret `wrap-jwt-key-v1` is created from `var.wrap_jwt_secret`.
- `WRAP_JWT_KEY_v1` and `WRAP_JWT_ACTIVE_KID=v1` are injected as app settings.

A deployment provisioned with the current Terraform is **already on the
multi-key scheme** — the legacy shim (`WRAP_JWT_SECRET`) is present as a
verification-only fallback for any tokens issued before the first `terraform
apply`, and can be dropped once those tokens expire.

## Routine rotation (planned, no breach)

Key material lives in Key Vault; rotation goes through Terraform rather than
direct `az` CLI edits to keep infra state consistent.

```
1. Generate a new secret (32+ random bytes, base64-encoded):
     openssl rand -base64 32

2. Add a new Key Vault secret in infra/modules/key_vault/main.tf:
     resource "azurerm_key_vault_secret" "wrap_jwt_key_v2" {
       name         = "wrap-jwt-key-v2"
       value        = var.wrap_jwt_key_v2          # new tfvars variable
       key_vault_id = azurerm_key_vault.main.id
       depends_on   = [azurerm_key_vault_access_policy.deployer]
     }

3. Wire it into the Functions app settings in infra/modules/functions/main.tf:
     "WRAP_JWT_KEY_v2" = "@Microsoft.KeyVault(SecretUri=...wrap-jwt-key-v2/)"

4. Run terraform apply. The old kid (v1) is still active; the new kid (v2) is
   registered but not yet used for signing.

5. Set WRAP_JWT_ACTIVE_KID = "v2" in the app settings and run terraform apply
   again. From this point all new tokens are signed with kid=v2.

6. Wait for old tokens to drain — up to 365 days (the token TTL).

7. Remove WRAP_JWT_KEY_v1 from app settings and the Key Vault secret from
   Terraform, then apply. Tokens signed by v1 will now be rejected.
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

> **Skip this section** if the deployment was first provisioned with the
> current Terraform — `WRAP_JWT_KEY_v1` and `WRAP_JWT_ACTIVE_KID` are already
> set and the migration is done.

For deployments that were set up before the multi-key scheme was introduced:

```
1. Pick a kid, e.g. v1.
2. Add WRAP_JWT_KEY_v1=<your-current-secret-value> to Key Vault and wire it
   into the Functions app settings (follow the Terraform steps above).
3. Set WRAP_JWT_ACTIVE_KID=v1 and apply.
   Existing tokens (signed with the legacy shim) still verify because the
   key bytes are the same.
4. After all active tokens have renewed (≤ 365 days), remove WRAP_JWT_SECRET
   from the app settings and delete the wrap-jwt-secret Key Vault secret.
```

If you also want to rotate the secret value at the same time, use a fresh
secret for the new kid and follow the routine rotation steps.
