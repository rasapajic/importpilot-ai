# ImportPilot 1.0 — Release, Backup & Rollback Runbook

> Status: final verification. This document defines release gates; its presence does **not** mean ImportPilot 1.0 is released.

This runbook is intentionally limited to the frozen ImportPilot 1.0 core flow:
product + quantity + destination → supplier search → selected offer → landed cost/profitability → BUY / NEGOTIATE / WATCH / SKIP.
Google OAuth, document-vault/object-storage workflows, Android and other 2.0 capabilities are not 1.0 release blockers.

## 1. Exact release candidate

Before any production release:

1. Record the exact Git commit SHA.
2. Confirm the GitHub CI run for that exact SHA is green.
3. Confirm CI includes and passes:
   - production dependency audit;
   - search-provider production build gate;
   - Prisma client generation;
   - all migrations from an empty PostgreSQL 16 database;
   - Prisma migration/schema drift gate;
   - lint and TypeScript;
   - production-config preflight self-test;
   - PostgreSQL integration suite;
   - full unit/integration suite;
   - production build;
   - standalone built-app production smoke.
4. Record the previous known-good application commit/image for rollback.

Do not release from an unrecorded moving branch head.

## 2. Production configuration gate

Run the production config preflight in the target environment without printing secret values:

```bash
npm run check:production-config
```

A valid frozen-1.0 runtime requires:

- `DATABASE_URL`;
- `APP_ORIGIN` using the exact public HTTPS origin;
- supplier-search provider endpoint and `SUPPLIER_SEARCH_PROVIDER_TOKEN`;
- exact-page URL-import `/preview` endpoint and `URL_IMPORT_PROVIDER_TOKEN`.

The command must end with:

```text
IMPORTPILOT_PRODUCTION_CONFIG PASS
```

Secrets belong in the hosting provider secret store. Never commit real provider tokens or database credentials.

## 3. PostgreSQL backup before release

Create a fresh custom-format dump immediately before a production deploy:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="importpilot-predeploy-$(date +%Y%m%d-%H%M%S).dump"
```

Generate and record a checksum:

```bash
sha256sum importpilot-predeploy-*.dump
```

The backup must be stored outside the same runtime failure domain as the production database.
A backup that has never been restored successfully is not sufficient recovery evidence.

## 4. Restore drill before 1.0 release

Restore the fresh backup to an empty temporary PostgreSQL database, never over the live database:

```bash
createdb importpilot_restore_test
pg_restore \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --dbname="postgresql://.../importpilot_restore_test" \
  importpilot-predeploy-YYYYMMDD-HHMMSS.dump
```

Against the restored database verify at minimum:

- database connectivity;
- Prisma can read the restored schema;
- migration status is consistent;
- one existing user/session-related record can be read safely;
- one existing project and its supplier offers can be read;
- one existing cost calculation/decision history can be read.

Delete the temporary restore database after the verification result has been recorded.

## 5. Migration rules

Before deployment:

```bash
npx prisma migrate status
```

Production applies migrations only with:

```bash
npm run db:migrate:deploy
```

Never run any of the following against production:

- `prisma migrate dev`;
- `prisma db push`;
- destructive database reset/reseed;
- manual table edits used as a substitute for versioned migrations.

Migrations are treated as forward-only. If the new application fails after deployment, roll back the application first. Restore the database only if a migration demonstrably changed or damaged data in a way the previous application cannot safely read.

## 6. Provider readiness

Before final acceptance, from an environment that holds the real bearer tokens:

1. supplier-search provider `/health` must return HTTP 200 with the configured source healthy;
2. one bounded real supplier-search request must complete successfully or return a controlled documented failure;
3. URL-import provider `/preview` must accept a known supported supplier product URL and return evidence or a controlled partial/blocked result;
4. provider timeout, 401, 429, 502/504 and empty-result states must not produce an infinite browser loading state;
5. no missing commercial value may be fabricated to turn a partial result into a complete offer.

Provider health endpoints must remain authenticated. Do not weaken provider authentication for monitoring or testing.

## 7. Application health

Immediately before and after deployment:

```text
GET /api/health
```

Healthy requirement:

- HTTP 200;
- `status: "ok"`;
- `database: "ok"`.

Fail-closed requirement:

- if the database readiness query fails, `/api/health` returns HTTP 503 with `database: "error"`;
- no false healthy status is allowed when the application cannot use its database.

## 8. Final live acceptance

Perform the final acceptance on the exact candidate commit after deployment to the candidate environment.
At minimum verify:

### Authentication and session
- register a new email/password account;
- log out;
- log back in;
- invalid/expired session is rejected;
- repeated submit does not create duplicate unintended state.

### Tenant boundary
- Organization A cannot read or mutate Organization B project, offer, calculation or decision data.

### Supplier sourcing
Run controlled searches across multiple product categories and quantities, including the three primary destinations RS, AT and DE. Verify:

- user input stays product + quantity + destination;
- B2B sourcing happens internally;
- source provenance is visible/retained;
- explicit product-spec contradictions are filtered;
- duplicate offers are controlled;
- quantity-tier pricing is applied only when source-grounded;
- search timeout/empty/provider-failure returns a controlled state;
- exact-page enrichment never invents price, MOQ, image or Incoterm.

### Landed cost / profitability
Verify at least one scenario for each RS, AT and DE and include EUR plus non-EUR supplier currency paths (USD and CNY where suitable):

- fresh FX behavior;
- transport/customs confirmations;
- country-profile VAT behavior;
- EXW, FCA, FAS or FOB supported flow;
- CIF/CIP/DAP/DPU/DDP rejection where the 1.0 engine could double-count delivery costs;
- estimated vs confirmed wording;
- negative/poor-margin scenario;
- recalculation after changing commercial terms.

### Final decision
Verify that BUY / NEGOTIATE / WATCH / SKIP always refers to the currently selected offer and latest calculation. A stale project decision or incomplete offer must not appear as a new final recommendation.

### UX / localization
Verify SR Latin, DE and EN on desktop and narrow viewport:

- loading state is visibly active but does not invent progress percentages;
- disabled controls do not look like infinite loading;
- errors release loading state;
- refresh/back navigation does not corrupt the flow;
- partial offer can be completed;
- multiple offers can be selected before explicit continuation.

## 9. Rollback procedure

If health or final smoke fails after deployment:

1. stop further rollout;
2. record the failing release SHA and failure evidence;
3. redeploy the previous known-good application commit/image;
4. do **not** automatically restore the database;
5. recheck `/api/health`, login and one project read;
6. if the database is compatible with the previous application, keep the database and investigate the application regression;
7. restore the pre-deploy backup only if a migration/data change is proven incompatible or destructive.

After rollback, do not retry production deployment until the failure is reproduced, fixed, and the complete release gate is green again.

## 10. Release decision

ImportPilot 1.0 has only two states for this project phase:

- **HOLD / NOT RELEASED** — any required automated, runtime, live acceptance, backup/restore or rollback evidence is incomplete;
- **GO** — every blocking item is green on one exact candidate commit and the final live acceptance plus recovery drill are recorded.

A green CI run alone is never a GO decision.
