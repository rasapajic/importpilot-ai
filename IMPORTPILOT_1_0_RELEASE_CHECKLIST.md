# ImportPilot 1.0 release checklist

This checklist is the final release gate. A release is **GO** only when every blocking item below is confirmed on the exact release head.

## 1. Automated gates

- [ ] GitHub CI is green on the exact release head.
- [ ] Production dependency audit reports no production-reachable HIGH or CRITICAL vulnerability.
- [ ] Prisma client generation succeeds.
- [ ] All database migrations apply from an empty PostgreSQL database.
- [ ] Lint passes with zero errors.
- [ ] TypeScript typecheck passes.
- [ ] Production configuration preflight passes with production-shaped values.
- [ ] Unit and PostgreSQL integration suites pass, including tenant-isolation tests.
- [ ] `next build` succeeds in production mode.

## 2. Before production deploy

- [ ] Record the exact Git commit SHA being released.
- [ ] Create and verify a PostgreSQL backup.
- [ ] Create and verify the object-storage backup/snapshot or provider recovery point.
- [ ] Confirm the previous known-good application image/commit is available for rollback.
- [ ] Confirm production secrets are stored only in the hosting platform secret store, never in Git.
- [ ] Run `npm run check:production-config` against the production environment without printing secret values.

## 3. Infrastructure and health

- [ ] Deploy database migrations before or atomically with the application according to the rollback runbook.
- [ ] `/api/health` returns HTTP 200 after deploy.
- [ ] A deliberately unavailable database causes `/api/health` to fail with HTTP 503 in a controlled test environment.
- [ ] Search provider and URL-import provider are reachable with their production bearer tokens.
- [ ] Private object storage accepts authorized upload/download and does not permit anonymous bucket access.

## 4. Authentication

- [ ] Email/password registration creates one user, one company workspace and OWNER membership.
- [ ] Email/password login succeeds and logout invalidates only the active session.
- [ ] Password show/hide control works on login and registration.
- [ ] Failed auth requests stop and show a controlled error; no infinite spinner.
- [ ] Google OAuth button is enabled only when Google credentials are configured.
- [ ] Google sign-in succeeds for a new Google user.
- [ ] Google sign-in with a verified email matching an existing ImportPilot user links to that user instead of creating a duplicate.
- [ ] OAuth callback rejects invalid state and unverified Google email.

## 5. Tenant isolation

- [ ] User A cannot read, update or delete User B / Organization B projects.
- [ ] Offers, calculations, documents, decisions, timelines and negotiation messages remain organization-scoped.
- [ ] A document download URL cannot be generated across tenants.
- [ ] Client-supplied IDs never override the authenticated organization boundary.

## 6. Supplier sourcing smoke

Run only one controlled paid/live test unless a failure requires a repeat.

- [ ] Create a new sourcing project with product, target country and quantity.
- [ ] Cached project reopening does not trigger a paid live search.
- [ ] Explicit live search is bounded and terminates with results or a controlled timeout/error.
- [ ] Results show source provenance and distinguish complete products from components.
- [ ] MOQ conflicts cannot be promoted as top recommendations.
- [ ] Made-in-China URL import returns a reviewed preview for a known supported product URL.
- [ ] Alibaba URL import either returns evidence or a controlled blocked/partial state; it must not fabricate commercial data.
- [ ] 1688 recovery never presents mirror/agent commercial data as native 1688 evidence.

## 7. Landed cost and decision safety

- [ ] RS, AT and DE country-profile calculations produce deterministic results.
- [ ] Unconfirmed transport/customs data keeps the calculation in `NEEDS_REVIEW` where required.
- [ ] An unsupported country cannot silently produce a final trusted landed-cost decision from guessed tax/customs inputs.
- [ ] Negative, malformed and out-of-range cost inputs are rejected.
- [ ] The UI clearly distinguishes estimated/preliminary cost from confirmed landed cost.
- [ ] A recommendation cannot become FINAL while mandatory landed-cost, supplier-verification or risk evidence is missing.

## 8. Documents and user-visible failure handling

- [ ] Upload, view/download and delete a test document successfully.
- [ ] A failed external provider request returns a controlled message and releases the loading state.
- [ ] Registration, login, supplier search, URL import and profitability check cannot spin indefinitely.
- [ ] No raw HTML error page or raw parser exception is shown to the user.
- [ ] Production logs contain useful event/reason metadata without passwords, OAuth secrets, provider tokens or document contents.

## 9. Rollback drill

- [ ] Review `IMPORTPILOT_1_0_BACKUP_ROLLBACK.md` before release.
- [ ] Confirm who can redeploy the previous known-good commit/image.
- [ ] Confirm database rollback policy for the release migration set.
- [ ] Confirm backup restore commands/credentials are available to the operator.

## 10. Release decision

Release status is one of:

- **GO** — every blocking item is green, including real Google OAuth smoke and exact-head CI.
- **HOLD** — an external credential/provider step is incomplete but code is otherwise healthy.
- **NO-GO** — any correctness, tenant-isolation, auth, migration, production dependency, landed-cost or rollback blocker remains.

Do not merge/release because a feature merely appears to work in the browser. The exact release head, automated gates, one controlled production-shaped smoke pass and rollback readiness must all agree.
