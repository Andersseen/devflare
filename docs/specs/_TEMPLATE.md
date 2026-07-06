# NNN — <Title>

| Field   | Value                                                 |
| ------- | ----------------------------------------------------- |
| Status  | Draft \| Approved \| In progress \| Done \| Abandoned |
| Branch  | `feature/NNN-short-slug`                              |
| Created | YYYY-MM-DD                                            |
| Updated | YYYY-MM-DD                                            |

## 1. Summary

One or two sentences: what will exist after this that doesn't exist now.

## 2. Problem / Motivation

Why do this at all? What breaks or is missing today? Link to CONTEXT.md
principles if relevant.

## 3. Goals & Non-goals

- **Goals**: bullet list, each verifiable.
- **Non-goals**: what this spec deliberately does NOT cover (scope fence).

## 4. Design

How it works. Include, as applicable:

- **User flow**: what the user sees/does, step by step.
- **Files to create/modify** (be exact — this is the map weaker models follow):
  | File | Change |
  | ---- | ------ |
  | `apps/devflare/src/app/pages/tools/x.page.ts` | new page component |
  | `libs/shared/core/src/lib/services/tools/x.service.ts` | new service + export from index.ts |
- **API changes**: method, path, request/response shape, auth requirement.
- **DB changes**: table/columns + where the schema lives (app: `initDatabase()`;
  auth: new migration file).
- **Decisions & trade-offs**: alternatives considered, why this way.

## 5. Constraints

Repo rules that apply (from docs/ai/CONVENTIONS.md) plus anything
feature-specific: client-side only? no new deps? bundle-size sensitive?

## 6. Test plan

What proves it works: unit tests to add (which file), manual verification steps
(exact URLs / curl commands), e2e if warranted.

## 7. Tasks

Small, ordered, independently committable. Check off as you go.

- [ ] 1. …
- [ ] 2. …
- [ ] 3. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`)
- [ ] 4. Manual verification (section 6)
- [ ] 5. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`

## 8. Verification results

Filled during/after implementation: what was run, what was observed. Paste the
actual evidence (test output summary, curl responses), not "it works".

## 9. Log / Deviations

Dated notes: decisions made mid-flight, spec changes, open questions for the owner.
