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
