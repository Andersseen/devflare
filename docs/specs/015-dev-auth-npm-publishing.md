# 015 — Publish the DevAuth SDK to npm

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Status  | In progress (packaging + CI done; first real publish pending) |
| Branch  | `feature/dev-auth-sdk-polish`                                 |
| Created | 2026-09-12                                                    |
| Updated | 2026-09-12                                                    |

## 1. Summary

`@dev-auth/core`, `@dev-auth/angular`, and `@dev-auth/elements` become real,
independently-versioned npm packages, publishable via a human-triggered
GitHub Actions workflow — reversing spec 014's "no npm publication" non-goal
now that a real `@dev-auth` npm org exists.

## 2. Problem / Motivation

The DevAuth SDK (spec 014) shipped as three `libs/shared/*` libraries
consumed only through TS path aliases inside this monorepo — no
`package.json`, no build, no way for an external app (the paused Imageryx
migration is the first concrete consumer) to install any of it. The owner
created the `@dev-auth` npm org and wants these three packages real and
installable outside this repo, published automatically from CI rather than
by hand-running `npm publish` locally.

## 3. Goals & Non-goals

- **Goals**: real `package.json`/build output for all three libraries;
  independent semver versioning; a `workflow_dispatch`-triggered GitHub
  Actions job that versions, changelogs, and publishes all three via
  `nx release`; the CSS side-effect bug this work surfaced in
  `dev-auth-elements` fixed as part of the same change, not deferred.
- **Non-goals**: auto-publishing on every push to `main` (a human must
  trigger the workflow, at least for this first version of the pipeline);
  changesets or any tool other than `nx release` (already the workspace's own
  tool, zero new install); a pnpm workspace (`pnpm-workspace.yaml`) — not
  needed, `nx release`'s `updateDependents` works off Nx's own project graph.

## 4. Design

### Real bug found while tracing the packaging work, fixed in scope

`dev-auth-elements/src/lib/register.ts` had a static top-level
`import '../styles/tokens.css'`. A bare side-effect import is silently exempt
from TS2307 even when unresolvable (confirmed via `tsc --traceResolution`),
which is why this compiled clean with no `declare module '*.css'` anywhere in
the repo — but a plain Node/Worker `import` of the real published package
would hard-throw on that exact line the moment a bundler-free consumer tried
it, and any Angular-only consumer (never calling `defineDevAuthElements()`)
was pulling the CSS side effect in through the shared barrel regardless.
Fixed by making the import dynamic and gated behind the existing
`isBrowser()` check (`ensureStyles()`, called from
`defineDevAuthSignIn()`/`defineDevAuthUserButton()`), so the CSS only loads
as a side effect of actually registering an element in a real browser.

The suppression comment for the resulting unresolvable-module situation is
`@ts-ignore`, not `@ts-expect-error`, and deliberately so: whether this
import errors depends on the _consumer's_ own tsconfig (devflare's own Vite
ambient `*.css` typing means there's no error to expect there at all — an
`@ts-expect-error` in that context itself fails as an "unused directive" —
while `dev-auth-elements`'/`dev-auth-angular`'s isolated tsconfigs have no
such ambient declaration and do error). An `eslint-disable-next-line` for
`@typescript-eslint/ban-ts-comment` sits alongside it, since the repo's lint
config otherwise mandates `@ts-expect-error`.

### Per-library `package.json`

All three: `"publishConfig": { "access": "public" }` (required — `@dev-auth`
is a fresh scope, defaults to restricted), ESM-only. `dev-auth-elements`
additionally exports `"./tokens.css"` (mirrors `@andersseen/web-components`'s
own convention) and declares real `dependencies` on
`@andersseen/web-components`/`@andersseen/icon`. `dev-auth-angular` declares
`@dev-auth/elements` as a real `dependencies` entry (not peer — it's not
something the consuming app configures separately) and `@angular/core`/
`@angular/common`/`@angular/router` as `peerDependencies`; `ng-packagr`
refused to build until `@dev-auth/elements` was added to
`ng-package.json`'s `allowedNonPeerDependencies` (its own strictness check
for non-peer runtime deps in a publishable Angular library).

### Build targets

- `dev-auth-core`, `dev-auth-elements`: `@nx/js:tsc`, new `tsconfig.lib.json`
  per lib (mirrors the split `dev-auth-angular` already had).
  `dev-auth-elements`'s `build` target carries `assets` globs that copy
  (never re-transpile) `styles/tokens.css` and — critically — only
  `lib/elements/*.flow.js`/`*.flow.d.ts` (the pre-compiled Flowview output,
  never the raw `.flow` source) at the same relative path
  `sign-in-element.ts`'s existing `import './sign-in.flow.js'` already
  expects; `"dependsOn": ["build:flow"]` so a stale compiled `.flow.js` can
  never silently ship.
- `dev-auth-angular`: `@nx/angular:package` (ng-packagr — added as a new
  exact-pinned devDependency, `21.2.7`, not installed anywhere in this repo
  before this change). Needs `angularCompilerOptions.compilationMode:
"partial"` in `tsconfig.lib.json` — without it, ng-packagr builds in "full"
  Ivy compilation mode and writes a `prepublishOnly` script into the output
  `package.json` that hard-fails any `npm publish` attempt with "trying to
  publish a package compiled in full compilation mode."
- `nx.json`'s `targetDefaults` gained a plain `"build": { "dependsOn":
["^build"] }` entry (target-name-keyed, not executor-keyed, since the
  three libs use three different build executors) — this alone makes
  `nx build dev-auth-angular` build `dev-auth-elements` first, since Nx's
  project graph already resolves the real import edge.

### `nx release` — versioning + changelog + GitHub Release + publish orchestration

`nx.json`'s new `release` block: `projectsRelationship: "independent"`,
`version.conventionalCommits: true` (this repo's `feat:`/`fix:` convention
already is Conventional Commits), `version.updateDependents: "auto"`, and —
found only by actually dry-running it —
`version.preserveMatchingDependencyRanges: false`. The doc comment for that
option says "false by default," but the actual `@nx/js` version-actions code
treats an _unset_ value the same as `true` (applies to every dependency
type); left unset, bumping `dev-auth-elements` past its `^0.1.0` range in
`dev-auth-angular`'s manifest throws instead of rewriting the range.
`changelog.projectChangelogs.createRelease: "github"` creates one GitHub
Release per published tag.

**CI uses the combined `nx release` command, not the split `nx release
version`/`nx release publish` subcommands** — found only by dry-running
both. The split subcommands each do only their own narrow piece: `nx
release version` alone never generates a changelog or creates a release at
all (that's a separate phase entirely — confirmed by reading
`command-line/release/version.js`, which contains no changelog/release
logic), and `nx release changelog` run standalone requires an explicit
single target `version` argument, which doesn't make sense for three
independently-versioned projects with three different new versions. Only
the combined `nx release` command (`command-line/release/release.js`)
correctly sequences version → changelog (generated but not yet
committed/pushed) → one git commit/tag/push covering all three projects
together → a GitHub Release per project → npm publish, in that order. It
also reads git config from the top-level `release.git`, not
`release.version.git`/`release.changelog.git` (those nested locations are
specifically for the split subcommands, and are what an earlier iteration
of this config used before switching to the combined command).

**The most significant thing the dry run caught**: `nx release publish`
defaults to publishing from the _project root_ (`libs/shared/<lib>`, raw
source — `.spec.ts` files, `.flow` templates, `eslint.config.mjs`, everything
— included in the pack), not from the built `dist/libs/shared/<lib>`
output, unless a project explicitly defines an `nx-release-publish` target
with `@nx/js:release-publish`'s `packageRoot` option pointed at the dist
directory. All three libraries needed this target added; without it, the
very first real publish would have shipped raw TypeScript source, tests, and
tooling config to npm instead of compiled output.

### CI — `.github/workflows/publish.yml`

`workflow_dispatch` only (inputs: `dry_run`, default `true`; `first_release`,
default `false`) — a deliberate human trigger, not "publish on every push to
main," while still meeting "I don't run `npm publish` locally myself."
`environment: npm` (new GitHub Environment, mirrors `production`/`staging`)
is the only place `NPM_TOKEN` is exposed. `cancel-in-progress: false` on the
concurrency group (unlike this repo's other three workflows) — cancelling
mid-publish could leave a pushed version-bump tag with only some of the
three packages actually on npm. One step, the combined `nx release`
command (see above — not the split subcommands), accepting
`--dry-run`/`--first-release` from the workflow inputs, with both
`NODE_AUTH_TOKEN` (npm) and `GITHUB_TOKEN` (GitHub Release creation — the
default token every Actions run already gets, no extra secret needed) set
on that one step.

**Owner action items** (GitHub/npm UI only, cannot be done from here):

1. npmjs.com → Access Tokens → generate an **Automation** token (or a
   Granular token scoped to `@dev-auth`, read+write) — not a token type that
   can prompt for an OTP, which would hang CI.
2. GitHub repo → Settings → Environments → new environment named exactly
   `npm`.
3. Inside it → Environment secrets → add `NPM_TOKEN` with that token's value.

### Root `package.json`: `"private": false"` → `"private": true"`

Was `false` with nothing depending on it (verified via repo-wide grep) — a
real footgun once any publish tooling touches the workspace, since a
misconfigured `nx release`/CI change could otherwise attempt to publish the
entire monorepo to npm as a package called `"devflare"`.

## 5. Constraints

No `pnpm-workspace.yaml` — this stays a single-package pnpm project;
`dev-auth-angular`'s `"@dev-auth/elements": "^0.1.0"` is a real, hand-written
semver range, not `workspace:*`. `AGENTS.md` Hard Rule #1 (never hand-edit
`*.flow.js`) still applies — the `build` target's `dependsOn: ["build:flow"]`
enforces it stays regenerated, never stale, at build time too.

## 6. Test plan

1. `nx run-many -t build -p dev-auth-core,dev-auth-elements,dev-auth-angular`
   — clean from a reset Nx workspace, confirms build ordering and asset
   copying.
2. `npm pack --dry-run` from each `dist/libs/shared/<lib>` — confirms exact
   tarball contents before ever touching a registry.
3. `nx release --yes --dry-run --first-release` (the combined command) —
   confirms version bump, changelog generation (including per-project
   `CHANGELOG.md` previews), the GitHub Release preview
   (`CREATE https://github.com/.../releases/tag/<project>@<version>`),
   dependency-range rewrite, and (critically) that publish actually reads
   from `dist/`, not source.
4. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && nx
run-many -t build -p devflare,dev-auth-core,dev-auth-elements,dev-auth-angular`
   — the whole repo, not just the three new libraries.
5. A live smoke test: fresh dev server, `/dev-auth-sdk` demo page, confirm no
   console errors and the sign-in card renders fully styled (proves the lazy
   CSS import works at runtime, not just typechecks).
6. Not yet done: `.github/workflows/publish.yml` via `workflow_dispatch` with
   `dry_run: true`, reviewed by the owner; only then a real run with
   `dry_run: false` — blocked on the owner adding the `NPM_TOKEN` secret
   (§4's action items).

## 7. Tasks

- [x] 1. Fix the `register.ts` CSS side-effect import (lazy, browser-gated).
- [x] 2. `package.json` + build target + `nx-release-publish` target for all
     three libraries.
- [x] 3. Add `ng-packagr`, configure partial Ivy compilation for
     `dev-auth-angular`.
- [x] 4. `nx.json` — `targetDefaults.build`, `release` block.
- [x] 5. `.github/workflows/publish.yml`.
- [x] 6. Root `package.json` → `"private": true"`.
- [x] 7. README updates (all three libraries) + this spec + spec 014's
     superseded note.
- [x] 8. Run quality gates + local dry runs (§6, items 1-5).
- [ ] 9. Owner adds the `NPM_TOKEN` GitHub Environment secret.
- [ ] 10. First real `workflow_dispatch` run with `dry_run: true`, reviewed.
- [ ] 11. First real publish (`dry_run: false`), confirmed on npmjs.com.
- [ ] 12. Update `docs/ai/STATE.md`.

## 8. Verification results

`nx run-many -t build -p dev-auth-core,dev-auth-elements,dev-auth-angular`:
all three build clean; `dev-auth-elements` (30 files, `README.md` +
`index.{js,d.ts}` + `lib/**` + `styles/tokens.css`), `dev-auth-elements` (39
files, includes `lib/elements/{sign-in,user-button}.flow.{js,d.ts}` and
`styles/tokens.css` at the right paths), `dev-auth-angular` (6 files, real
Angular Package Format — `fesm2022/dev-auth-angular.mjs` + `types/*.d.ts`).

`nx release --yes --dry-run --first-release` (after the
`nx-release-publish`/`packageRoot` fix, and after switching from the split
subcommands to the combined command): tarball contents for all three match
the clean `dist/` output exactly — no source `.ts`/`.spec.ts` files, no raw
`.flow`, no `eslint.config.mjs`. Output confirmed, per project: a real
conventional-commits-derived `CHANGELOG.md` entry, `CREATE
https://github.com/Andersseen/devflare/releases/tag/<project>@0.2.0
[dry-run]`, and "Creating GitHub Release" — all three phases (changelog,
release, publish) actually run, not just version bumping.

Full repo `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`:
all green (108 devflare tests, 64 dev-auth-elements tests, 11
dev-auth-angular tests). `nx run-many -t build -p
devflare,dev-auth-core,dev-auth-elements,dev-auth-angular`: all green.

Live smoke test on a freshly-started dev server (`/dev-auth-sdk`): 0 console
errors, sign-in card renders fully styled (primary-colored button, rounded
card, avatar) — confirms the lazy dynamic CSS import actually works at
runtime, not just at typecheck time.

## 9. Log / Deviations

**2026-09-12**: Four configuration bugs were found only by actually
dry-running `nx release`, not by reading the docs — all four are recorded
in §4 because a future session re-touching this pipeline needs to know they
were deliberate, not oversights: (1) `preserveMatchingDependencyRanges`
defaults to `true`-like behavior in the actual `@nx/js` code despite the
type doc comment claiming `false`; (2) `nx release publish` needs an
explicit `nx-release-publish` target with `packageRoot` pointed at `dist/`
or it silently packages from source; (3) the CI workflow originally called
the split `nx release version` + `nx release publish` subcommands — after
merging, the owner asked why no GitHub Release had appeared, which led to
discovering that `nx release version` alone never generates a changelog or
creates a release at all (confirmed by reading
`command-line/release/version.js`: no changelog/release logic anywhere in
it), and that `nx release changelog` run standalone requires a single
explicit target version, meaningless for three independently-versioned
projects. Switched to the combined `nx release` command, which correctly
orchestrates all four phases together. (4) That switch also moved
`release.git` from the nested `release.version.git`/`release.changelog.git`
(required for the split subcommands, which reject a top-level
`release.git`) back to a single top-level `release.git` (required for the
combined command, confirmed by reading `release.js`'s git-handling code).
