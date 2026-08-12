# 001 — Hybrid OAuth client registry

| Field   | Value                                |
| ------- | ------------------------------------ |
| Status  | Draft                                |
| Branch  | `feature/001-hybrid-client-registry` |
| Created | 2026-08-12                           |
| Updated | 2026-08-12                           |

First of three: **001** makes the registry capable of holding runtime clients,
**002** exposes the admin API that writes them, **003** builds the UI.

## 1. Summary

The provider starts resolving OAuth clients from two sources — the immutable
`OAUTH_CLIENTS` config registry first, then rows in D1 — instead of config alone.
No writer exists yet; this spec only opens the read path and the guard rails.

## 2. Problem / Motivation

`OAUTH_CLIENTS` in `wrangler.toml` is the entire registry, enforced by three
deliberate layers: a 404 at the edge ([index.ts:117](../../apps/dev-auth/src/index.ts#L117)),
`clientPrivileges: async () => false` ([auth.config.ts:226](../../apps/dev-auth/src/auth.config.ts#L226)),
and a read-only adapter that throws on any write ([client-registry.ts](../../apps/dev-auth/src/client-registry.ts)).
Safe and reviewable, but every new consumer app costs a TOML edit, a PR and a
deploy — and the two halves (`OAUTH_CLIENTS` / `OAUTH_CLIENT_SECRETS`) drift apart
easily, which is exactly how the imageryx registration silently failed.

The redirect-URI list is the most security-critical value in the provider: whoever
writes it can redirect authorization codes and take over accounts across **every**
app on this SSO. Loosening it is worth doing carefully and in one place.

## 3. Goals & Non-goals

**Goals**

- A client stored in D1 resolves and can complete an authorization.
- Config clients win on `clientId` collision; a D1 row can never shadow one.
- Writes to a config-owned `clientId` still throw, from inside transactions too.
- Redirect-URI validation is one shared implementation, applied to both sources.
- Two clients still cannot claim the same redirect URI, across both sources.

**Non-goals**

- The admin API (002) and the UI (003). Nothing writes D1 clients after this spec —
  rows can only appear via direct SQL, which is intentional for testing it in
  isolation.
- Public dynamic registration (RFC 7591). `/oauth2/register` and friends stay 404
  permanently.
- Any change to `OAUTH_CLIENT_SECRETS`, the GitHub integration, or DevFlare's client.

## 4. Design

### Precedence

`withConfiguredClients` becomes `withHybridClients(database, configClients)`:

- **Reads** (`findOne`, `findMany`, `count`) resolve config first; with no config
  match they fall through to the real D1 adapter.
- **Writes** (`create`, `update`, `delete`, `consumeOne`, `incrementOne`) are allowed
  only when the target `clientId` is unclaimed by config; otherwise they still throw
  `ReadOnlyClientRegistryError`. The `transaction` wrapper keeps decorating, so the
  guard holds inside transactions.

Config remains authoritative, and the bootstrap client (`devflare`) can never be
rewritten by the panel that 003 will host.

The per-isolate registry cache in `auth.config.ts` needs no invalidation: it holds
only _parsed config_, while D1 clients are fetched through the adapter per lookup.

### Shared validation

`redirectUriError` and `validateUriList` move from `oauth-clients.ts` to
`lib/redirect-uri.ts` — same rules (absolute URL, https or loopback http, no
fragment, no credentials, no wildcard host) — so 002 cannot register what config
would have rejected. A D1 row is normalised on read into the same
`RegisteredClient` shape, with `requirePKCE: true`, `grantTypes:
['authorization_code']`, `responseTypes: ['code']` forced regardless of column
contents, and `skipConsent` read from the row rather than hardcoded `true`.

### Files

| File                                    | Change                                       |
| --------------------------------------- | -------------------------------------------- |
| `apps/dev-auth/src/client-registry.ts`  | hybrid precedence; writes fall through to D1 |
| `apps/dev-auth/src/lib/redirect-uri.ts` | new — extracted validators                   |
| `apps/dev-auth/src/oauth-clients.ts`    | import validators from the new module        |
| `apps/dev-auth/src/lib/client-row.ts`   | new — D1 row → `RegisteredClient`            |

### Decisions & trade-offs

- **Config-over-D1, not D1-only.** D1-only is simpler but lets a compromised panel
  rewrite its own login. The bootstrap client staying in git is the whole point.
- **`clientPrivileges` stays `false`.** The plugin's own CRUD endpoints remain dead;
  002 writes through the adapter directly, so the edge 404 keeps its meaning.
- **`skipConsent` per row.** Today's blanket `true` is only safe because every client
  is hand-written, and stops being safe the moment one can be created from a form.

## 5. Constraints

- AGENTS.md hard rule 9: nothing DevFlare-specific enters the provider.
- No schema or migration change — `oauthClient` already exists with the full shape
  (`redirectUris`, `public`, `type`, `requirePKCE`, …) and is currently unused.
- The existing 103 tests must keep passing untouched.

## 6. Test plan

Unit (`src/__tests__/client-registry.spec.ts`, extended):

- a config client wins over a D1 row with the same `clientId`
- an unknown `clientId` falls through to D1 and resolves
- create/update/delete against a config `clientId` throws, inside a transaction too
- a D1 row with a redirect URI config would reject does not resolve
- a D1 row claiming another client's redirect URI does not resolve
- a D1 row cannot turn off `requirePKCE` or widen `grantTypes`

Manual, against a local `pnpm dev:all`:

1. `INSERT` a client row into local D1 by hand, with a secret hashed by
   `hashClientSecret`.
2. `GET /api/auth/oauth2/authorize?client_id=…` reaches `/login` with no redeploy.
3. Complete the code exchange; confirm `aud` is the new client.
4. Confirm `devflare` and `imageryx` still authorize unchanged.

## 7. Tasks

- [ ] 1. Extract validators to `lib/redirect-uri.ts`; keep tests green.
- [ ] 2. `lib/client-row.ts` normaliser + unit tests.
- [ ] 3. Hybrid precedence in `client-registry.ts` + unit tests.
- [ ] 4. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [ ] 5. Manual verification (section 6).
- [ ] 6. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

_Filled during implementation._

## 9. Log / Deviations

- 2026-08-12 — Drafted. Chosen over a full D1-only registry and over a
  config-generating UI. Split out of an earlier single spec that also carried the
  admin API and the UI; it exceeded the ~150-line guideline because it was three
  changes.
