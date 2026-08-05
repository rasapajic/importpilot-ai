# ImportPilot Search Provider

Separate lightweight Node.js/TypeScript service that supplies structured,
validated supplier-search results to ImportPilot. It does not search inside the
main application and never persists raw HTML.

The primary source is **TAJA live web search** through the OpenAI Responses API
with the built-in web-search tool. Alibaba and Made-in-China direct adapters
remain bounded fallbacks. The chain stops on the first source that returns
usable results.

TAJA accepts only direct HTTPS product pages that also occur in the web-search
sources/citations returned by OpenAI. Supplier names, URLs, prices, currencies,
MOQ values and Incoterms are never invented. Unconfirmed optional values remain
`null`.

## Run locally

```powershell
cd services/importpilot-search-provider
npm install
npm run start
```

`npm run start` and `npm run dev` automatically load the service-local `.env`
file. Set `SEARCH_PROVIDER_TOKEN` there and use the same value in the root
ImportPilot `.env`.

For watch mode:

```powershell
npm run dev
```

The service listens on `http://localhost:4000` by default.

## Enable TAJA real web search

Create an OpenAI API key for the server-side project and add it only to:

```text
services/importpilot-search-provider/.env
```

Example configuration:

```env
OPENAI_API_KEY=your-server-side-api-key
OPENAI_SEARCH_MODEL=gpt-5
OPENAI_SEARCH_MAX_RESULTS=10
UPSTREAM_TIMEOUT_MS=90000
```

Do not expose the API key through `NEXT_PUBLIC_*`, browser code, screenshots or
Git history. The OpenAI request uses `store: false`. The model is configurable
so production can switch to another Responses-API model without code changes.

If `OPENAI_API_KEY` is missing, the OpenAI source is disabled and the provider
continues with Alibaba and Made-in-China.

To capture a real Made-in-China response while adapting the parser:

```powershell
# Set SEARCH_PROVIDER_DEBUG_HTML=true in the service-local .env, then:
npm run dev
```

In development only, the provider saves at most the first 300 KB of each
Made-in-China HTML response in the operating-system temporary directory and
logs `html_saved=true` with `file_path`. Keep this option disabled during
normal use and in production.

Configure the ImportPilot application:

```env
SUPPLIER_SEARCH_PROVIDER_URL=http://localhost:4000/search
SUPPLIER_SEARCH_PROVIDER_HEALTH_URL=http://localhost:4000/health
SUPPLIER_SEARCH_PROVIDER_TOKEN=change-this-search-provider-token
SUPPLIER_SEARCH_PROVIDER_TIMEOUT_MS=100000
SUPPLIER_SEARCH_PROVIDER_MAX_ATTEMPTS=1
```

Use HTTPS outside local development.

## API

All endpoints require:

```http
Authorization: Bearer <SEARCH_PROVIDER_TOKEN>
```

### `POST /search`

Preferred request:

```json
{
  "productQuery": "3MP PTZ camera",
  "quantity": 100,
  "targetCountry": "RS",
  "language": "sr"
}
```

For compatibility with the current ImportPilot adapter, `query` is accepted as
an alias for `productQuery`, and `language` defaults to `en`.

Successful response:

```json
{
  "results": [{
    "title": "3MP PTZ Camera",
    "supplierName": "Supplier Ltd",
    "supplierCountry": "CN",
    "price": 25,
    "currency": "USD",
    "minimumOrderQuantity": 50,
    "incoterm": "FOB",
    "productUrl": "https://supplier.example/ptz",
    "imageUrl": "https://supplier.example/ptz.jpg",
    "source": "TAJA web · supplier.example"
  }]
}
```

If no real source is implemented:

```json
{
  "results": [],
  "reason": "No real supplier-search source is configured."
}
```

Unknown response fields, raw HTML, malformed URLs and incomplete price/currency
pairs are rejected.

### `GET /health`

Returns source-chain health and whether at least one real source is implemented.
The endpoint does not spend an OpenAI search call merely to validate the API
key; an invalid key is reported by the first actual search and the fallback
chain then continues.

## TAJA source guarantees

- OpenAI web search is mandatory for every TAJA source call.
- Structured Outputs constrain the response to the existing supplier-offer
  contract.
- A returned `productUrl` is accepted only when the same normalized direct page
  is present in the response's web-search sources or URL citations.
- Homepages, category pages, ordinary search pages and non-HTTPS URLs are
  rejected.
- Duplicate product URLs are removed.
- Semantic relevance is trusted for this source so Serbian and German requests
  can match English supplier titles without being discarded by a lexical
  filter.
- Up to ten verified results can be returned. Direct providers remain limited
  and lexically ranked.
- Token usage, cited-source count and accepted-result count are logged without
  logging the API key.

## Implement another real source

Implement `SupplierSearchSource` from `src/provider.ts` and pass it to
`createSearchProviderApp` in `src/server.ts`. The source receives validated
search input and an `AbortSignal`, and must return only structured result data.
Set `trustedRelevance: true` only when that source already performs reliable
semantic product matching.

Security controls included:

- bearer token authentication
- in-memory IP rate limiting
- upstream timeout signal
- 100 KB request-body limit
- strict request and provider-response validation
- no raw HTML persistence during normal operation
- server-only OpenAI credentials

Search resilience:

- TAJA OpenAI web search is attempted first when configured.
- Alibaba gets a short bounded attempt after TAJA returns no verified pages or
  fails.
- Made-in-China retries up to three deterministic query variants, including
  normalized English purchasing terms for common Serbian/German queries.
- Normalized variants use both the SEO hot-products endpoint and Made-in-China's
  direct multi-search endpoint, with at most five bounded attempts total.
- Standard result cards and marketplace-provided related-result cards are
  parsed. If a related card omits the legal company name, the real Made-in-China
  supplier storefront hostname is returned instead of inventing a name.
- Each upstream attempt, the complete provider chain, and the ImportPilot HTTP
  client have separate finite timeout budgets.

## Alibaba fallback limitations

- Alibaba may block automated requests, require CAPTCHA verification, or return
  region-specific markup. In those cases the service continues to the next
  source with a clear internal reason.
- The parser intentionally reads only embedded structured JSON. It does not use
  a browser, bypass anti-bot controls, or persist raw HTML.
- Alibaba can change its response format without notice. Fixture-based tests
  protect the known format, but a future format change may produce empty
  results until the parser is updated.
- Price ranges use the first numeric value as the normalized unit price.
- Currency symbols are normalized to ISO codes: `$`/`US$` to `USD`, `€` to
  `EUR`, `£` to `GBP`, and `¥`/`CN¥` to `CNY`.
- Missing MOQ, Incoterm, product URL or image URL are never invented. Offers
  without a usable Alibaba product URL are excluded; other missing fields are
  returned as `null`.
- Live network tests are deliberately excluded. Tests use only saved fixture
  HTML.

## Made-in-China fallback limitations

- Made-in-China is called only when earlier sources return no usable results,
  are blocked, or fail.
- It may also return anti-bot pages or change its markup without notice.
- The adapter intentionally parses embedded structured JSON only. It does not
  bypass anti-bot controls. It also reads the live server-rendered
  `list-node` product-card structure.
- Empty, redirect and JavaScript-only responses return and development-log a
  specific reason instead of being reported as ordinary zero-result searches.
- Raw HTML is never persisted during normal operation. The explicit
  `SEARCH_PROVIDER_DEBUG_HTML=true` development option may temporarily save
  only the first 300 KB to the operating-system temporary directory.
- Missing MOQ, Incoterm and images remain `null`; no values are invented.
- The shared provider timeout and rate limit remain active across the fallback
  chain.
- Tests use saved fixture HTML only. There are no live network tests.

## Diagnose and verify

From the repository root, while the application and provider are running:

```powershell
npm run diagnose:supplier-search
```

The diagnostic output reports whether TAJA OpenAI web search is configured,
which model name is selected, the provider source chain and the end-to-end
result count. It never prints the API key.

Provider checks:

```powershell
cd services/importpilot-search-provider
npm run typecheck
npm test
```
