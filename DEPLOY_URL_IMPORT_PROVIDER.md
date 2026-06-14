# Deploy URL Import Provider

ImportPilot can use a separate URL import provider when local Windows or network
policy blocks outbound HTTPS with errors such as `connect EACCES ...:443`.

Deploy this service outside the local machine:

`services/importpilot-url-import-provider`

Recommended simple targets:

- Render
- Railway
- Fly.io
- Hetzner VPS
- Any small Ubuntu VPS

## Environment

Required:

```env
URL_IMPORT_PROVIDER_TOKEN=replace-with-a-long-random-token
```

Port:

```env
PORT=4100
```

On Render, Railway and Fly.io, use the platform-provided `PORT` if required. The
service defaults to `4100` when `PORT` is not set.

Optional development-only debug:

```env
URL_IMPORT_DEBUG_HTML=false
URL_IMPORT_TIMEOUT_MS=8000
URL_IMPORT_MAX_RESPONSE_BYTES=1000000
```

Do not enable `URL_IMPORT_DEBUG_HTML=true` in production.

## Health Check

Use:

```text
GET /health
```

Expected response:

```json
{ "ok": true }
```

## Production Commands

From `services/importpilot-url-import-provider`:

```bash
npm install
npm run build
npm start
```

## Docker

Build:

```bash
docker build -t importpilot-url-import-provider ./services/importpilot-url-import-provider
```

Run:

```bash
docker run --rm -p 4100:4100 \
  -e PORT=4100 \
  -e URL_IMPORT_PROVIDER_TOKEN=replace-with-a-long-random-token \
  importpilot-url-import-provider
```

## Render

For a click-by-click guide, see `DEPLOY_RENDER_STEP_BY_STEP.md`.

This repository also includes `render.yaml` for Render Blueprint deployment.

1. Create a new Web Service from the repository.
2. Set root directory:
   `services/importpilot-url-import-provider`
3. Build command:
   `npm install && npm run build`
4. Start command:
   `npm start`
5. Add environment variable:
   `URL_IMPORT_PROVIDER_TOKEN`
6. Health check path:
   `/health`

## Railway

This repository includes `railway.json` for Railway deployment.

1. Create a new service from the repository.
2. Set service root:
   `services/importpilot-url-import-provider`
3. Build command:
   `npm install && npm run build`
4. Start command:
   `npm start`
5. Add `URL_IMPORT_PROVIDER_TOKEN`.
6. Verify `/health`.

## Fly.io

Use the Dockerfile in the service directory.

Example:

```bash
cd services/importpilot-url-import-provider
fly launch
fly secrets set URL_IMPORT_PROVIDER_TOKEN=replace-with-a-long-random-token
fly deploy
```

Use `/health` as the health path.

## Ubuntu VPS

```bash
sudo apt update
sudo apt install -y nodejs npm git
git clone <repo-url>
cd <repo>/services/importpilot-url-import-provider
npm install
npm run build
URL_IMPORT_PROVIDER_TOKEN=replace-with-a-long-random-token PORT=4100 npm start
```

For production, run it behind Nginx/Caddy with HTTPS and a process manager such
as `systemd` or `pm2`.

## Preview Test

Replace domain and token:

```bash
curl -X POST https://provider-domain/preview \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"productUrl\":\"https://www.alibaba.com/product-detail/...\"}"
```

Possible good outcomes:

- `200` with `preview` fields such as title, supplier, price, MOQ and image.
- A clear reason such as `BLOCKED`, `PARSING_FAILED`, `INVALID_URL` or
  `NETWORK_ERROR`.

## Configure ImportPilot

In the main ImportPilot app:

```env
URL_IMPORT_PROVIDER_URL=https://provider-domain/preview
URL_IMPORT_PROVIDER_TOKEN=replace-with-a-long-random-token
```

Restart the ImportPilot app after changing environment variables.

## Deployment Checklist

- `/health` returns `{ "ok": true }`.
- `/preview` accepts a valid token and rejects missing/wrong tokens.
- Alibaba product-detail URL returns data or a clear blocked/network reason.
- Made-in-China product URL returns data or a clear blocked/network reason.
- ImportPilot diagnostics show:
  `externalProviderUsed=true`.
- ImportPilot uses:
  `URL_IMPORT_PROVIDER_URL=https://provider-domain/preview`.
- Manual fallback still works when preview is blocked or unavailable.
- `URL_IMPORT_DEBUG_HTML` is disabled in production.
