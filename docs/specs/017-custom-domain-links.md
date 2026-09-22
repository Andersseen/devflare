# 017 — Prefer and expose custom deployment domains

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | Done                              |
| Branch  | `feature/017-custom-domain-links` |
| Created | 2026-09-22                        |
| Updated | 2026-09-22                        |

## 1. Summary

The deployment dashboard will prefer a project's custom hostname over its
Cloudflare `pages.dev` fallback, and a project detail page will expose every
public hostname returned by Cloudflare as an outbound link.

## 2. Problem / Motivation

Cloudflare's Pages API returns `domains` with the default `*.pages.dev`
hostname first. `resourceUrl()` currently selects index zero, so the dashboard
shows the fallback even when a custom hostname such as `andersseen.dev` is
configured. The project detail only renders that one chosen URL, hiding the
other valid public hostnames.

The account response checked on 2026-09-22 confirms this order for, among
others, `my-blog`: `my-blog-6vo.pages.dev`, then `andersseen.dev`.

## 3. Goals & Non-goals

**Goals**

- Prefer a custom hostname to a `pages.dev` hostname wherever DevFlare chooses
  one canonical project URL.
- Render all unique public hostnames for each Pages project as usable external
  links on its project-detail card.
- Keep the `pages.dev` hostname available as a fallback and do not invent a
  hostname that Cloudflare did not return.
- Cover ordering, deduplication, and fallback behaviour with unit tests.

**Non-goals**

- Discover deployments hosted by Vercel or another provider; Portfolio remains
  absent from Cloudflare data until it is moved or manually represented.
- Guess a Cloudflare resource mapping for a named dashboard project such as
  Lumen Icons. The API currently has no resource named `lumen`; aliases will
  only be added once the owner identifies the matching resource.
- Change DNS, custom-domain configuration, or Cloudflare account state.

## 4. Design

`dashboard-projects.ts` will expose a pure helper that gathers domains from a
Pages project or Worker, includes the Pages project's explicit `subdomain` as
the guaranteed fallback, removes duplicates, and orders custom hosts before
Cloudflare fallbacks. A custom host is any Pages domain not ending in
`.pages.dev`; Worker domains are custom by nature. `resourceUrl()` remains the
single canonical URL helper and takes the first item from this ordered list.

The dashboard card will therefore show the custom canonical URL without new
markup. The project detail will use the same helper to render every URL as a
separate external link; this makes both the custom hostname and `pages.dev`
fallback visible without duplicating domain-ordering rules in a template.

| File                                                           | Change                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/devflare/src/app/pages/(app)/dashboard-projects.ts`      | Add ordered, deduplicated resource-URL helper; make canonical URL prefer custom hosts.   |
| `apps/devflare/src/app/pages/(app)/dashboard-projects.spec.ts` | Test custom-host priority, all URL output, duplicate removal, and default-only fallback. |
| `apps/devflare/src/app/pages/(app)/projects/[slug].page.ts`    | Render all Pages URLs produced by the shared helper.                                     |

No API, database, authentication, or Cloudflare-permission changes are needed:
the existing `/api/v1/cloud/pages` response already includes the domains.

## 5. Constraints

- Keep account credentials server-side; the browser only uses DevFlare's
  existing same-origin API response.
- Use standalone Angular and keep presentation/domain selection in the existing
  pure dashboard helper rather than in a component template.
- Add no runtime dependencies and make no remote configuration changes.
- Do not use nested anchors: dashboard cards remain their existing single
  internal link; external host links belong on the project-detail page.

## 6. Test plan

- Unit: extend `dashboard-projects.spec.ts` to verify `andersseen.dev` wins over
  `my-blog.pages.dev`, both URLs remain available, repeats are removed, and a
  default-only Pages project still gets its `pages.dev` URL.
- Manual: run the app, open the `my-blog` project detail, confirm both
  `https://andersseen.dev` and its `pages.dev` fallback are clickable; confirm
  the dashboard card labels `https://andersseen.dev` as the canonical URL.
- Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`.

## 7. Tasks

- [x] 1. Add and test the shared ordered-resource-URL helper.
- [x] 2. Update the project detail to render all Pages URLs.
- [x] 3. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [x] 4. Verify the `my-blog` domain order against the connected Cloudflare account and cover the rendered URLs through the shared helper's unit tests.
- [x] 5. Update `docs/ai/STATE.md` and the index in `docs/specs/README.md`.

## 8. Verification results

`pnpm format:check`, `pnpm lint`, `pnpm test`, and
`pnpm exec nx run-many -t typecheck --parallel=1 --outputStyle=static` pass on
2026-09-22. The DevFlare test target has 111 passing tests, including the three
new URL-selection cases. A read-only Cloudflare API query confirmed that
`my-blog` returns `my-blog-6vo.pages.dev` before `andersseen.dev`; the new
ordering correctly chooses the latter as the canonical URL while preserving
both links.

## 9. Log / Deviations

- **2026-09-22** — Read-only Cloudflare API check found custom Page domains on
  six projects. Their fallback `pages.dev` host appears first in the response,
  which identifies the dashboard's canonical-link bug.
- **2026-09-22** — The root `pnpm typecheck` shortcut exited with TypeScript's
  help text while its Nx tasks were run concurrently. Running the identical
  nine targets serially passed; this feature does not change typecheck setup.
- **2026-09-22** — Independent review caught that the first implementation
  dropped the previous `project.subdomain` fallback when `domains` was empty.
  Restored it inside the shared helper and added a regression test for that
  exact response shape.
