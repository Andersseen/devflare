# 023 — DevRadar v0.2.0: repository automation + Prompt Inbox

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Status  | Done (verified locally with a fake GitHub; needs owner setup) |
| Branch  | `feature/devradar-automation-foundation`                      |
| Created | 2026-10-14                                                    |
| Updated | 2026-10-14                                                    |

> Authorization note: the owner asked for direct, autonomous implementation, so
> this spec was written and implemented in one pass without an approval stop.

## 1. Summary

DevRadar turns from a passive dashboard into a small workflow tool. A user opts
a followed repository into one automation recipe — _"when this repository's
default branch changes and its CI passes for that exact commit, prepare a
development prompt"_ — and the result lands in a persistent **Prompt Inbox**.
Prompts can also be prepared manually. **No AI model is involved**: the prompt
is a deterministic template filled from a bounded, read-only snapshot of the
repository.

## 2. Problem / Motivation

v0.1.0/0.2-prep monitor GitHub but never act. The owner's recurring manual step
(after a merge to main: gather context, ask an assistant what to build next)
is mechanical. DevRadar already knows when main moved and when CI finished.

## 3. Goals & Non-goals

- **Goals**: opt-in per-user/per-repository rule; durable automation runs bound
  to an exact `repository + branch + SHA`; a _stricter_ CI gate than the
  monitoring one; a bounded context builder; a deterministic prompt builder;
  Prompt Inbox (list/filter/view/copy/read/dismiss); manual preparation with an
  explicit CI bypass; scheduled processor with claiming, retries, expiry.
- **Non-goals**: any model/provider call, notifications, Cloudflare Queues, a
  visual workflow builder, custom actions/HTTP/JS, scheduling DSL, target
  branches other than the default branch, writing to or driving a ChatGPT
  session, changing GitHub App permissions.

### Three things that are NOT the same

|     | What                                                      | v0.2.0                                              |
| --- | --------------------------------------------------------- | --------------------------------------------------- |
| A   | Contextual prompt generation **without a model**          | ✅                                                  |
| B   | AI-generated next-development recommendations             | later                                               |
| C   | Submitting a prompt into an existing ChatGPT conversation | never automated; the optional link only _navigates_ |

## 4. Design

### Lifecycle

```
push to default branch ─webhook─▶ repository.main.updated (normalized event)
        │  AutomationSink (same transaction-less, idempotent publish as the feed)
        ▼
automation_run  status=pending  (rule, repo id, branch, SHA, not_before=now+settle)
        │  older pending runs of the rule ─▶ superseded
        ▼   workflow_run webhook only *wakes* it (next_check_at=now)
cron */5 (+ best-effort waitUntil after webhooks)  processDueRuns(limit 3)
   claim (lease token) ─▶ checks: rule enabled & repo still followed,
                          mirror head == SHA, cooldown, CI gate on D1 runs
   not passing: stays pending with a *reason* (waiting / blocked), re-checked
                until expires_at (48 h) ─▶ expired
   passing: GitHub read (installation token) ─▶ head still == SHA?
            ─▶ bounded context ─▶ deterministic prompt ─▶ development_prompt
            ─▶ run succeeded (+ rule.last_prepared_*)
   transient GitHub error: attempts+1, exponential backoff, max 5 ─▶ failed
```

Stored run statuses: `pending running succeeded superseded expired failed
skipped`. The seven user-facing states (Disabled / Waiting for update / Waiting
for CI / Preparing / Ready / Blocked / Failed / Skipped) are **derived**
(`src/shared/automation.ts › deriveAutomationState`) from rule + latest run +
the run's reason code, never stored.

### CI gate (`evaluateCiGate`, pure)

Deliberately separate from `computeCiState` (monitoring): that one ignores
cancelled/skipped runs and describes "the newest commit that ran anything".

- Input: workflow runs of the **exact SHA**, push-triggered on the target
  branch (PR runs excluded), latest attempt per workflow.
- `all_workflows`: ≥ 1 workflow observed and every observed one `success`.
- `required_workflows`: every configured workflow id has a run for the SHA and
  it is `success`.
- Anything completed but not `success` (failure, cancelled, skipped, neutral,
  stale, action_required, timed_out…) → **blocked** (a rerun can unblock it
  because blocked runs are re-evaluated until expiry).
- Not finished / not started yet → **wait**. A missing required workflow, or no
  run at all, waits for a 10-minute grace and then reads as **blocked**
  (`workflow_missing` / `no_ci`) — never as success.
- The webhook-fed D1 mirror is the source; a run still unresolved after
  10 minutes triggers one bounded GitHub read of that SHA's workflow runs
  (`ci_refreshed_at`) to heal a missed `workflow_run` delivery.
- Limitation (documented): with `all_workflows` a workflow that has not
  started yet is invisible; the settle period mitigates it, **required
  workflows** are the reliable configuration.

### Idempotency & durability

- `UNIQUE (rule_id, sha) WHERE trigger='automatic'` on `automation_run`;
  `UNIQUE (user_id, repository_id, sha) WHERE trigger='automatic'` on
  `development_prompt` → webhook redelivery, replays and processor retries
  cannot duplicate.
- Claiming = `UPDATE … WHERE status='pending' AND next_check_at<=now` followed
  by a read-back of the random `lease_token` (D1 returns no change count).
  Expired leases are recovered by the next tick.
- Prompt written before the run is marked `succeeded`; a crash in between is
  healed by the unique index on retry.
- Reconcile still emits no historical events: the automation sink is attached to
  the **webhook** pipeline only. The processor may read fresh GitHub state to
  finish an already-recorded run, never to create one.
- Retention: finished runs 30 days; 100 prompts per user.

### Manual preparation

`POST /api/v1/automations/:repositoryId/prepare {bypassCi}`: reads the current
head from GitHub, refreshes that SHA's runs, applies the rule's gate (or
`all_workflows` without a rule). Not passing and no bypass → `409 ci_not_passing`
with the reason. `bypassCi:true` is an explicit user action, recorded on the
prompt ("CI bypassed"). One manual run in flight per user+repository (partial
unique index → `409 already_running`). Each call is a new revision, labelled
manual.

### Data model — migration `0002_automation.sql`

`automation_rule` (user, stable repository id, enabled, branch (null = default),
ci_policy, required_workflow_ids, settle_seconds, cooldown_minutes, chatgpt_url,
last triggered/prepared), `automation_run`, `development_prompt` (prompt text +
JSON context snapshot + read/dismissed). `repository_id` is **not** a foreign
key (spec 022 reasoning): rules and history survive a repository leaving and
re-entering the installation.

### API (all `requireAllowedUser`; mutations `assertSameOriginJson` + rate limit)

| Method + path                                    | Purpose                                     |
| ------------------------------------------------ | ------------------------------------------- |
| GET `/api/v1/automations`                        | rules (with derived state) + eligible repos |
| GET/PUT `/api/v1/automations/:repositoryId`      | rule detail + workflows + runs / upsert     |
| POST `/api/v1/automations/:repositoryId/prepare` | manual preparation                          |
| GET `/api/v1/prompts?repositoryId&status`        | inbox list                                  |
| GET/PATCH `/api/v1/prompts/:id`                  | full prompt / unread·read·dismissed         |

### Context & prompt

`lib/automation/context.ts` (bounded: ≤ ~14 read calls; docs ≤ 4 files, 6 000
chars each, files > 256 KB skipped) → `RepositoryContext` JSON.
`lib/automation/prompt.ts` renders sections _Verified facts_, _Inferred_,
_Missing_, _Untrusted excerpts_ (fenced, with a fence longer than any backtick
run inside) and the fixed _Instructions to the assistant_. Repository text is
data: control characters stripped, one-line fields collapsed and truncated.

### Files (summary)

`src/shared/automation.ts`, `src/shared/dto.ts`, `src/server/db/migrations/0002_automation.sql`,
`src/server/lib/store/{automation,prompts}.ts`, `src/server/lib/automation/*`,
`src/server/lib/github/{api,types}.ts` (+6 read calls),
`src/server/routes/api/v1/{automations,prompts}/**`,
`src/server/tasks/radar/automation.ts`, webhook wiring, Angular pages
(`automations`, `prompts`, `prompts/[id]`), repository-detail card.

## 5. Constraints

Read-only GitHub (reads only through `GitHubApi`), no new permissions, SQL only
in `lib/store`, tests with a fake `fetch`, no mock data in app code, English UI.
`GITHUB_API_BASE_URL` (optional, http(s) only) exists solely so E2E can point at
a local fake GitHub; unset in production.

## 6. Test plan

Vitest (store/engine/gate/context/prompt/validation/API-level), Playwright E2E
over a seeded local D1 with a local fake GitHub server. See §8.

## 7. Tasks

- [x] 1. Spec
- [x] 2. Shared types + CI gate + state derivation (+ specs)
- [x] 3. Migration `0002` + stores
- [x] 4. GitHub read additions + fake
- [x] 5. Context builder + prompt builder (+ specs)
- [x] 6. Engine: sink, processor, manual preparation (+ specs)
- [x] 7. Routes, task, cron, webhook wiring
- [x] 8. UI: Automations, Prompt Inbox, prompt detail, repository card
- [x] 9. E2E (fake GitHub server + seeded D1)
- [x] 10. Docs (dev-radar README, root README, ARCHITECTURE, STATE, DEPLOY, specs index)
- [ ] 11. Production verification by the owner (see §8)

## 8. Verification results

Verified locally (2026-10-14), against a **fake GitHub only**:

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (dev-radar: 351
  tests, 72 of them the engine/rules/manual/security spec, 33 prompt/context,
  39 shared gate/state/URL), `pnpm nx build dev-radar` (Worker bundle builds;
  `radar:automation` is registered in the Nitro scheduled-task map next to
  `radar:reconcile`), `wrangler deploy --env production --dry-run` (bundle
  compiles; one new rate-limit binding).
- Playwright `dev-radar-e2e` on chromium, firefox and webkit: the existing suites
  plus `automation.spec.ts` (configure / enable / disable / persist, manual
  preparation, copy, CI-blocked + explicit bypass, no-CI repository, inbox
  filters + dismiss/restore, optional ChatGPT link, signed push → Waiting for CI
  and idempotent redelivery, phone width) and the 401/403 checks of every new
  endpoint and mutation in `access.spec.ts`.

**Not verified (needs the owner / real credentials):**

- Real GitHub: a real push → CI → prompt cycle; the real webhook delivery path
  (the webhook secret entry in the GitHub App was still pending per STATE.md).
- Production D1: apply migration `0002_automation.sql` (and `0001` if pending).
- The new `*/5 * * * *` cron trigger exists in Cloudflare after the next deploy.
- Real rate-limit behaviour of the Workers rate-limit bindings (unit-tested with
  absent/failing bindings only).

## 9. Completion note

Divergences from the first draft: manual preparation checks CI with the rule's
policy (or `all_workflows` without a rule) after refreshing that commit's runs
from GitHub; target branches other than the default are rejected by the API
(column kept for later); rule and prompt-status mutations use a dedicated `AUTOMATION_RATE_LIMITER` binding (namespace 2104) after the shared preferences limiter produced 429s in E2E; the search box on Automations narrows all three lists.
