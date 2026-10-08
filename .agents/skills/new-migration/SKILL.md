---
name: new-migration
description: Add a D1 schema migration to dev-auth or devflare — pick the right app, number the file, write replayable SQL, sync the Drizzle schema when it applies, and verify locally before it ever touches production.
disable-model-invocation: true
---

# New migration

Migrations are the only change in this repo that cannot be undone by editing
code and redeploying: `deploy.yml` applies them `--remote` against live D1, and
they are append-only. The cost of getting one wrong is data, not a red build.

The two apps store schema differently, and that is where the mistakes happen.

## 1. Pick the app

| Data                                                    | App             |
| ------------------------------------------------------- | --------------- |
| users, sessions, accounts, verification, auth analytics | `apps/dev-auth` |
| projects, deployments, app-side features                | `apps/devflare` |

| App             | Migrations dir             | Query layer                    | Schema also declared in?     |
| --------------- | -------------------------- | ------------------------------ | ---------------------------- |
| `apps/dev-auth` | `src/db/migrations`        | Drizzle (`drizzle-orm/d1`)     | **Yes — `src/db/schema.ts`** |
| `apps/devflare` | `src/server/db/migrations` | db0, `db.sql` tagged templates | No — SQL is the only source  |

**The dev-auth trap:** its tables are declared twice — once as SQL in the
migration (what the database actually gets) and once as a Drizzle table in
`src/db/schema.ts` (what the TypeScript queries are typed against). Writing only
the migration leaves every new column invisible to the code; writing only the
schema types a column that does not exist and fails at runtime. Do both, in the
same change.

`drizzle-kit` is installed but **not** wired up — `drizzle.config.ts` is
deliberately stubbed out. Do not run `drizzle-kit generate`; write the SQL.

## 2. Number the file

```bash
ls apps/dev-auth/src/db/migrations apps/devflare/src/server/db/migrations
```

Continue the sequence with the same zero-padded width: `0002_add_x.sql` after
`0001_analytics.sql`. Wrangler orders by filename and records applied names in
`d1_migrations`, so two files sharing a prefix apply in an arbitrary order.

**Never edit a migration that already ran.** Editing the body changes nothing on
an environment that already applied it and silently diverges local from remote.
Add a new file instead.

## 3. Write replayable SQL

Use `templates/migration.sql.template` as the starting point. Match the existing
files: `IF NOT EXISTS` on every `CREATE`, because these replay from zero against
fresh local databases constantly.

Rules that D1/SQLite enforce the hard way:

- `ADD COLUMN ... NOT NULL` **fails** on a table with rows unless it has a
  `DEFAULT`. Otherwise: add nullable → backfill → enforce.
- Columns cannot be dropped or retyped in place. The portable path is
  create-new-table → `INSERT INTO ... SELECT` → drop old → rename.
- Index every column that a `WHERE` clause filters on — especially the
  user-owning column, or each request becomes a full scan.
- No `BEGIN`/`COMMIT`: wrangler wraps the file itself.

## 4. Sync the Drizzle schema (dev-auth only)

Mirror the SQL in `apps/dev-auth/src/db/schema.ts` using the existing tables as
the pattern — `sqliteTable`, `text`/`integer`, `{ mode: 'boolean' }` and
`{ mode: 'timestamp' }` for the non-native types, `.references()` for foreign
keys. The column names in `schema.ts` must match the SQL exactly; Drizzle does
no renaming here.

## 5. Apply locally and verify

```bash
pnpm db:migrate:local
```

That applies **both** apps against the miniflare state under `.wrangler/`. Then
confirm the table really has the shape you intended, rather than trusting that
the command exited 0:

```bash
npx wrangler d1 execute DB --local --cwd apps/dev-auth \
  --command "SELECT sql FROM sqlite_master WHERE name='<table>';"
```

For a destructive or multi-step migration, seed a row first
(`pnpm seed:user`), apply, then re-query to prove the data survived.

## 6. Before it ships

- `pnpm typecheck` — catches a `schema.ts` edit that does not compile.
- Hand the diff to the `d1-migration-reviewer` agent.
- Run the `deploy-preflight` skill to list what the next deploy will apply.

Do not run `pnpm db:migrate` or any `--remote` command. Applying to production
is the user's decision, and it happens automatically in `deploy.yml`.
