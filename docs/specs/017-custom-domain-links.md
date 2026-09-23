# 017 — Prefer and expose custom deployment domains

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | Done                              |
| Branch  | `feature/017-custom-domain-links` |
| Created | 2026-09-22                        |
| Updated | 2026-09-23                        |

## 1. Summary

The deployment dashboard will prefer a project's custom hostname over its
Cloudflare `pages.dev` fallback, expose every public hostname as an outbound
link, and include verified Cloudflare-routed domains that the current API token
cannot discover through the Pages or Worker-domain APIs.

## 2. Problem / Motivation

Cloudflare's Pages API returns `domains` with the default `*.pages.dev`
hostname first. `resourceUrl()` currently selects index zero, so the dashboard
shows the fallback even when a custom hostname such as `andersseen.dev` is
configured. The project detail only renders that one chosen URL, hiding the
other valid public hostnames.

The account response checked on 2026-09-22 confirms this order for, among
others, `my-blog`: `my-blog-6vo.pages.dev`, then `andersseen.dev`.

Follow-up verification on 2026-09-23 found that `volt-ui.andersseen.dev`,
`lumen-icons.andersseen.dev`, and `angular-movement.andersseen.dev` each serve
their corresponding live application through Cloudflare, but are neither Pages
domains nor Worker custom domains in the account response. They are therefore
shown incorrectly as unconnected `planned` cards.

## 3. Goals & Non-goals

**Goals**

- Prefer a custom hostname to a `pages.dev` hostname wherever DevFlare chooses
  one canonical project URL.
- Render all unique public hostnames for each Pages project as usable external
  links on its project-detail card.
- Keep the `pages.dev` hostname available as a fallback and do not invent a
  hostname that Cloudflare did not return.
- Surface a Worker's `workers.dev` URL only when Cloudflare confirms that the
  individual Worker has its account subdomain enabled.
- Cover ordering, deduplication, and fallback behaviour with unit tests.
- Show verified static public domains as real live URLs, never as `planned`.
- Do not render an unconnected watched-project placeholder when it has no
  saved project, Cloudflare resource, or verified public domain.
- Keep the dashboard Cloudflare-only: saved metadata without a live linked
  Pages project, Worker, or verified Cloudflare-routed URL must not create a
  standalone card.

**Non-goals**

- Discover deployments hosted by Vercel or another provider; no URL is created
  for resources Cloudflare does not report as publicly enabled.
- Infer a Worker route from its domain: the current token lacks `Workers
Routes:Read`, so a dashboard cannot honestly claim which script backs one of
  the verified route-only domains.
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

The Workers API route will fetch the account's Workers subdomain and each
script's `enabled` state. An enabled script gets its confirmed
`https://<script>.<account-subdomain>.workers.dev` hostname appended after any
custom domains. Disabled Workers remain visible as infrastructure but do not
receive a speculative public URL. The same helper is used by the Worker detail
route, so the dashboard and detail page agree.

`WATCHED_PROJECTS` will carry only explicit, verified route-only public
domains. The dashboard group aggregates these with Pages and Worker URLs,
deduplicates them, and chooses the first as its canonical URL. Its detail page
renders those URLs in a dedicated public-links section. A card with such a URL
is never labelled `planned`. Conversely, a watched placeholder with no
resource and no verified URL is omitted, so the dashboard stops representing
an unintegrated idea as a Cloudflare project.

| File                                                           | Change                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/devflare/src/app/pages/(app)/dashboard-projects.ts`      | Add ordered, deduplicated resource-URL helper; make canonical URL prefer custom hosts.   |
| `apps/devflare/src/app/pages/(app)/dashboard-projects.spec.ts` | Test custom-host priority, all URL output, duplicate removal, and default-only fallback. |
| `apps/devflare/src/app/pages/(app)/projects/[slug].page.ts`    | Render all Pages URLs produced by the shared helper.                                     |
| `apps/devflare/src/server/lib/cloudflare.ts`                   | Read the account and per-script Workers subdomain state; return confirmed public URLs.   |
| `apps/devflare/src/server/routes/api/v1/cloud/workers/*.ts`    | Add confirmed `workers.dev` URLs to Worker domains in list and detail responses.         |
| `apps/devflare/src/server/lib/cloudflare.spec.ts`              | Test enabled and disabled Worker subdomain resolution.                                   |
| `apps/devflare/src/app/pages/(app)/(home).page.ts`             | Treat a verified public URL as live, not planned.                                        |

No database, authentication, or Cloudflare-permission changes are needed. The
existing token's `Workers Scripts:Read` permission covers the read-only
subdomain endpoints.

## 5. Constraints

- Keep account credentials server-side; the browser only uses DevFlare's
  existing same-origin API response.
- Use standalone Angular and keep presentation/domain selection in the existing
  pure dashboard helper rather than in a component template.
- Add no runtime dependencies and make no remote configuration changes.
- Do not expose a Workers URL merely because the account owns a
  `workers.dev` subdomain: Cloudflare reports enablement per script.
- Do not use nested anchors: dashboard cards remain their existing single
  internal link; external host links belong on the project-detail page.

## 6. Test plan

- Unit: extend `dashboard-projects.spec.ts` to verify `andersseen.dev` wins over
  `my-blog.pages.dev`, both URLs remain available, repeats are removed, and a
  default-only Pages project still gets its `pages.dev` URL.
- Manual: run the app, open the `my-blog` project detail, confirm both
  `https://andersseen.dev` and its `pages.dev` fallback are clickable; confirm
  the dashboard card labels `https://andersseen.dev` as the canonical URL.
- Manual: confirm enabled Workers such as `cv-builder` show a `workers.dev`
  link, while disabled Workers such as `buck-auth` do not.
- Unit: verify a route-only public domain makes its project live, appears in
  its detail URLs, and prevents an otherwise-empty watched placeholder.
- Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`.

## 7. Tasks

- [x] 1. Add and test the shared ordered-resource-URL helper.
- [x] 2. Update the project detail to render all Pages URLs.
- [x] 3. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [x] 4. Verify the `my-blog` domain order against the connected Cloudflare account and cover the rendered URLs through the shared helper's unit tests.
- [x] 5. Update `docs/ai/STATE.md` and the index in `docs/specs/README.md`.
- [x] 6. Integrate confirmed `workers.dev` URLs into Worker list and detail APIs.
- [x] 7. Test enabled and disabled Worker URL resolution, re-run quality gates,
     then update the state snapshot.
- [x] 8. Integrate verified route-only public domains into dashboard groups and
     project detail links; omit unconnected watched placeholders.
- [x] 9. Verify the three known route-only domains, run quality gates, and
     update the state snapshot.
- [x] 10. Remove Portfolio and other non-Cloudflare placeholders; ensure saved
      metadata cannot create a non-Cloudflare dashboard card.
- [x] 11. Reconcile the complete live Cloudflare inventory with dashboard
      groups, prove every Pages project and Worker appears exactly once, then
      run the full verification gates.

## 8. Verification results

Initial Pages-domain verification: `pnpm format:check`, `pnpm lint`, `pnpm test`, and
`pnpm exec nx run-many -t typecheck --parallel=1 --outputStyle=static` pass on
2026-09-22. The DevFlare test target has 111 passing tests, including the three
new URL-selection cases. A read-only Cloudflare API query confirmed that
`my-blog` returns `my-blog-6vo.pages.dev` before `andersseen.dev`; the new
ordering correctly chooses the latter as the canonical URL while preserving
both links.

Worker URL integration verified on 2026-09-23: the account subdomain is read
once and every listed Worker is checked for its own `enabled` state. The
DevFlare target has 113 passing tests, including enabled `cv-builder` and
disabled `buck-auth` cases. `pnpm format:check`, `pnpm lint`, serial Nx
typechecks, and the full `pnpm test` suite pass.

Route-only domain integration verified on 2026-09-23: public HTTP reads return
200 with the expected application titles for `volt-ui.andersseen.dev`,
`lumen-icons.andersseen.dev`, and `angular-movement.andersseen.dev`. The
current token cannot read `Workers Routes` (Cloudflare denies that endpoint),
so these exact verified domains are represented explicitly instead of guessing
which Worker route serves each one. Unit coverage confirms they are live rather
than planned, empty placeholders are omitted, and `my-blog` maps once to
Andersseen Dev with `https://andersseen.dev`. DevFlare has 115 passing tests;
format, lint, and typecheck pass.

Final Cloudflare-only hub verification on 2026-09-23 queried the connected
account read-only and reconciled all 10 Pages projects and all 16 Workers with
the dashboard grouping test. Each resource appears exactly once, including
saved rows that point at an already-grouped resource. The account also reports
four Worker custom domains; Pages custom domains and enabled `workers.dev`
hosts remain available as links. Portfolio and other unlinked saved metadata
are excluded even if present in DevFlare's database. DevFlare has 117 passing
tests. `pnpm format:check`, `pnpm lint`, all nine Nx typecheck targets run
serially, the complete `pnpm test` suite, and the production build all pass.

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
- **2026-09-23** — The dashboard's apparent missing-project problem was traced
  to a second gap: it listed only custom Worker domains, while the account has
  multiple Workers with Cloudflare-confirmed `workers.dev` URLs. Expanded this
  spec to expose those URLs only when the per-script API says they are enabled.
- **2026-09-23** — Completed the Worker list and detail integration. Verified
  custom domains remain first, enabled Workers add their actual `workers.dev`
  host, and disabled Workers receive no invented URL.
- **2026-09-23** — A live-domain check disproved the assumption that all
  Cloudflare-hosted projects must appear in the Pages or Worker-domain API.
  Reopened this spec to cover explicit, verified route-only domains and remove
  misleading empty planned cards.
- **2026-09-23** — Completed route-only domain integration for Volt UI, Lumen
  Icons, and Angular Movement. Removed empty watched placeholders rather than
  displaying them as Cloudflare projects, and grouped the verified
  `andersseen.dev` Pages project under Andersseen Dev exactly once.
- **2026-09-23** — Closed the remaining Cloudflare-only hub gap: removed
  Portfolio and Quartz from the watched list, rejected saved metadata unless it
  links to a live Cloudflare resource, and added an inventory regression test
  covering the exact 10 Pages and 16 Workers returned by the account.
