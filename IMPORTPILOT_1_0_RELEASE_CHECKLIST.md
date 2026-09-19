# ImportPilot 1.0 — Final Release Checklist

> Default state is **HOLD / NOT RELEASED**. A green CI run is necessary but not sufficient.

All blocking items below must be confirmed on one exact release candidate commit before GO.

## A. Exact-head automated gates

- [ ] Record exact candidate commit SHA.
- [ ] Production dependency audit has no production-reachable HIGH/CRITICAL finding.
- [ ] Search-provider production build/test gate passes.
- [ ] Prisma client generation passes.
- [ ] All migrations apply from an empty PostgreSQL 16 database.
- [ ] Prisma migration/schema drift gate passes with zero diff.
- [ ] Lint passes with zero errors.
- [ ] TypeScript passes.
- [ ] Production-config preflight passes, including Google OAuth credentials/callback contract.
- [ ] PostgreSQL integration suite passes.
- [ ] Full unit/integration suite passes.
- [ ] Production build passes.
- [ ] Built standalone-app production smoke passes.

## B. Database and recovery

- [ ] `prisma migrate status` is clean on the candidate database.
- [ ] Fresh PostgreSQL custom-format backup created.
- [ ] Backup SHA-256 recorded.
- [ ] Backup stored outside the production DB failure domain.
- [ ] Restore drill succeeds into a temporary empty database.
- [ ] Restored DB can read user, project, offer, calculation and decision history.
- [ ] Previous known-good application commit/image is recorded and deployable.
- [ ] Operator has reviewed `RELEASE_1_0_RUNBOOK.md`.

## C. Public domain, DNS and TLS

- [ ] Public domain is `jakov360.com` and resolves to the intended production service.
- [ ] Namecheap Registrant/WHOIS contact verification for `jakov360.com` is completed before GO.
- [ ] Namecheap account shows no pending contact-verification, suspension or hold state for `jakov360.com`.
- [ ] `jakov360.com` and `www.jakov360.com` are verified by the hosting provider.
- [ ] HTTPS certificate is issued and valid for the public production domain.
- [ ] Production Google OAuth origin/callback uses the verified `https://jakov360.com` origin.
- [ ] Domain/DNS/SSL state is rechecked immediately after the final production deploy.

## D. Authentication, Google Sign-In, session and tenant boundary

- [ ] New email/password registration succeeds.
- [ ] Email/password login succeeds.
- [ ] Google OAuth web client is configured with the exact candidate `APP_ORIGIN` and `/api/auth/google/callback` redirect URI.
- [ ] Google button is enabled on login and registration in the candidate environment.
- [ ] New Google identity with `email_verified=true` creates one user and one OWNER workspace and opens the dashboard.
- [ ] Google sign-in whose verified email matches an existing ImportPilot user links to that user and does not create a duplicate user/workspace.
- [ ] Google callback rejects missing/mismatched state.
- [ ] Google profile with unverified email is rejected.
- [ ] Cancelled/failed Google authorization returns a controlled localized auth error.
- [ ] Logout invalidates the active session.
- [ ] Expired/invalid session is rejected.
- [ ] Same-origin/CSRF behavior works behind the real proxy/origin.
- [ ] Organization A cannot read or mutate Organization B project.
- [ ] Organization A cannot create/update/delete Organization B offer.
- [ ] Organization A cannot calculate Organization B offer.
- [ ] Organization A cannot generate/read Organization B decision.

## E. Runtime health

- [ ] Candidate `/api/health` returns 200 and DB `ok`.
- [ ] Controlled DB-readiness failure returns `/api/health` 503.
- [ ] Cold start reaches healthy state within an acceptable bounded time.
- [ ] No false healthy status while DB is unavailable.

## F. Supplier search / TAJA live matrix

From an environment holding the real provider bearer tokens:

- [ ] Authenticated supplier-provider `/health` returns 200.
- [ ] Electronics case returns relevant supplier results.
- [ ] Packaging case returns relevant supplier results.
- [ ] Household/general-goods case returns relevant supplier results.
- [ ] RS destination case passes.
- [ ] AT destination case passes.
- [ ] DE destination case passes.
- [ ] Quantity is preserved and quantity-tier evidence is source-grounded.
- [ ] Internal B2B query expansion works without changing the simple user intake.
- [ ] Raw-query fallback remains bounded.
- [ ] Explicit connector/form/length/power contradictions are filtered.
- [ ] Duplicate results are controlled.
- [ ] Source provenance is retained.
- [ ] Timeout/provider failure/empty result returns controlled UI state.
- [ ] Repeated request/idempotency behavior does not duplicate paid work unexpectedly.

Use `npm run test:live-acceptance` for the provider-level matrix, with real environment secrets and `IMPORTPILOT_ACCEPTANCE_PRODUCT_URL` set to a currently valid supported supplier product page.

## G. Exact-page enrichment

- [ ] Known supported product URL reaches URL-import provider.
- [ ] Title/product identity is evidence-based.
- [ ] Supplier is evidence-based when available.
- [ ] Price and currency are paired or both remain unknown.
- [ ] MOQ remains unknown if not verified.
- [ ] Image remains unknown if not verified.
- [ ] Incoterm remains unknown if not verified.
- [ ] Unsupported/blocked page produces controlled partial/blocked state.
- [ ] Unsupported pages do not consume the supported enrichment budget.
- [ ] No missing commercial field is fabricated.

## H. Landed cost / profitability live matrix

- [ ] Serbia (`RS`) scenario.
- [ ] Austria (`AT`) scenario.
- [ ] Germany (`DE`) scenario.
- [ ] EUR supplier currency scenario.
- [ ] USD supplier currency scenario.
- [ ] CNY supplier currency scenario.
- [ ] Fresh FX is used where required.
- [ ] Missing/failing fresh FX fails closed rather than using an unsafe stale approximation.
- [ ] EXW flow.
- [ ] FCA flow.
- [ ] FAS or FOB flow.
- [ ] CIF/CIP/DAP/DPU/DDP is rejected when 1.0 cannot prevent transport double counting.
- [ ] Transport/customs confirmations affect confidence/status correctly.
- [ ] Country VAT profile is correct: RS 20%, AT 20%, DE 19% unless manually and explicitly overridden where allowed.
- [ ] Estimated/preliminary wording is distinct from confirmed landed cost.
- [ ] Negative/poor-margin case behaves correctly.
- [ ] Recalculation after commercial-term changes updates results.

## I. Final decision safety

- [ ] BUY refers to current selected offer and latest calculation.
- [ ] NEGOTIATE refers to current selected offer and latest calculation.
- [ ] WATCH refers to current selected offer and latest calculation.
- [ ] SKIP refers to current selected offer and latest calculation.
- [ ] Stale project decision cannot mask a newly selected offer.
- [ ] Incomplete commercial data cannot become a false final recommendation.
- [ ] Recalculation changes the decision when economics materially change.

## J. UX and localization

- [ ] SR Latin complete core flow, including Google auth labels/errors.
- [ ] DE complete core flow, including Google auth labels/errors.
- [ ] EN complete core flow, including Google auth labels/errors.
- [ ] Desktop viewport.
- [ ] Narrow/mobile viewport.
- [ ] Search loading state is visibly active and bounded.
- [ ] No fake percentage/stage claims.
- [ ] Disabled controls use disabled semantics and do not look like endless loading.
- [ ] Error states release loading state.
- [ ] Refresh/back navigation does not corrupt selection/calculation state.
- [ ] Rapid/double submit does not create unintended duplicates.
- [ ] Partial offer recovery opens exact commercial-term form.
- [ ] Multiple offers can be selected before explicit continuation.

## K. Final live E2E

On the exact deployed candidate:

1. register/sign in with Google and confirm dashboard access;
2. verify Google sign-in links an existing same-email user without duplication;
3. create sourcing request;
4. receive real supplier results;
5. inspect/enrich finalist;
6. choose offer;
7. complete missing commercial terms if necessary;
8. calculate landed cost/profitability;
9. receive BUY / NEGOTIATE / WATCH / SKIP;
10. refresh and reopen project;
11. confirm persisted state is consistent;
12. logout/login and confirm state remains correct;
13. verify `/api/health` still returns 200.

- [ ] Final E2E PASS recorded with candidate SHA and date.

## L. GO / HOLD rule

**GO** only when every blocking item above is checked on the same exact candidate and recovery evidence exists.

Anything incomplete, ambiguous or only assumed means **HOLD / NOT RELEASED**.
