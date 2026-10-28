# JAKOV360 — connected supplier email (Gmail first)

**Status:** M0 domain contract only; no Gmail access, OAuth route, token storage,
database migration, external send or deployment in this pull request.

## User outcome

A signed-in user explicitly connects a mailbox to JAKOV360, reviews an RFQ
in its final language, and explicitly approves a specific recipient, subject,
body and sender account. JAKOV360 sends it, persists Gmail's sent-message
evidence, watches for a reply, associates the reply with exactly one
organization/project/supplier confirmation, translates it and proposes
commercial terms for explicit user confirmation. No AI-initiated sending
or automatic commercial approval.

The current JAKOV360 Google **sign-in** (scope `openid email profile`)
does not grant Gmail access. Never silently reuse or widen sign-in permission.

## Phased implementation

### M0: domain safety contract — this PR

- Require tenant ownership, an active connected mailbox, an exact sender and
  recipient, PREPARED status, a current source/translation and one explicit
  user approval bound to a server-calculated SHA-256 of sender + recipient +
  subject + final body.
- For inbound supplier replies require the same tenant, connected mailbox
  and provider, **Gmail thread ID + RFC In-Reply-To/References** matching
  the recorded sent RFC Message-ID, and the expected recipient/sender.
  No linking based only on a subject or on a common supplier domain.
- Treat the result as a **candidate linkage**, not proof of the sender's
  authenticity or a confirmed quotation. Never change pricing fields solely
  because a message matched.
- Pure helpers only; no network calls or schema changes. The real application
  service must also verify authenticated organization membership, perform
  transactional state checks, and use unique database constraints.

### M1: connect Gmail and send with consent (future PR)

- Separate **Connect Gmail** OAuth 2.0 authorization-code + PKCE and state
  flow, with explicit user consent. Google sign-in and mailbox connection
  must remain independent. The user can choose which Google account to link.
- Use `gmail.send` for provider-mediated sending. Obtain a refresh token only
  for the explicitly linked mailbox using `access_type=offline`.
- Store refresh tokens **encrypted at rest with a separately managed
  server-side key**, key version and rotation path; never show them to the
  browser or log them. Disconnect must revoke and delete usable credentials.
- Add `mailbox_connections` and `supplier_mail_messages` via reviewed
  Prisma migrations. Both are tenant-scoped. Message rows include immutable
  project/confirmation links, Gmail message/thread IDs, RFC Message-ID,
  idempotency key, delivery status, audit timestamps and connection.
- Use an authenticated POST requiring an explicit click to send exactly one
  reviewed draft. Recalculate the content hash on the server immediately
  before send. Prevent concurrent duplicate sends with a unique idempotency
  key. Provider failures and indeterminate timeouts must not be marked SENT
  without provider evidence.
- Do not change the existing `markSent` API before implementing a controlled
  compatibility path for manual, explicitly labeled external sends.


### M1c: one-shot supplier Gmail send (Draft PR #166 — review only)

- No live sending until M0/M1a/M1b have passed review and been integrated,
  migration rehearsal has succeeded, and dedicated acceptance staging OAuth
  configuration is explicitly enabled. Never auto-enable Gmail on production.
- Before any send, a user enters a **test allowlisted recipient**, selects a
  connected Gmail mailbox, and reviews the **exact server-sourced translation,
  sender, recipient and subject**. Each affirmative send is bound to a
  SHA-256 approval fingerprint of that content and its tenant/confirmation.
- A transaction creates one `supplier_mail_deliveries` row with a unique
  (organization, confirmation) key *before* calling Gmail. Gmail API
  `users.messages.send` receives one base64url RFC MIME message. No
  automatic retry is attempted, including network timeout, HTTP 5xx or an
  incomplete provider response.
- `SENT` requires a Gmail message ID and thread ID returned by Google, exactly
  one confirmation row moving from `PREPARED` to `SENT`, and exactly one
  `PENDING` delivery row updated in that same transaction. A zero-row
  confirmation update never leaves the outbox `SENT`. Provider IDs are stored
  on the blocked `UNCERTAIN` row when the database accepts the write. If the
  database is unavailable after Gmail accepts, the provider is not called
  again; the server logs `gmail_send_reconciliation_required` with the RFC
  Message-ID and provider IDs, and no message body or OAuth token. The
  existing `PENDING` claim still blocks another send.
- Staging enrollment is fail-closed to one acceptance organization UUID and
  a comma-separated list of designated user UUIDs
  (`JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID`,
  `JAKOV360_GMAIL_ACCEPTANCE_USER_IDS`). Empty or invalid values deny OAuth
  start, callback, mailbox listing for send, preview and POST send. Disconnect
  of an existing tenant mailbox stays available to that tenant's owner/admin.
  Local development does not skip this list. See the runbook below. Do not
  enable the feature from this documentation.
- The previously available manual "marked as sent" button remains available
  for genuinely external messages, but refuses to overwrite a Gmail attempt.
- A future reconciliation feature must check Gmail's actual Sent mailbox using
  additional justified permission; **do not implement blind automated retry**.
- UI uses an explicit additional approval checkbox and reviews text read-only.
  Merely connecting a mailbox does **not** send anything.
- A comprehensive test must verify cross-organization isolation, exact content
  approval, stale translation rejection, RFC header safety, correct provider
  IDs, send error paths, duplicate clicks, concurrency and pending/uncertain
  handling. Tests must use synthetic Google responses; no real mail in CI.

**Warning:** A failed Gmail HTTP response or lost response does not always prove
that an email was not delivered. The system will block retry until a human
reconciles the attempt.

### Manual reconciliation of PENDING or UNCERTAIN Gmail sends (M1)

Use this when a send returns an uncertain outcome or a `supplier_mail_deliveries`
row stays `PENDING` or `UNCERTAIN`. Do not click send again. The unique
organization and confirmation key blocks another Gmail API call. Do not request
`gmail.readonly` for this check; M1 does not read the inbox.

1. In the acceptance database, read `rfc_message_id`, `sender_email`,
   `recipient_email`, `status`, `provider_message_id` and `provider_thread_id`
   for that delivery row. The RFC Message-ID looks like
   `<{claim-id}.jakov360@jakov360.com>`.
2. Open the sending Gmail account's Sent mailbox (the `sender_email` on the
   row) and search `rfc822msgid:` plus the id without angle brackets.
3. If Sent contains that message, record Gmail's message id and thread id on
   the blocked row when they are not already stored. Leave status `UNCERTAIN`
   until a reviewer confirms the Sent copy matches the approved recipient and
   subject. Only then may a separately reviewed maintenance action mark the
   delivery and a still-`PREPARED` confirmation as `SENT`. Do not send a second
   copy.
4. If the confirmation was already moved by a manual mark, keep the Gmail row
   blocked and attach the provider IDs. Do not treat the manual mark as proof
   that Gmail accepted a message, and do not send again.
5. If Sent has no matching message and the provider ids are empty, leave the
   row blocked. A new business message requires a separate reviewed action;
   the application will not retry.
6. If the database write failed after Gmail accepted, use the server log event
   `gmail_send_reconciliation_required`. It contains `claimId`, `rfcMessageId`,
   `providerMessageId`, `providerThreadId` and `persisted`. It does not contain
   the message body or an OAuth token. Match `rfcMessageId` to Sent, then store
   the ids on the still-`PENDING` row before any status decision.

No Render change, production migration, or live mailbox access is authorized by
this runbook.

### M2: receive replies automatically (future PR)

- Request `gmail.readonly` for reading reply bodies. This is a **restricted**
  Google permission; public launch needs Google's applicable verification
  and, if storing/transmitting restricted Gmail data on servers, potentially
  an independent security assessment. Treat this as a release gate.
- Set up Gmail watch with Google Cloud Pub/Sub and a signed/authenticated
  push endpoint; store the mailbox `historyId` and watch expiry, renew at
  least every 7 days (prefer daily).
- Reconcile changes using `history.list`. Fall back to a bounded re-sync
  when Gmail returns 404 for an expired history cursor, and perform periodic
  reconciliation in case notifications are dropped.
- Fetch/store only messages needed for linked supplier threads. Keep raw
  headers and content only as minimally as needed for evidence and user review.
  Never forward an unrelated private email to a translation model.
- Deduplicate by provider + mailbox connection + provider message ID.
  Ignore/self-quarantine unmatched, forwarded, ambiguous and spoof-suspect
  messages instead of guessing the project. Do not auto-click external links,
  execute attachment contents, or follow instructions embedded in emails.

### M3: translate and extract terms, then human approval (future PR)

- Show original and Serbian translation, then extract proposed unit price,
  currency, order quantity, MOQ, diopter mix, Incoterm + named port,
  production and shipping lead time, payment terms, packaging, and documents.
- Keep evidence snippets linked to the original supplier reply; AI output is
  untrusted. Missing, conflicting or ambiguous fields stay *unconfirmed*.
- The user individually reviews/accepts proposed fields before calculation.
  Do not mark freight/customs/VAT paid or included without evidence.

### M4: Outlook (future PR)

- Use a separate Microsoft Graph delegated consent integration (`Mail.Read`
  and `Mail.Send`), retaining the same provider-neutral send/correlation
  security contract. Never treat Google identity and Outlook identity as
  interchangeable.

## Required deployment and policy gates

1. Gmail integration must remain **disabled by default**, even after merging
   initial code. Only dedicated staging test accounts may be enabled first.
2. Update JAKOV360 privacy notice and data-retention/disconnect disclosures
   **before asking for Gmail permissions**. The existing privacy page
   currently states that no Gmail access is requested; that statement must
   stay true until live integration is actually enabled.
3. Verify Google OAuth consent configuration, requested scopes, publisher
   status, test-user restrictions and verification / assessment obligations.
4. Test against two user-controlled email addresses and one [DEMO] project.
   Do not send to a real supplier during acceptance testing.
5. Required negative tests: cross-tenant mailbox access, changed drafts after
   approval, duplicate clicks, provider timeouts, mismatched Gmail thread,
   missing RFC reply headers, unexpected From, spoofed/unverified sender,
   replayed Pub/Sub notifications, 404 history recovery, revoked access,
   OAuth CSRF/state misuse, empty credentials and disconnection.
6. Keep the existing supplier-confirmation PR #158 Draft; no merge to `main`
   or Render deployment without review and approval.

## Google reference documentation

- Gmail scopes and verification:
  https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail send and threads:
  https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
  https://developers.google.com/workspace/gmail/api/guides/threads
- Gmail watch and sync:
  https://developers.google.com/workspace/gmail/api/guides/push
  https://developers.google.com/workspace/gmail/api/guides/sync
- Google OAuth web-server offline consent:
  https://developers.google.com/identity/protocols/oauth2/web-server
