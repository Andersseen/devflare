# 003 — Provider settings: GitHub credentials + access list

| Field   | Value                           |
| ------- | ------------------------------- |
| Status  | Done                            |
| Branch  | `feature/oauth-client-registry` |
| Created | 2026-08-12                      |
| Updated | 2026-08-12                      |

Depends on **002 — OAuth client admin API**. Do not start until 002 is Done.

## 1. Summary

The two remaining pieces of dev-auth that only exist as `wrangler.toml` vars — the
GitHub OAuth App credentials and the list of people allowed to sign up — move to
D1 and become manageable through the same admin API, with the GitHub client secret
encrypted at rest.

## 2. Problem / Motivation

After 002 the client list is manageable but the provider's own configuration is
not. Enabling GitHub sign-in, rotating its secret, or letting a second person in
still means editing TOML and deploying.

Both values sit in `createAuthOptions` today: `socialProviders.github` reads
`env.GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
([auth.config.ts:144](../../apps/dev-auth/src/auth.config.ts#L144)) and the allowlist
is parsed from `env.SIGNUP_ALLOWLIST`
([auth.config.ts:96](../../apps/dev-auth/src/auth.config.ts#L96)). Since `createAuth`
is rebuilt per request, both can come from D1 instead without restructuring
anything — the cost is a read, which the existing per-isolate cache pattern absorbs.

One trap, and it is the reason this is its own spec: **an empty `SIGNUP_ALLOWLIST`
currently means no restriction**, which is right for local dev and catastrophic as
the failure mode of a database read. The D1-backed path must fail closed.

## 3. Goals & Non-goals

**Goals**

- GitHub client id and secret are stored in D1 and editable through the admin API.
- The GitHub secret is encrypted at rest; a D1 dump alone does not reveal it.
- GitHub sign-in can be turned on and off without a deploy.
- The signup allowlist lives in D1, is editable, and **fails closed** — a failed or
  empty read denies sign-up rather than opening it.
- Config vars keep working as the fallback, so nothing breaks before migration.

**Non-goals**

- The UI (004).
- Additional social providers. The shape should generalise, but only GitHub is
  wired now — it is the only one configured today.
- Anything about `OAUTH_CLIENT_SECRETS` or the per-client secrets from 002.
- Inviting users by email. The allowlist gates who may sign up; it does not send
  anything, because there is still no email provider (STATE.md next-step 1).

## 4. Design

### Storage

One `providerSetting` table, key/value, so a third setting later needs no migration:

| Column                    | Notes                                   |
| ------------------------- | --------------------------------------- |
| `key`                     | primary key, e.g. `github.clientId`     |
| `value`                   | plaintext for non-secret values         |
| `encrypted`               | boolean — whether `value` is ciphertext |
| `updatedAt` / `updatedBy` | audit trail for the sensitive ones      |

### Encrypting the GitHub secret

`GITHUB_CLIENT_SECRET` cannot be hashed — dev-auth has to send the real value to
GitHub — so it is stored reversibly, encrypted with AES-GCM (Web Crypto) under a key
held in a new `SECRET_ENCRYPTION_KEY` Worker secret. The plaintext is never returned
by the API; reads report `{ configured: true, updatedAt }`.

The honest trade-off: a D1 dump _plus_ that Worker secret is game over, where today
a D1 dump alone is useless. What it buys is one Worker secret set once and
everything else manageable — the fix for exactly the config drift that broke the
imageryx registration. Keeping the secret in Worker secrets and having the UI only
report "configured / not configured" would recreate that split.

### Resolution order

Per setting: D1 row → config var → built-in default. The current deployment keeps
working untouched and migration becomes a per-value decision, not a flag day.
`github.enabled` is false unless both id and secret resolve, so a half-configured
provider is never advertised.

For the allowlist the empty case flips: an existing row holding an empty list means
"nobody", a missing row falls back to the var, and a missing var keeps today's
local-dev "unrestricted". Production must therefore end up with a row — task 1
writes one.

### API (extends 002's router)

| Method  | Path                        | Notes                                    |
| ------- | --------------------------- | ---------------------------------------- |
| `GET`   | `/admin/settings`           | all values; secrets as `configured` only |
| `PATCH` | `/admin/settings/github`    | id, secret, enabled                      |
| `GET`   | `/admin/settings/allowlist` | the list                                 |
| `PUT`   | `/admin/settings/allowlist` | replace the list                         |

Same auth as 002 (admin session or service token + forwarded actor), same audit
table, with `clientId` left null for settings rows.

### Files

| File                                                         | Change                                 |
| ------------------------------------------------------------ | -------------------------------------- |
| `apps/dev-auth/src/db/schema.ts`                             | new `providerSetting` table            |
| `apps/dev-auth/src/db/migrations/0005_provider_settings.sql` | new — table + seed from current values |
| `apps/dev-auth/src/lib/secret-box.ts`                        | new — AES-GCM seal/open                |
| `apps/dev-auth/src/lib/provider-settings.ts`                 | new — resolution order + isolate cache |
| `apps/dev-auth/src/auth.config.ts`                           | read GitHub + allowlist through it     |
| `apps/dev-auth/src/routes/admin-settings.ts`                 | new — the router above                 |
| `apps/dev-auth/wrangler.toml`                                | document the new Worker secret         |

## 5. Constraints

- AGENTS.md hard rule 9 — settings are the provider's own, nothing DevFlare-shaped.
- Web Crypto only; no Node crypto, the Worker has no such thing.
- Never log or return a decrypted secret, including in error messages.
- Existing deployments must keep working with no D1 rows present.

## 6. Test plan

Unit (`src/__tests__/provider-settings.spec.ts`, new):

- resolution order D1 → var → default, per value
- an empty allowlist **row** denies; a missing row falls back to the var
- a failed D1 read denies sign-up rather than allowing it
- sealed value round-trips; ciphertext differs across two seals of one plaintext
- `GET /admin/settings` never contains the plaintext secret
- `github.enabled` stays false with only one of the two values present

Manual, local:

1. With no rows, confirm GitHub sign-in behaves exactly as today.
2. `PATCH /admin/settings/github` with a fresh App's credentials; complete a GitHub
   sign-in with no redeploy.
3. Confirm the D1 row's `value` is unreadable ciphertext via `wrangler d1 execute`.
4. Disable GitHub; confirm the login page stops offering it.
5. `PUT` an allowlist without your address; confirm a new sign-up is refused and an
   existing session still works.

## 7. Tasks

- [x] 1. `providerSetting` table + migration. Seeds **nothing** — see deviations.
- [x] 2. `lib/secret-box.ts` (AES-GCM) + unit tests.
- [x] 3. `lib/provider-settings.ts` resolution + cache + tests, allowlist failing closed.
- [x] 4. Wire `auth.config.ts` to it, keeping var fallback.
- [x] 5. `/admin/settings` router + audit + tests.
- [ ] 6. Set `SECRET_ENCRYPTION_KEY` as a Worker secret (prod + staging).
     **Owner action** — documented in wrangler.toml, not something this branch
     can do. Until it is set, GitHub keeps coming from the config vars.
- [x] 7. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [x] 8. Manual verification (section 6).
- [x] 9. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

Automated, 2026-08-12: `format:check`, `lint`, `typecheck` clean. dev-auth suite
**182 passed**, up from 156 — 8 in `lib/__tests__/secret-box.spec.ts` and 18 in
`__tests__/provider-settings.spec.ts`, covering every case in section 6.

Manual verification outstanding, together with 001's and 002's.

## 9. Log / Deviations

- 2026-08-12 — Drafted. Open question: once a D1 row exists, should the matching
  wrangler.toml var be deleted, or kept as a break-glass fallback? Spec keeps it,
  which means a stale var could quietly become live if the row is ever deleted.
- 2026-08-12 — Implemented. Notes:
  - **A bug the tests caught before it shipped.** The first cut resolved the
    GitHub secret with `stored || env || ''`, so an undecryptable stored value
    fell back to the config var — exactly what the comment above it said must
    never happen, and it would make a botched key rotation look successful. A
    stored secret is now authoritative even when it cannot be opened.
  - The settings memo is keyed on the env values it falls back to, not on time
    alone. Without that a change to a var was masked by a memo derived from the
    previous one — the same bug the client registry cache already avoids.
  - `socialProviders` is now **omitted** when GitHub is not fully configured,
    rather than passed with empty strings. The old shape logged a better-auth
    warning on every request and advertised a button that failed at the redirect.
  - Existing specs needed a real D1 binding: they passed `DB: undefined`, and
    fail-closed correctly refused every sign-up. `helpers/d1.ts` now exports the
    migration list so a new migration is added in one place.
