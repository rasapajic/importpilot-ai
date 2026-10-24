# JAKOV360 Gmail M1 — controlled send acceptance

**Status:** code-only Draft PR. NOT DEPLOYED. No mailboxes connected and no real email sent.

## Scope

M1 is strictly a **staging-only, explicitly approved Gmail send** workflow.
The Gmail mailbox consent is separate from ordinary Google Sign-In.

- Google OAuth scopes: `openid email profile gmail.send` only.
- OAuth uses authorization code, PKCE S256, state, session/user/tenant
  binding, an HttpOnly SameSite=Lax short-lived encrypted cookie and
  `access_type=offline`. All origin/redirect values are pinned to
  `https://jakov360-acceptance-staging.onrender.com`.
- A connected mailbox refresh token is encrypted server-side under a
  versioned AES-256-GCM key and bound to `organizationId + connectionId`.
  Store the keyring outside the repository; support old keys during rotation.
- An outgoing supplier RFQ requires a `[DEMO]` project, PREPARED status,
  current translated message, a selected connected Gmail mailbox, a single
  configured recipient, short-lived server-authenticated preview and an
  explicit confirmation of the exact From / To / Subject / Body.
- The server creates a **unique durable send reservation before** calling
  Gmail. A confirmed provider response stores message ID, thread ID and
  the outbound RFC Message-ID; only then is the confirmation marked SENT.
  Unknown outcomes stay UNKNOWN and cannot be blindly retried.
- The user can disconnect: stored usable credentials are deleted and Google
  token revocation is attempted. Existing outgoing evidence remains for audit.
- The app does **not** read replies automatically in M1. That is M2 and
  will require a restricted Gmail read scope, additional review and possibly
  an independent security assessment for stored restricted content.

## Environment — acceptance service only

Required server environment variables (do **not** put any values in Git):

| Key | Purpose |
| --- | --- |
| `JAKOV360_GMAIL_TEST_ENABLED=1` | Enable feature only on the specific acceptance service |
| `JAKOV360_GMAIL_TEST_ORG_ID` | Exact UUID of the allowed test organization |
| `JAKOV360_GMAIL_TEST_RECIPIENT` | One address personally controlled by the tester |
| `GOOGLE_MAIL_CLIENT_ID` | Separate Gmail OAuth client |
| `GOOGLE_MAIL_CLIENT_SECRET` | Google OAuth secret |
| `GOOGLE_MAIL_OAUTH_REDIRECT_URI` | Exact `https://jakov360-acceptance-staging.onrender.com/api/mail/gmail/callback` |
| `JAKOV360_MAIL_TOKEN_KEYS_JSON` | JSON keyring, e.g. `{"v1":"<fresh base64 32 bytes>"}` |
| `JAKOV360_MAIL_ACTIVE_KEY_VERSION=v1` | Key ID used for new encryption |

**Do not configure these on production.** The server additionally requires
Render service ID `srv-datu3v093c1s73c17m60` and organization match,
failing closed otherwise.

Google Cloud Console: enable Gmail API; register the exact redirect URI;
configure the OAuth consent screen, privacy-policy URL, allowed test users
and the `gmail.send` sensitive scope. For public launch, Google OAuth
verification requirements must be reviewed and completed.

## Safe staging deployment gate

1. Independently review M1 code, OAuth cookie/session binding, token crypto,
   migrations, all API routes, authorization and CSRF checks.
2. GitHub CI including PostgreSQL migrations, Prisma drift, full tests and
   production smoke: PASS on the **exact merged commit**.
3. Rehearse the new migration on an isolated restored snapshot of the
   acceptance database; check row counts / hashes before and after.
4. Merge M0 and M1 **only into `cursor/supplier-confirmation-eaef`**;
   preserve PR #158 Draft to `main`. Require explicit deploy approval.
5. Deploy only to acceptance staging; confirm Prisma operates exclusively
   on schema `jakov360_pr158` and public schema hashes are unchanged.
6. Keep `JAKOV360_GMAIL_TEST_ENABLED=0` until the above are completed and
   credentials are safely configured. Setting Render environment variables
   may trigger a deploy even when Git auto-deploy is disabled — verify before
   changing any values.

## Real acceptance test (two test email accounts)

1. User signs in to JAKOV360 staging and explicitly connects one Gmail
   account via Account → Connect Gmail.
2. In a new `[DEMO]` project with a prepared supplier confirmation,
   prepare and translate an RFQ; verify commercial facts have not changed.
3. Enter the **allowed secondary test address**, review exact sender,
   recipient, subject and body and explicitly confirm sending.
4. Verify Gmail API confirmation and the actual message in the second
   mailbox; verify the first mailbox Sent folder too.
5. Check the row in `supplier_mail_outbounds` has status SENT and a Gmail
   provider message/thread ID, the related confirmation is SENT, no second
   row can be created by repeated clicks or requests.
6. Reject a changed draft after preview, wrong organization, wrong
   recipient, inactive connection and forged/missing Origin.
7. Simulate an ambiguous provider result. Verify status UNKNOWN and
   no automatic retry. Reconcile manually before any support-led reset.
8. Disconnect Gmail. Check encrypted refresh token becomes null,
   connection is absent from active list, provider revocation outcome is
   displayed, and sent evidence remains intact.
9. Restore feature gate to disabled after smoke testing.

## Known limitations / follow-up

- Gmail itself may normalize or replace a supplied RFC Message-ID. M2 must
  verify the final provider-stored header before trusting it for inbound
  correlation. The Gmail response alone confirms the provider message/thread
  IDs, not the value of the final RFC header.
- Sender authenticity is *not* proved solely by `From` or thread IDs.
- Messages and pricing data must be verified by the user; no mail-to-offer
  automatic commercial approval.
- Gmail read permission and automated reply import belong to M2, not M1.
- A separate Microsoft Graph integration belongs to a later Outlook phase.

## Official API references

- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
