# ADR-001: Parser-first marketplace adapters for ImportPilot

- Status: Accepted
- Date: 2026-08-10
- Scope: Supplier discovery, product-page verification, normalization and TAJA analysis

## Context

ImportPilot sources offers from a small, known set of marketplaces: Alibaba, Made-in-China and 1688. Each source has a finite set of page types, repeated data structures and recurring failure modes such as anti-bot pages, incomplete search cards, quantity-tier pricing, product variants and conflicting marketing content.

This is materially different from RAMARA, where users can submit effectively unbounded document types, layouts, languages and scan qualities. ImportPilot should therefore rely on deterministic source-specific extraction wherever the marketplace exposes structured or repeatable data, and reserve AI for semantic interpretation and business decisions.

## Decision

ImportPilot uses a parser-first architecture.

### 1. One maintained adapter per marketplace

Each marketplace has its own adapter with explicit responsibilities:

- search-result discovery;
- canonical product URL resolution;
- exact product-page fetching;
- anti-bot and redirect detection;
- title, supplier, country, image and specification extraction;
- price tiers paired with their quantity intervals;
- MOQ, currency, Incoterm, variants and packaging extraction;
- source diagnostics and parser-health reporting.

The initial maintained adapters are:

- Alibaba adapter;
- Made-in-China adapter;
- 1688 adapter.

New marketplaces are not added until the existing adapters meet agreed extraction and monitoring thresholds.

### 2. Canonical normalized offer model

Every adapter maps source data into one canonical ImportPilot offer representation before ranking or AI analysis.

The normalized model must distinguish at least:

- product identity and canonical URL;
- supplier identity;
- product form: complete system, pump only, nozzles only, component, unclear;
- price tiers, including minimum and maximum quantity for each price;
- selected price tier for the requested quantity;
- MOQ and quantity compatibility;
- currency and Incoterm;
- product variants and kit contents;
- logistics and packaging evidence;
- source provenance and fetch timestamp;
- confidence and completeness.

A price must never be separated from the quantity interval to which it belongs.

### 3. Field-level evidence

Important fields should progressively carry evidence metadata:

- source URL;
- extraction method, such as JSON-LD, embedded JSON, HTML selector, search snippet or AI enrichment;
- fetch timestamp;
- confidence level;
- whether the value is direct, inferred, assumed or manually confirmed.

The exact product page is stronger evidence than a search card, cached discovery record or model-generated summary.

### 4. Deterministic validation before AI

Before TAJA receives an offer, deterministic logic validates:

- URL belongs to the claimed marketplace;
- page is a direct product/offer page;
- price and currency are paired;
- price tier matches the requested quantity;
- MOQ is compatible with the requested quantity;
- product-page result belongs to the same canonical product URL;
- obvious product-form conflicts are identified;
- incomplete or contradictory data is marked rather than guessed.

A weaker source may fill a missing field, but it must not overwrite stronger exact-page evidence.

### 5. TAJA is the interpretation and decision layer

TAJA receives normalized, source-grounded offers and is responsible for:

- matching the offer to the user's requested specification;
- distinguishing confirmed, likely and unconfirmed requirements;
- interpreting ambiguous product descriptions and variants;
- identifying supplier and commercial risk;
- calculating or reviewing landed-cost scenarios;
- ranking comparable offers;
- generating supplier questions for missing or contradictory data;
- explaining why an offer is recommended, demoted or excluded.

TAJA must not invent missing commercial data and must not treat an unsupported inference as a confirmed fact.

### 6. Authority order

When values conflict, the default authority order is:

1. manually confirmed supplier quotation or document;
2. exact, successfully parsed product page for the same canonical URL;
3. structured marketplace API or embedded page data;
4. marketplace search card;
5. cached discovery record;
6. AI extraction or inference from cited content;
7. planning assumption, clearly labelled as such.

### 7. Parser monitoring

Each adapter records operational metrics:

- fetch success rate;
- anti-bot rate;
- direct-page validation rate;
- parser field count;
- price-tier extraction rate;
- canonical URL resolution rate;
- percentage of offers with confirmed supplier, price, MOQ and image;
- sudden changes compared with the adapter's recent baseline.

A structural marketplace change should be detectable as a measurable parser-health regression.

## Consequences

### Positive

- Most extraction becomes deterministic, testable and inexpensive.
- One parser fix improves many products on the same marketplace.
- TAJA reasons over cleaner and more comparable data.
- AI cost is concentrated on ambiguity, interpretation and decisions.
- Source errors can be traced to a specific adapter and field.

### Trade-offs

- Each marketplace adapter requires maintenance when its HTML or embedded data changes.
- Browser-assisted or authenticated collection may still be necessary for anti-bot-protected pages.
- Contradictory listings can remain unresolved until the supplier confirms what is actually sold.
- Field-level evidence increases schema and persistence complexity.

## Implementation order

1. Finish Made-in-China extraction: quantity tiers, variants, specifications, packaging and supplier data.
2. Stabilize Alibaba direct product-page extraction and browser-assisted fallback.
3. Build the 1688 canonical offer resolver and Chinese product-page parser.
4. Introduce field-level evidence into the canonical offer model.
5. Add parser-health dashboards and regression fixtures for all three marketplaces.
6. Keep TAJA focused on requirement matching, ambiguity resolution, risk, landed cost and ranking.

## RAMARA boundary

This decision applies to ImportPilot marketplace sourcing. RAMARA remains an OCR- and AI-assisted open-document system because its input space is not limited to a small number of stable source layouts.