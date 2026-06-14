# ImportPilot URL Import Provider

Small standalone Node.js/TypeScript service that fetches supplier product URLs
and returns normalized preview data to ImportPilot. It exists for deployments
where the main ImportPilot app cannot make outbound HTTPS requests, for example
Windows or network policy failures such as `connect EACCES ...:443`.

The service reads supplier HTML only in memory. It does not persist raw HTML in
production.

## Run Locally

```powershell
cd services/importpilot-url-import-provider
npm install
Copy-Item .env.example .env
npm run dev
```

Default port: `4100`.

Configure the main ImportPilot `.env`:

```env
URL_IMPORT_PROVIDER_URL=http://localhost:4100/preview
URL_IMPORT_PROVIDER_TOKEN=dev-url-import-token
```

Use HTTPS for deployed providers.

## Production

```bash
npm install
npm run build
npm start
```

Cloud platforms usually inject `PORT`; local default is `4100`.

## API

### `GET /health`

Returns:

```json
{ "ok": true }
```

### `POST /preview`

If `URL_IMPORT_PROVIDER_TOKEN` is set, send:

```http
Authorization: Bearer <token>
```

Request:

```json
{
  "productUrl": "https://www.alibaba.com/product-detail/..."
}
```

Response:

```json
{
  "preview": {
    "productTitle": "65W GaN Charger",
    "supplierName": "Supplier Ltd",
    "price": "1746.90",
    "currency": "EUR",
    "minimumOrderQuantity": "1",
    "incoterm": null,
    "imageUrl": "https://...",
    "productUrl": "https://..."
  }
}
```

Error reasons:

- `NETWORK_ERROR`
- `BLOCKED`
- `PARSING_FAILED`
- `INVALID_URL`

## Supported URLs

- Alibaba product-detail URLs
- Made-in-China product URLs

## Debug HTML

Development only:

```env
URL_IMPORT_DEBUG_HTML=true
```

When enabled outside production, the service writes at most the first 300 KB of
HTML to the OS temporary directory and logs the file path. Keep disabled in
production.
