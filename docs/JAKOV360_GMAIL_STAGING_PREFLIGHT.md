# JAKOV360 Gmail M1 — acceptance staging preflight

**Status: preparation only. 28 October 2026.**

This document is the staging-specific gate for the hardened Gmail tree. It does
not authorize a deploy, a migration, an environment change, OAuth, or sending
mail. The local PostgreSQL 18 restored-backup rehearsal (PR #168) passed for a
different database and does **not** clear this gate.

No step below was executed against Render, the acceptance database, or
production. Human approval is required before gates B, C, D, and E.

## Candidate

| Item | Value |
| --- | --- |
| Deployed staging service | `jakov360-acceptance-staging` (`srv-datu3v093c1s73c17m60`) |
| Deployed branch | `cursor/supplier-confirmation-eaef` |
| Deployed commit (reported live) | `6423d532f203e934f298bcfb4f56d7557acc36c1` |
| Auto-deploy | remains **off**. Do not turn it on. |
| Hardened Gmail head | `69206059a2813fda5444940cd9179774bb43eb51` |
| PR #167 head (parent) | `94eca3490a57aaafb548445988359fb71569b7b1` |
| PR #170 | draft, one commit, already contained in `69206059` |
| This candidate base | `cursor/supplier-confirmation-eaef` |
| Never target | `main`, `release/1.0.0`, production service `importpilot-ai` |

`6423d532` is an ancestor of `69206059` (56 commits, fast-forward). This
candidate branch starts at that hardened head and adds only this preflight.
Do not merge PR #167 or PR #170. Do not push to their source branches.

The combined diff of `6423d532..69206059` is 40 files, Gmail and supplier-mail
support only: OAuth connect/disconnect, encrypted mailbox credentials, the
one-shot outbox, acceptance allowlist, privacy disclosure, CI on PostgreSQL
18, and two new migration directories. It does not retarget public DNS and
does not change the production Render blueprint.

## What a later deploy would migrate

Git on the **already deployed** commit contains **21** migration directories.
The hardened head contains **23**. The two directories added by Gmail are:

- `20261025011000_mailbox_connections`
- `20261025025000_supplier_gmail_outbox`

A prior read-only inventory of live database `jakov360_acceptance_staging`
reported **16 applied** and **0 unresolved** rows in `_prisma_migrations`,
including `20260925090000_cost_evidence_and_nullable_totals`, and reported
that `mailbox_connections` and `supplier_mail_deliveries` do not exist.

Those two facts together mean the pending set is **not** “the last seven
folders.” Three of the seven sort **before** an already-applied migration:

| Order | Migration | In deployed git `6423d532` | Reported in live `_prisma_migrations` |
| --- | --- | --- | --- |
| 16 | `20260806090000_ai_usage_ledger` | yes | absent |
| 17 | `20260919220000_supplier_search_quota` | yes | absent |
| 18 | `20260919230000_billing_core` | yes | absent |
| 19 | `20260925090000_cost_evidence_and_nullable_totals` | yes | **applied** |
| 20 | `20261023150000_supplier_confirmations` | yes | absent |
| 21 | `20261023220000_supplier_message_translation` | yes | absent |
| 22 | `20261025011000_mailbox_connections` | no | absent |
| 23 | `20261025025000_supplier_gmail_outbox` | no | absent |

`prisma migrate deploy` applies every directory that is missing from
`_prisma_migrations`, in folder order. It will try to apply the three earlier
gaps even though `cost_evidence` is already recorded. Confirm that with the
read-only inventory in gate B. Do not assume it from this count.

The 21 shared `migration.sql` files are byte-identical between `6423d532` and
`69206059`. Checksums below are SHA-256 of those file bytes (Prisma stores
this digest in `_prisma_migrations.checksum`).

### Full checksum manifest (hardened tree, 23)

| Migration | Bytes | SHA-256 |
| --- | ---: | --- |
| `20260611000000_initial_foundation` | 1472 | `984a4d50783e066f8f79386c54175cf9c62ef114bf8bc41e129e4ca3ae612393` |
| `20260611220000_authentication` | 3300 | `4212632ff4cc1463bfedb974d49a234daf80146993f41fc826019dd15d9f79c8` |
| `20260611235000_import_projects_pipeline` | 4427 | `e207c96148cd45d9654437ea35afd44b7a86ff6f091782d3e363d603c2cedf99` |
| `20260612001000_supplier_offer_extraction` | 2448 | `47c3b833fbd7bf2fa164e5d76cdc21c37f602fe0eb9eb70fc07705890b225aa1` |
| `20260612003000_landed_cost_engine` | 2837 | `f6db71603740549bc612ebcf2ca89024b2b1fc9ca0706a2a5b4c00e5cc138ced` |
| `20260612070000_supplier_offer_intelligence` | 2956 | `608e6b13c8f722d94e66488f8c365ffad2d5746fa676869f5ef1e9fd305c9f9d` |
| `20260612083000_project_decisions` | 1452 | `6f129db844e45d10816326e63e20ca36dd31b19a97743550abed788dd8af3b95` |
| `20260612090000_negotiation_assistant` | 2101 | `b838117d4f2b125635f327b3b35561d6f4dda4d415a7bd2ba2b888aa0beff98f` |
| `20260612093000_import_document_vault` | 686 | `0e36264ae12070cc5119f56a26ff77edf78d4bcfca6c956e4c649eace0cf1d07` |
| `20260612100000_project_timeline` | 1330 | `3f35959ee630786c55abbde4e4fdf8dc7eb6d620113890685f7a3c2dccb4aaa7` |
| `20260612113000_feedback_analytics` | 4021 | `b9bd47496f8da49b3f742e04f31445c0ba5568fb5fce141e582f14f00a320263` |
| `20260612220000_product_search` | 226 | `8c0cf23cc5e9743c8849425ca00893ce1524e8bb36ba5b86691bfa4672b1d564` |
| `20260613120000_serbia_iso_country_code` | 171 | `d9be2f4ac2fea5eb9636f98baa78e0102b2d72ac41a442d4d2e1bb8dc9855270` |
| `20260614010000_supplier_search_persistent_cache` | 841 | `977d4787b2a65bc46645bd7f1e33218c030b41ac9335aa259a2eb1272e88984b` |
| `20260614020000_supplier_risk_v2` | 625 | `7c063bd13b481e0d70186f321c14726e02ad833c376e3af9f2b3f9a4c834dd05` |
| `20260806090000_ai_usage_ledger` | 2267 | `a95151474b33d84e1b12e50296c453fda315b7f8ed264f2d2afcf2d3032ba511` |
| `20260919220000_supplier_search_quota` | 1248 | `cd191d85d6143ef96146ed524afa82ea1cfe0237cb0142b71b5db2be7ec916c1` |
| `20260919230000_billing_core` | 5042 | `eb16de0ff3db34a85e7a7eed24ca6f65fd82ae0cbb38be301dcd357f75a40dbd` |
| `20260925090000_cost_evidence_and_nullable_totals` | 1117 | `2fd9a11035a91ba372d71c1cc2e8b687dae493f1aab4c89a2b9ffe617663ce07` |
| `20261023150000_supplier_confirmations` | 2657 | `4a7eb78fbc64e242bb3e86d86abc8413044d0b363fe5e1896d6089368ca7950e` |
| `20261023220000_supplier_message_translation` | 446 | `8e67889bfa119cc6acd8b1bdde12405181e07b19840df3e8767cab08264aaa10` |
| `20261025011000_mailbox_connections` | 1538 | `1d874eb7e8c606e523d90d923bddb7f284e761a385214b62da95231390ebd7a3` |
| `20261025025000_supplier_gmail_outbox` | 2627 | `f5cab740415250349a2b4f97f053bc71a0a0a66b6104d409e1502bd2eb07c620` |

## What the seven migrations do

PostgreSQL runs each Prisma migration in one transaction. A failure rolls that
migration’s SQL back, but earlier migrations in the same `migrate deploy` stay
committed, and a failed row can block the next attempt. Treat any non-zero
exit as a restore-from-backup event, not as something to repair in place.

| Migration | Effect on existing data | Depends on | Lock / behavior note |
| --- | --- | --- | --- |
| `ai_usage_ledger` | None. Creates empty `ai_usage_events`. | `organizations`, `import_projects` | New table only. |
| `supplier_search_quota` | **Rewrites every `organizations` row.** Adds `subscription_plan` (default `FREE`) then `UPDATE organizations SET subscription_plan = 'PRO'`. Creates empty `supplier_search_quota_usage`. | `organizations` | One-time plan promotion. This is the only pending migration that changes existing business data. Row count must stay the same. |
| `billing_core` | None. Creates empty billing and entitlement tables. | enum `SubscriptionPlan` from the quota migration | New objects only. |
| `supplier_confirmations` | No row rewrites. Adds unique index `import_projects_organization_id_id_key` on existing `import_projects(organization_id, id)`. Creates empty `supplier_confirmations`. | `organizations`, `import_projects`, `supplier_offers` | `CREATE UNIQUE INDEX` takes a write lock on `import_projects` for the build. Fails closed if `(organization_id, id)` is not unique. |
| `supplier_message_translation` | Adds eight columns to `supplier_confirmations` with empty defaults. No existing confirmation rows are expected. | `supplier_confirmations` | Short table lock. |
| `mailbox_connections` | None. Creates empty `mailbox_connections`. | `organizations`, `users` | New table only. Gmail code does not read it while the feature flag is off, but the table is created by deploy if migrate runs. |
| `supplier_gmail_outbox` | Adds unique indexes on `supplier_confirmations(organization_id, id)` and `mailbox_connections(organization_id, id)`. Creates empty `supplier_mail_deliveries`. | both tables above | Fails if either parent table is missing. |

There is no down migration. Rollback is restore the immutable backup.

## Gates

Each gate needs its own explicit owner approval, except A, which is this
draft review. Approving A does not approve B–E. A green CI run does not
approve B–E.

### A — Draft code candidate (this PR)

Review the diff. CI must be green on this candidate’s own SHA (PostgreSQL 18
migrate, Prisma drift diff, and the mail-security tests listed below). Leave
the PR in draft. Do not merge it into `cursor/supplier-confirmation-eaef`,
`main`, or `release/1.0.0`.

### B — Backup, read-only inventory, disposable rehearsal

Owner approval required. Still no live `migrate deploy`.

1. Confirm the target is acceptance staging only: service
   `srv-datu3v093c1s73c17m60`, database name `jakov360_acceptance_staging`.
   Refuse any URL whose host or database name is production.
2. Record `SELECT version();`. The rehearsal instance must be the same
   PostgreSQL major version. PR #168 does not supply this fact.
3. Confirm the live start command **before anyone restarts the service**.
   Repo file `render.staging.yaml` describes a different service
   (`importpilot-1-0-staging`, Postgres 16) whose start command runs
   `prisma migrate deploy`. If the acceptance service uses the same pattern,
   the next restart of the **already deployed** SHA `6423d532` would apply
   the five migrations already in that git tree, including the organization
   plan promotion, with no Gmail deploy at all. Do not restart it until the
   backup in this gate exists and has been restored once.
4. Take an immutable backup with Render’s backup control or `pg_dump` custom
   format to operator-controlled storage. Record backup id, time, and size.
   Do not copy the dump into git, GitHub, or a cloud agent.
5. Restore that backup to a **new disposable** database. Run the read-only
   inventory on both the live primary (read-only session) and the restored
   copy. Fingerprints must match. Then run `prisma migrate deploy` and the
   drift diff **only against the disposable copy**, using this candidate SHA.
   The copy’s connection string must not be the live primary.

Read-only inventory (no `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`,
`DROP`, or `prisma migrate deploy` on the live primary):

```sql
SELECT current_database(), current_user, version();

SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY migration_name;

SELECT migration_name
FROM "_prisma_migrations"
WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
```

Expect zero rows from the third query. Every applied checksum must equal the
manifest. Any name in the manifest that is absent from `_prisma_migrations`
is pending. Expect the seven names in the table above and no others. Stop if
the pending set differs.

Object presence, still read-only. A pending `CREATE` whose relation already
exists, or an `ADD COLUMN` whose column already exists, is drift. Stop and
do not “resolve” it on the live database.

```sql
SELECT n.nspname, c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'ai_usage_events',
    'supplier_search_quota_usage',
    'billing_subscriptions',
    'billing_purchases',
    'project_entitlements',
    'billing_webhook_events',
    'supplier_confirmations',
    'mailbox_connections',
    'supplier_mail_deliveries'
  )
ORDER BY c.relname;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'organizations' AND column_name = 'subscription_plan')
    OR table_name = 'supplier_confirmations'
  )
ORDER BY table_name, column_name;

SELECT COUNT(*) AS project_rows, COUNT(DISTINCT id) AS distinct_project_ids
FROM import_projects;
```

`project_rows` must equal `distinct_project_ids`. Do not select email
addresses, tokens, message bodies, or OAuth rows into the PR or chat.

Baseline fingerprints are counts only:

```sql
SELECT
  (SELECT COUNT(*) FROM organizations) AS organizations,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM organization_members) AS members,
  (SELECT COUNT(*) FROM import_projects) AS projects,
  (SELECT COUNT(*) FROM supplier_offers) AS offers,
  (SELECT COUNT(*) FROM cost_calculations) AS cost_calculations;
```

On the disposable copy, after a successful `npx prisma migrate deploy`:

- `npx prisma migrate diff --exit-code --from-url "$COPY_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma` exits 0.
- All 23 manifest names are present, `finished_at` is not null, `rolled_back_at` is null, and checksums match.
- The seven new or altered objects exist.
- `mailbox_connections` and `supplier_mail_deliveries` have 0 rows.
- Counts of `organizations`, `users`, `organization_members`, `import_projects`, `supplier_offers`, and `cost_calculations` are unchanged.
- If `subscription_plan` was absent before the rehearsal, every organization row is `PRO` afterwards and the row count is unchanged. Record that promotion in the gate-B note. It is a behavior change for search quota, not a Gmail send.

### C — Staging deploy, Gmail still off

Owner approval required, and only after gate B passes on a backup of the
database you are about to change.

- Manual deploy of **this candidate’s commit SHA** to
  `jakov360-acceptance-staging` only.
- Auto-deploy stays off.
- Do not change `APP_ORIGIN`. It must remain
  `https://jakov360-acceptance-staging.onrender.com`.
- Do not set or rotate Gmail secrets in this gate.
- `JAKOV360_GMAIL_STAGING_ENABLED` stays unset or `false`.
- Deploying is not migration-safe by itself. If the start command runs
  `prisma migrate deploy`, the deploy **is** the live migration. Take a fresh
  backup immediately before that deploy even when gate B already passed, and
  keep the disposable rehearsal result attached to that backup’s schema.
- After deploy, health must be HTTP 200 on the staging origin. Repeat the
  read-only migration inventory. Do not open the OAuth consent screen.

### D — Allowlisted OAuth connect

Owner approval required. Separate from C.

Set staging-only values in the Render dashboard (never in git):

| Name | Required value at this gate |
| --- | --- |
| `JAKOV360_GMAIL_STAGING_ENABLED` | `true` only after this approval |
| `JAKOV360_GMAIL_CLIENT_ID` | OAuth client id of `JAKOV360 Gmail Staging` |
| `JAKOV360_GMAIL_CLIENT_SECRET` | matching client secret; do not paste it into chat, git, or logs |
| `JAKOV360_GMAIL_REDIRECT_URI` | `https://jakov360-acceptance-staging.onrender.com/api/mail/google/callback` |
| `JAKOV360_GMAIL_TOKEN_KEY_V1_B64` | new 32-byte key, base64url, generated by the operator |
| `JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID` | one UUID from the discovery query below |
| `JAKOV360_GMAIL_ACCEPTANCE_USER_IDS` | comma-separated UUIDs of designated owner/admin users, maximum 32 |
| `JAKOV360_GMAIL_TEST_RECIPIENTS` | **empty**. Empty blocks every send. |
| `APP_ORIGIN` | unchanged staging origin |
| `RENDER_SERVICE_ID` | platform value `srv-datu3v093c1s73c17m60`; do not override it |

The code refuses Gmail on any other `RENDER_SERVICE_ID`, including production.
It also refuses the staging service when `APP_ORIGIN` is not the staging
origin above. Local development is not a bypass: an empty or invalid
allowlist denies every user.

Discovery stays in an operator read-only session. Do not commit the result
or paste it into this PR. Replace the placeholder with the designated test
user’s own address:

```sql
SELECT u.id AS user_id, m.organization_id, m.role
FROM users u
JOIN organization_members m ON m.user_id = u.id
WHERE lower(u.email) = lower('<designated-test-user-email>')
  AND m.role IN ('OWNER', 'ADMIN');
```

Expect one organization. If the query returns more than one, stop and pick
explicitly; do not guess. Connect that user’s own Google test account once.
Do not send mail in this gate. Disconnect must remain available to that
tenant’s owner/admin even if the flag is later turned off.

### E — One controlled send

Owner approval required. Separate from D.

Set `JAKOV360_GMAIL_TEST_RECIPIENTS` to a single mailbox the operator owns.
Send one reviewed message to that address from the designated user. Do not
send to a supplier. Do not add `gmail.readonly`. A `PENDING` or `UNCERTAIN`
outbox row blocks retry; reconcile from the sender’s Sent mailbox using the
runbook in `docs/JAKOV360_CONNECTED_MAIL_PLAN.md`. Do not click send again.

## CI evidence this candidate must show

Workflow `CI` / job `validate`, on a pull request against
`cursor/supplier-confirmation-eaef`:

- PostgreSQL **18** service, then `npm run db:migrate:deploy` from an empty
  database (this proves the 23-folder chain applies cleanly; it does not see
  the live gap).
- `npx prisma migrate diff --exit-code` from that database to
  `prisma/schema.prisma`.
- Mail-security coverage inside `npm test` and the PostgreSQL integration
  gate, using synthetic Google responses only:
  - `tests/unit/gmail-acceptance-gate.test.ts` — allowlist fail-closed,
    including empty and invalid UUIDs.
  - `tests/unit/gmail-connect-oauth.test.ts` — staging service id, flag off,
    and foreign `APP_ORIGIN` rejected.
  - `tests/unit/gmail-credential-crypto.test.ts` — AES-256-GCM tamper failure.
  - `tests/unit/gmail-send-reconciliation.test.ts` — injected database failure
    after accept never returns `SENT` and does not retry.
  - `tests/integration/gmail-mailbox-connection.integration.test.ts` —
    encrypted storage and cross-tenant disconnect refusal.
  - `tests/integration/supplier-gmail-send.integration.test.ts` — one-shot
    send, stale approval, indeterminate lock, concurrent claim, unlisted
    admin, and zero-row confirmation update.

Record the candidate SHA and the Actions run URL in the PR after CI
finishes. An older green run on `69206059` or `94eca349` is history, not
this candidate’s CI.

## Stop conditions

Stop and leave the live database unchanged when any of these is true:

- The database name, host, or service id is not the acceptance staging target.
- Backup restore fingerprints differ from the live read-only counts.
- Any applied checksum differs from the manifest.
- Any `_prisma_migrations` row is unfinished or rolled back.
- The pending name set is not exactly the seven listed above.
- A relation or column that a pending migration creates already exists.
- `import_projects` has duplicate `id` values.
- Disposable `migrate deploy` or `migrate diff` exits non-zero.
- A rehearsal count of existing business tables changes.
- Someone proposes to import a dump into git or to run this on production.

Do not run `prisma migrate resolve` on the live database as a workaround.

## Rollback

- **Database:** restore the immutable backup taken immediately before the
  live migration. Dropping the new tables does not undo
  `subscription_plan = PRO`.
- **Code:** redeploy `6423d532` only when the database matches a schema that
  commit can read. Extra empty Gmail tables are ignored by that commit’s
  Prisma client. A half-applied migration with a failed history row is not a
  safe code rollback; restore the backup first.
- **Gmail:** set `JAKOV360_GMAIL_STAGING_ENABLED=false` and clear
  `JAKOV360_GMAIL_TEST_RECIPIENTS`. Existing connections stay disconnectable.
  Do not delete the token key until disconnected rows no longer need it.

## Residual risk

- The live schema and the deployed commit already disagree if the reported
  16-row history is still accurate. The running app’s Prisma schema includes
  `subscription_plan`, billing, and supplier confirmations. Queries that
  select those missing columns or tables can already be failing. Gate B must
  prove which objects are absent versus merely unrecorded.
- `supplier_search_quota` promotes every existing organization to `PRO`.
- Index builds lock `import_projects` and, later, `supplier_confirmations`.
  On this acceptance database that should be seconds, and requests against
  those tables can wait or error while it runs. It is still downtime for
  those requests. Schedule the live migrate when nobody is in a critical
  flow.
- Gmail remains incapable of sending while the flag is off and the recipient
  list is empty. A deploy that migrates does not by itself send mail. It
  does create the outbox tables.
- Production, public DNS, and `jakov360.com` are out of scope. The published
  privacy page is a prerequisite that the owner already verified; this PR
  does not republish it.

## Explicit non-actions in this preflight

This change does not merge a pull request, deploy Render, edit Render
environment variables, enable Gmail, read secrets, query production, query
the live acceptance database, restore a dump, run `prisma migrate deploy`
against staging, start OAuth, or send email.
