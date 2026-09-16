# ImportPilot 1.0 — Render staging

The staging Blueprint is intentionally isolated from the existing Render services.
It creates only:

- `importpilot-1-0-staging`
- `importpilot-staging-db`

It reuses the existing `importpilot-search-provider` service and reads its public
Render URL and `SEARCH_PROVIDER_TOKEN` through Render service references. No
OpenAI key is duplicated in the staging Blueprint.

It also reuses the existing `importpilot-url-import-provider` for bounded exact-page
enrichment of the supplier finalists. The staging app calls the provider's
`/preview` endpoint and reads its `URL_IMPORT_PROVIDER_TOKEN` through a Render
service reference. This allows already-discovered Made-in-China and Alibaba
product pages to fill verifiable fields such as price, MOQ and product image
without inventing missing commercial data.

## One-time bootstrap

1. In the Render Dashboard open **New → Blueprint**.
2. Connect `rasapajic/importpilot-ai` and select branch `main`.
3. Set **Blueprint Path** to `render.staging.yaml`.
4. Review the two new staging resources and deploy the Blueprint.

After the first Blueprint instance exists, pushes to `main` that change
`render.staging.yaml` can be synced by Render. The web service waits for GitHub
checks (`autoDeployTrigger: checksPass`) before code auto-deploys.

## Expected staging URL

Render will create the web service using the name `importpilot-1-0-staging`.
Its health endpoint is:

`https://importpilot-1-0-staging.onrender.com/api/health`

A healthy response must return HTTP 200 and report `database: "ok"`.

## Database migrations

The staging web service uses the Free compute plan. Render pre-deploy commands
are not available on Free web services, so the start command first runs
`prisma migrate deploy` and then starts Next.js. Prisma migrations are
idempotent, so service restarts are safe.

## Staging limits

The Free Render Postgres database is for staging only. It has Render's Free
Postgres limits, including expiration after 30 days. It must not be treated as
a production database.

Document/object storage is deliberately disabled in this staging Blueprint
because the frozen ImportPilot 1.0 core flow does not expose the document-vault
workspace. Supplier search, exact-page enrichment, projects,
landed-cost/profitability, and decisions are the staging gate.
