# Render Deployment: URL Import Provider

This guide deploys the ImportPilot URL Import Provider to Render so it can fetch
supplier pages outside the local Windows/network environment.

Service location:

```text
services/importpilot-url-import-provider
```

## 1. Create Render Account

1. Open `https://render.com`.
2. Click `Get Started`.
3. Sign in with GitHub.

Screenshot placeholder:

```text
[SCREENSHOT 1: Render sign up / login screen]
```

## 2. Connect GitHub

1. In Render dashboard, click `New +`.
2. Choose `Web Service`.
3. Connect your GitHub account if Render asks for permission.

Screenshot placeholder:

```text
[SCREENSHOT 2: Render New Web Service and GitHub connection]
```

## 3. Choose Repository

1. Select the ImportPilot repository.
2. Click `Connect`.

Screenshot placeholder:

```text
[SCREENSHOT 3: Repository selection]
```

## 4. Set Service Root

Use these settings:

```text
Name: importpilot-url-import-provider
Root Directory: services/importpilot-url-import-provider
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm start
Health Check Path: /health
```

Screenshot placeholder:

```text
[SCREENSHOT 4: Render service settings with root directory]
```

## 5. Set Environment Variables

Add:

```env
NODE_ENV=production
URL_IMPORT_PROVIDER_TOKEN=change-this-token
URL_IMPORT_DEBUG_HTML=false
URL_IMPORT_TIMEOUT_MS=8000
URL_IMPORT_MAX_RESPONSE_BYTES=1000000
```

Important:

- Replace `change-this-token` with a long random token.
- Keep the same token for ImportPilot.
- Do not enable `URL_IMPORT_DEBUG_HTML=true` in production.

Screenshot placeholder:

```text
[SCREENSHOT 5: Render environment variables]
```

## 6. Deploy

1. Click `Create Web Service`.
2. Wait for the build to finish.
3. Render should show the service as live.

Screenshot placeholder:

```text
[SCREENSHOT 6: Successful Render deploy logs]
```

## 7. Copy Provider URL

Render will give you a URL similar to:

```text
https://importpilot-url-import-provider.onrender.com
```

Your preview endpoint is:

```text
https://importpilot-url-import-provider.onrender.com/preview
```

Screenshot placeholder:

```text
[SCREENSHOT 7: Render service URL]
```

## 8. Paste Into ImportPilot `.env`

In the main ImportPilot app `.env`:

```env
URL_IMPORT_PROVIDER_URL=https://importpilot-url-import-provider.onrender.com/preview
URL_IMPORT_PROVIDER_TOKEN=change-this-token
```

Restart ImportPilot after changing `.env`.

Screenshot placeholder:

```text
[SCREENSHOT 8: ImportPilot .env values]
```

## 9. Verify Health

Replace the domain:

```bash
curl https://importpilot-url-import-provider.onrender.com/health
```

Expected:

```json
{ "ok": true }
```

## 10. Verify Preview

Replace domain, token and product URL:

```bash
curl -X POST https://importpilot-url-import-provider.onrender.com/preview \
  -H "Authorization: Bearer change-this-token" \
  -H "Content-Type: application/json" \
  -d "{\"productUrl\":\"https://www.alibaba.com/product-detail/...\"}"
```

Good outcomes:

- `200` with product data.
- `423` with `BLOCKED`.
- `422` with `PARSING_FAILED` or `INVALID_URL`.
- `502` with `NETWORK_ERROR`.

If Render can fetch the page but Alibaba blocks automation, ImportPilot will
still keep manual fallback available.

## 11. Verify ImportPilot Uses Provider

Run from the main ImportPilot project:

```bash
npm run diagnose:url-import -- --url "https://www.alibaba.com/product-detail/..."
```

Look for:

```text
externalProviderConfigured: true
externalProviderUsed: true
providerUrl: https://importpilot-url-import-provider.onrender.com/preview
```

## Troubleshooting

### 401 Token Missing

Cause:

- `URL_IMPORT_PROVIDER_TOKEN` is set on Render.
- Request did not include `Authorization: Bearer <token>`.
- ImportPilot token does not match Render token.

Fix:

- Copy the exact same token into Render and ImportPilot.
- Restart ImportPilot after changing `.env`.

### 502 Fetch Blocked

Cause:

- Provider is live, but upstream supplier site blocked or rejected the request.
- Network access from the cloud region is restricted.

Fix:

- Try a Made-in-China URL.
- Try another product URL.
- Keep manual fallback available.
- If all supplier sites fail, move provider to another region/VPS.

### Build Failed

Check:

- Root Directory is exactly:
  `services/importpilot-url-import-provider`
- Build Command is:
  `npm install && npm run build`
- Start Command is:
  `npm start`

### Wrong Root Directory

Symptom:

- Render cannot find `package.json`.

Fix:

- Set Root Directory to:
  `services/importpilot-url-import-provider`

### Health Check Fails

Check:

- Health path is `/health`.
- Service logs say `server_listening`.
- Render assigned a `PORT`; the service reads it automatically.

