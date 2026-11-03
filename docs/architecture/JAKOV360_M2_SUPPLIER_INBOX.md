# JAKOV360 M2 — in-app supplier inbox (design only)

- Status: Proposal for owner decision. Not accepted, not implemented.
- Date: 2026-10-28
- Issue: [#179](https://github.com/rasapajic/importpilot-ai/issues/179)
- Aligns with: [#178](https://github.com/rasapajic/importpilot-ai/issues/178) product vision, [#180](https://github.com/rasapajic/importpilot-ai/issues/180) Core v1 launch gates
- Parallel to, and separate from: draft PR [#177](https://github.com/rasapajic/importpilot-ai/pull/177) (comparison UX), [#174](https://github.com/rasapajic/importpilot-ai/issues/174) / draft PR [#175](https://github.com/rasapajic/importpilot-ai/pull/175) (Gmail send-only staging)
- This document authorizes no DNS change, OAuth scope, migration, provider account, Render change, email send, or email receive.

## Recommendation

Use a **dedicated reply subdomain and an authenticated inbound webhook** as the only Core v1 way replies enter JAKOV360. Give every approved RFQ a unique, unguessable `Reply-To` on that subdomain. Keep the existing M1 `gmail.send` integration as an optional way to send *from* the user’s Gmail. Do not add `gmail.readonly` for Core v1.

That choice is the decision this proposal asks the owner to make. A yes does not approve a vendor, a DNS record, a scope, a migration, or a deploy. Those stay behind the later gates in [#179](https://github.com/rasapajic/importpilot-ai/issues/179) milestones C–E and [#180](https://github.com/rasapajic/importpilot-ai/issues/180).

Marketplace chats (Alibaba, Made-in-China, 1688) stay a manual paste or file import until a permitted provider API exists. The inbox must label that import as user-supplied.

## Why this is a Core v1 item

[#180](https://github.com/rasapajic/importpilot-ai/issues/180) promises that JAKOV360 receives replies in the app, checks them, and shows an evidence-backed landed cost. [#178](https://github.com/rasapajic/importpilot-ai/issues/178) requires a written supplier quote to stay distinct from an advertised listing price, an estimate, a carrier quote, and an official duty rate.

M1 requests `gmail.send` only. That scope can send a message the user has approved. It cannot list, watch, or read a reply. A send-only mailbox connection therefore cannot fill the Supplier Inbox. The connected-mail plan already records the same limit: reading replies would be a later, restricted-scope milestone, and a header match is only a candidate link, never a confirmed quotation.

The live privacy page on `main` (18 September 2026) still says ImportPilot does not request Gmail access. That sentence stays true until a reviewed privacy change ships with a feature that is actually enabled. This proposal does not edit that page.

## Transport comparison

| | (1) Reply subdomain + inbound webhook | (2) Consented Gmail inbox read | Marketplace chat |
| --- | --- | --- | --- |
| What it captures | Mail addressed to the per-thread Reply-To | Mail that actually lands in the connected Gmail | Nothing, until a permitted API or a user import |
| Google scope | None for receiving | `gmail.readonly` (restricted). `gmail.metadata` is also restricted and still omits the body and attachments | None |
| Launch obligation | Provider contract, subdomain MX, privacy/retention text, webhook authentication | Sensitive-scope work already implied by `gmail.send`, plus restricted-scope verification and a paid security assessment if message content is stored or transmitted on our servers | A real provider integration, separately approved |
| Tenant binding | Unguessable token we issued. The webhook payload does not choose the organization | Gmail thread id plus RFC In-Reply-To, and only inside the mailbox that user connected | The user picks the project at import time |
| Spoofed From | Filed on the token’s thread as unverified. A forged From without the token cannot enter the thread | M0 matcher already rejects an unexpected From. A forged From inside the real Gmail thread still needs the Gmail thread id, which the attacker does not have | Out of band |
| What it misses | Suppliers who answer the visible From and ignore Reply-To; any on-platform chat | The user’s other mailboxes; replies to a JAKOV360 From; on-platform chat; any mailbox the user does not connect | The entire email path |
| Core v1 | **Primary** | **Defer.** Optional later for the Reply-To gap, with its own approval | Manual import only |

### Gmail `gmail.send` and inbox read are different grants

Google’s Gmail scope list (updated 2026-09-10) classifies:

- `https://www.googleapis.com/auth/gmail.send` as **sensitive**. The drafted M1 client asks for `openid`, `userinfo.email`, and `gmail.send`. That lets JAKOV360 send one approved RFC message. It does not return replies.
- `https://www.googleapis.com/auth/gmail.readonly` as **restricted** (“view your email messages and settings”). Google states that storing or transmitting restricted-scope data requires a security assessment. Public launch past Google’s test-user cap depends on that assessment and on the Google API Services User Data Policy, including Limited Use. An app in testing with fewer than 100 users is not a public launch.
- `https://www.googleapis.com/auth/gmail.metadata` as **restricted** as well. Metadata-only access is not a way around the assessment, and it does not supply the quote body or the PDF.

Sign-in scopes (`openid email profile`) remain unrelated. Connecting Gmail for send must stay a separate consent screen from sign-in, as the M1 design already requires. Adding read access later needs a new consent, a new privacy disclosure, and a new owner approval. It is not an extension of the M1 send grant.

### Marketplace messaging

A reply typed into Alibaba, Made-in-China, or 1688 chat is not delivered to `replies.jakov360.com` and is not delivered to Gmail. Core v1 offers two honest actions:

- The user copies the message or uploads the proforma into the same project thread. Source is `MANUAL_IMPORT`. The UI says the text was supplied by the user, not received from the supplier’s mail server. The parse and human-review path is the same. The evidence status cannot rise above a user-imported written quote.
- A future official API integration is a separate product decision. Until that integration is approved and permitted by the marketplace, the product must not say those chats are collected automatically.

## Reply identity, deliverability, and anti-spoofing

### Addresses

Proposed names, for a later DNS approval. Nothing here is a request to publish them.

- Sending subdomain, for example `mail.jakov360.com`, used only if we send with our own From. SPF, DKIM, and DMARC are published on that name.
- Inbound subdomain, for example `replies.jakov360.com`, MX pointed only at the inbound provider.
- The apex `jakov360.com` MX and `privacy@jakov360.com` stay as they are.

`Reply-To` is always `r.<token>@replies.jakov360.com`. The token is at least 128 bits from a CSPRNG, encoded so it is safe in a local-part. The database stores only a SHA-256 of the token. Logs redact the local-part. The token is not a sequential id, a project id, or an organization id.

One active token belongs to one thread. The thread row holds `organization_id`, `project_id`, and the supplier confirmation or offer. Rotating a token is an explicit user action. The previous token stops accepting mail.

### From, and the Reply-To gap

Two send identities can share that Reply-To:

1. **JAKOV360 From** on the sending subdomain, display name of the organization, Reply-To the token. We control SPF/DKIM/DMARC alignment for mail we send. The supplier is told, in the message and in our UI, that the reply is stored in the JAKOV360 project.
2. **User Gmail From**, only through the existing M1 send path, still with Reply-To set to the token. Deliverability of the outbound message rides on Gmail. Capture still depends on the supplier honoring Reply-To.

Many mail clients honor Reply-To. Some suppliers reply to the visible From, or a colleague replies from a new address. Those messages reach the user’s Gmail in case 2 and never hit the webhook. Core v1 discloses that gap in the send review screen. It does not close the gap by reading the user’s inbox. The user can forward the stray reply to the token address, or paste it as a manual import. Both stay visible as forwarded or imported, with the same unverified-until-reviewed rule.

A copy of the outbound RFQ is shown in the in-app thread because we stored the approved body. That does not require reading Gmail.

### What is allowed to choose the thread

Order of trust:

1. **Webhook authentication.** The request must pass the provider check before any body is parsed for routing. For Postmark, as of their current docs, that check is HTTPS plus HTTP Basic Auth on the webhook URL, combined with their published source IP ranges. Postmark does not HMAC-sign inbound webhooks. A provider that offers an SNS-style signature (SES receiving) is an acceptable substitute if the owner prefers it at milestone C. A shared secret in a path, a constant-time compare, and no logging of the secret are mandatory either way. Failure returns 401 and writes nothing.
2. **Token lookup.** The recipient local-part is hashed and looked up. The organization id on the thread row is the only organization id used. A field in the JSON, the subject, or the body that names an organization is ignored.
3. **Sender authentication, stored separately from linkage.** SPF, DKIM, and DMARC results are taken from the result the inbound provider attached at SMTP time, not from a header the sender wrote and not from a pasted import. They set `sender_trust`:
   - `ALIGNED` when DMARC passes and the aligned domain matches the domain we addressed in the RFQ.
   - `UNVERIFIED` when DMARC is absent, fails, or passes for a different domain, or when From is not the address we wrote to.
4. An `UNVERIFIED` message is still stored on the token’s thread. Sales colleagues often reply from a different address. Dropping those replies would hide real quotes. The message cannot become a confirmed written quote until a person accepts the sender or the content. Extraction may run; it stays unconfirmed.
5. Subject, HTML, and body text are untrusted data. Instructions inside the mail (“mark this verified”, “switch organization”, “ignore previous rules”) have no effect.

This is deliberately different from the M0 helper `matchSupplierMailReply`, which is the fail-closed candidate matcher for a future Gmail-read path: same tenant, same mailbox, same provider thread id, RFC In-Reply-To/References containing the stored Message-ID, and From equal to the address we sent to. That helper remains the right rule if inbox read is ever built. It is the wrong rule for the token path, because the token, not the From header, is the capability.

Unknown tokens are quarantined with no `organization_id`, raw body retained for a short abuse window (proposed 14 days), then deleted. They are never attached by subject similarity.

### Immutable storage

- The provider payload and the original headers we rely on are written once: From, To, Cc, Reply-To, Subject, Date, Message-ID, In-Reply-To, References, Return-Path, and the provider’s authentication results, plus the provider’s receive timestamp. SHA-256 is stored with the object. Later parses do not rewrite it.
- A sanitized HTML rendering is a separate object for display. Remote images and active content are removed. The original is what a reviewer can download.
- Attachments are separate objects. Proposed limits: 10 MB per file, 25 MB per message, 10 files. Allow PDF, PNG, JPEG, WEBP, and XLSX/CSV after a magic-byte check. SVG, HTML, and macro-enabled Office files are rejected. ZIP is not unpacked in Core v1. A malware scan must return clean before a member can download the file. `PENDING` and `REJECTED` files stay in storage and are not served.
- Manual imports store the pasted text or file the user uploaded. They do not gain SMTP authentication results.

### Replay, idempotency, tenant isolation

- Unique key `(provider, provider_message_id)`. A retry, including Postmark’s retry schedule after a non-200, inserts once and returns 200 again. It does not create a second message, a second notification, or a second extraction that could overwrite a review.
- The idempotency row is committed before extraction or translation side effects.
- Every user-facing query is scoped by the session’s `organization_id` and by existing project access. A member of another organization gets the same not-found response as for a missing thread.
- The webhook is not a user session. It may write only the organization stored on the token row.
- Outbound send keeps the M1 rule: one durable attempt, `SENT` only with provider evidence, timeout stays `UNCERTAIN` and blocks a silent retry. A follow-up is a new row with a new approval hash. The hash that authorized the original RFQ does not authorize the follow-up. Core v1 has no standing permission to send clarifications automatically.

## Minimum schema

These tables are proposed. They are not a migration. On `main` today, `supplier_confirmations` and the Gmail tables do not exist; they exist only on the unmerged confirmation and Gmail draft branches. Milestone B should add inbox tables beside those drafts once the owner allows implementation, and should not invent a second outbox if `supplier_mail_deliveries` is already the send record. Until that approval, no schema change is in scope.

Every row that belongs to a customer carries `organization_id`. Foreign keys that cross tables include `organization_id` so a thread cannot point at another tenant’s project.

`supplier_inbox_threads`

- `id`, `organization_id`, `project_id`, `offer_id` nullable, `confirmation_id` nullable
- `reply_token_hash` unique
- `status` as in the workflow below
- `expected_supplier_email` nullable, used only for the DMARC alignment check
- `created_by_user_id`

`supplier_outbound_messages` (or extra columns on `supplier_mail_deliveries` if that table is the base)

- thread, organization, author user
- from, to, reply-to, subject, body hash, approval hash
- `rfc_message_id` unique, provider, provider message id, provider thread id
- status `PENDING | SENT | UNCERTAIN`
- approved_at, sent_at

`supplier_inbound_messages`

- thread nullable (null means quarantine), organization nullable for the same reason
- provider, provider message id, unique together
- received_at
- from address, raw object key, raw SHA-256
- sanitized body key, original text
- `sender_trust` `ALIGNED | UNVERIFIED`
- authentication results JSON
- source `WEBHOOK | FORWARD | MANUAL_IMPORT`
- In-Reply-To, References

`supplier_inbound_attachments`

- message, organization, filename, declared mime, detected mime, size, SHA-256, storage key
- `scan_status` `PENDING | CLEAN | REJECTED`

`supplier_message_translations`

- message, organization, locale (`sr` for the current product), translated text, model id
- The original on the inbound row is never replaced

`supplier_quote_extractions`

- thread, message, organization
- one row per field: price at the ordered quantity, full tiers, currency, model, diopter or variant mix, MOQ, Incoterm, named place, lead time, packaging, country of origin, certificates, quote validity, payment terms
- value JSON, confidence, citation (message span or attachment id + page + snippet)
- flags `MISSING | CONTRADICTION | SPEC_MISMATCH | LOW_CONFIDENCE`
- `review_status` `UNREVIEWED | ACCEPTED | REJECTED`, reviewer, reviewed_at

`supplier_inbox_events`

- organization, thread, actor nullable, type, metadata, created_at
- This is the activity trail. It is also the in-app notification source for members who can already open the project. New B2B roles are out of scope ([#180](https://github.com/rasapajic/importpilot-ai/issues/180)).

The current offer extractor (`supplierOfferExtractionSchema`) knows a single unit price, currency, Incoterm, MOQ, and lead time. The inbox extractor has to add tiers, variant mix, named place, packaging, origin, certificates, and validity, and it has to cite a source span. Those cited rows are not written into `CostCalculation` by the model.

## Workflow

```text
RFQ draft
  → user approves exact from / to / subject / body / reply-to   (fresh hash)
  → sent only with provider evidence
  → reply received (token match; sender trust stored)
  → parsed (original kept; Serbian translation beside it)
  → human review
       → needs clarification → new draft follow-up → fresh approval → sent
       → written quote confirmed (accepted fields only)
  → cost engine shows those fields as supplier-quoted
```

Thread status values: `DRAFT`, `APPROVED`, `SENT`, `RECEIVED`, `PARSED`, `NEEDS_CLARIFICATION`, `QUOTE_CONFIRMED`, `IN_COMPARISON`.

Rules that keep the landed cost honest, matching [#178](https://github.com/rasapajic/importpilot-ai/issues/178):

- Advertised listing ranges stay labeled advertised. A reply never overwrites them.
- Model output is `UNREVIEWED`. It is visible as parsed and is excluded from the numeric landed total.
- A person accepts or rejects each field. Accepted fields enter the comparison as **supplier-quoted**, with the message id, snippet, reviewer, and time. They are not labeled official-rate, carrier-quoted, or independently verified.
- Contradictions (body USD 1.20 versus PDF USD 1.80, or quantity 1,000 versus MOQ 2,000) and spec mismatches (progressive lenses offered against a fixed-diopter requirement) force `NEEDS_CLARIFICATION`. Nothing from that field is written to the cost engine.
- A missing Incoterm, named place, weight, or validity leaves the dependent landed-cost line as **missing**. A supplier sentence that says “DDP Belgrade” records a supplier claim. It does not zero the duty line and it does not create an official tariff rate.
- Quote validity in the past, or a price for a different quantity than the project, stays unconfirmed.
- No transition marks a purchase or a quotation as accepted in the commercial sense. `QUOTE_CONFIRMED` means “a person accepted this written evidence,” not “we are buying.”
- The comparison view from [#176](https://github.com/rasapajic/importpilot-ai/pull/177) can show three offers while quotes are still missing. Arrival of a reviewed quote updates that offer’s supplier-quoted cells. It does not elect a winner by itself.

Follow-up drafts are created when required fields are missing or conflicting. They sit in `DRAFT` until the user approves that exact text. Closing the review screen, a webhook retry, or a model suggestion does not send them.

## Acceptance tests

Milestone B runs these with synthetic provider payloads and fixture bytes. No socket to Gmail, Postmark, or a supplier. Milestone D repeats the two mailbox cases with operator-owned addresses only, after a separate approval. The scenario family is the [#178](https://github.com/rasapajic/importpilot-ai/issues/178) case: 1,000 fixed non-progressive reading glasses, six diopters, China to Serbia.

| Case | Pass condition |
| --- | --- |
| Two operator mailboxes | Buyer mailbox sends the approved RFQ. Supplier-role mailbox replies to the token. The reply appears on that project only. A second organization cannot read it. |
| PDF / proforma | Attachment bytes match the stored SHA-256, scan completes before download, and the price citation names the file and page. |
| Contradictory quote | Body and PDF disagree, or the quote disagrees with the ordered quantity or the non-progressive spec. Status becomes `NEEDS_CLARIFICATION`. Cost totals do not change. A follow-up draft exists and is unsent. |
| Unverified supplier | DMARC fail, or From on a different domain, still files on the token’s thread with `sender_trust = UNVERIFIED`. Confirm action stays disabled until a person accepts it. |
| Duplicate delivery | The same provider message id posted twice yields one row, one notification, and HTTP 200 both times. |
| Spoofed From | A message to the real token with the supplier’s address forged in From and DMARC failing is `UNVERIFIED`. A message with a perfect From and the right subject, but no token, does not attach to the thread. |
| Tenant mismatch | A session in organization B requesting organization A’s thread is not found. A webhook body that names organization B is ignored; the token’s organization wins. |
| Provider outage | A 500 followed by a retry of the same id still yields one message. When retries are exhausted, the thread shows ingestion delayed. The RFQ is not marked failed and is not resent. |
| Approval reuse | A follow-up send that presents the original RFQ hash is rejected. |
| Send-only Gmail | A successful `gmail.send` record creates no inbound row. |

## Staging rollout

Zero risk means the feature cannot receive mail until the owner turns a flag on, in staging, against operator-owned addresses.

| Gate | What happens | What stays forbidden |
| --- | --- | --- |
| A. This proposal | Review the design | Code, DNS, scopes, vendors, migrations |
| B. Synthetic draft | Inbox UI and parser behind `JAKOV360_INBOUND_MAIL_ENABLED=false`, CI on the cases above, fixture payloads only | Provider account, live webhook, merge to `main` or `release/1.0.0`, mixing into #175 or #177 |
| C. Staging plumbing | Owner approves a provider and the reply subdomain. MX is created only for that name. Secrets live in the staging environment, not in Git. Flag still off until the webhook auth test passes with the provider’s own test ping | Apex MX, `privacy@`, production, real supplier mail |
| D. Operator exercise | Two mailboxes the owner controls. One contradictory quote, one attached proforma. Translation, citations, and a follow-up that sends only after a new approval | Real supplier addresses, production flag |
| E. Production | Privacy text, retention, subprocessor list, malware scanning, and backup/restore accepted. Separate go/no-go | Any earlier gate skipped |

Proposed flag, default false everywhere: `JAKOV360_INBOUND_MAIL_ENABLED`. Empty provider credentials are a hard stop, same pattern as the M1 recipient allowlist.

Privacy and consent that must be written before gate C, in a separate change to the privacy page:

- We store the full supplier message and attachments the supplier sends to the reply address, including personal data in signatures.
- Members who can already open the project can read that thread. Core v1 adds no new roles.
- Subprocessors: the inbound provider, object storage, the translation/extraction model, and the malware scanner.
- Retention: project lifetime plus a period the owner sets; deletion of the project deletes the inbox objects; the provider’s own retention (Postmark’s published default is 45 days) is disclosed separately. Quarantine for unknown tokens is the short window above.
- The send screen states the From and the Reply-To in plain language before approval.

### Cost bands

Public list prices checked 28 October 2026. They are not quotes and they are not an authorization to buy. Reconfirm before gate C.

| Option | Pilot band (hundreds to a few thousand messages a month) | Notes |
| --- | --- | --- |
| Postmark inbound | Pro plan about **USD 16.50 / month** for 10,000 emails, send and receive counted together. Overage about **USD 1.30 / 1,000**. Basic at USD 15 does not include inbound | Webhook auth is Basic Auth and IP allowlisting, not HMAC. Custom retention on their copy up to 365 days |
| Amazon SES receiving | List price on the order of **USD 0.10 / 1,000** emails plus S3 storage | SNS signature verification is stronger than Postmark’s inbound webhook. More setup, and inbound is not available in every region |
| SendGrid Inbound Parse | A paid Email API plan, typically the **low tens of USD / month** at this volume | Confirm the current plan and whether the inbound endpoint is signed or only a secret URL |
| Malware scan | **USD 0** extra if ClamAV runs beside the worker, or a small per-thousand fee for a scan API | Required before download either way |
| Translation and extraction | Existing model usage, cents per plain-text reply; more if a long PDF is parsed | Only the linked supplier message is sent to the model. Quarantine and unrelated mail are not |
| `gmail.readonly` | **USD 0** Google API fee. A restricted-scope security assessment, paid by us to a Google-listed lab, is commonly a **five-figure USD annual** cost once the app stores message content and leaves test-user mode | Not required if Core v1 never requests the scope. `gmail.send` stays on the smaller sensitive-scope verification track already planned for M1 |
| DNS | No material fee | One new MX name, only after approval |

At Core v1 pilot volume the inbound provider is a small monthly cost. The expensive path is Gmail restricted-scope compliance, which this recommendation avoids.

## Next owner decision

Answer one question before any implementation:

**Adopt path (1) as the only Core v1 receive path?** Dedicated reply subdomain, authenticated inbound webhook, per-thread Reply-To token, M1 `gmail.send` left unchanged as an optional From, no `gmail.readonly`, marketplace chat as manual import only.

- **Yes** means milestone B may later be scheduled as a synthetic, flag-off draft. It does not approve Postmark or SES, a DNS record, a privacy edit, a migration, or staging mail.
- **No, use Gmail read instead** means Core v1 receive waits on restricted-scope verification and a security assessment, and still misses marketplace chat and any reply that never enters the connected Gmail.
- **No, defer the inbox** means the [#180](https://github.com/rasapajic/importpilot-ai/issues/180) sentence “receives replies in-app” is not met by M1, and launch copy must not claim it.

Suggested default if the owner wants the launch promise kept: **Yes, path (1).**
