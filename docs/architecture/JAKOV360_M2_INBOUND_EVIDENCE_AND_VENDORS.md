# JAKOV360 M2 — redacted snapshot, original retention, and vendor comparison

- Status: design note for the synthetic inbox. The owner later selected Amazon SES receiving as the future technical direction. That selection is preparation only and is recorded in `docs/architecture/JAKOV360_M2_SES_RECEIVING_PREFLIGHT.md`. It does not purchase SES, change this snapshot, or turn receiving on.
- Date: 2026-10-29
- Scope: synthetic Supplier Inbox draft (PR #182). No DNS, MX, contract, secret, privacy publish, or live mail.

The current database column `supplier_inbound_messages.raw_message` is a **redacted synthetic snapshot**. It is **not byte-for-byte SMTP** evidence and it does not retain a provider original.

## What this draft stores

`buildRedactedSyntheticSnapshot` writes JSON with:

- `evidenceClass: REDACTED_SYNTHETIC_SNAPSHOT`
- `byteForByteSmtp: false`
- `providerOriginalRetained: false`
- selected fixture fields after reply-token redaction
- `toHeader`, which is not the routing key

The SHA-256 and object key are of that JSON. The key prefix is `db:supplier-inbox/synthetic-redacted/`. The immutability trigger stops later parses from rewriting it. Sanitized text for the screen is a separate column. Neither artifact is the MIME message a provider received.

Routing uses only the bare SMTP envelope recipient on `replies.example.test`. A token in `To`, a display name, or `r.<token>@unrelated.example` does not select a thread. This milestone publishes no MX record.

`isSyntheticProviderContext` checks an **in-process fixture marker, not cryptographic webhook authentication**. HTTP JSON, `JSON.parse`, and object spread cannot carry the marker. No `app/api` route calls the ingestion handler. Basic Auth is not an HMAC signature. A From header, a subject, a raw `Authentication-Results` header, and the reply token are not provider authentication.

## Future provider-original archive

Live receiving stays blocked until a separate design is reviewed and the owner approves a provider. That design is not implemented here.

Keep two objects:

1. **Provider original.** Byte-for-byte MIME as stored by the provider (for example the SES S3 object), or the raw MIME if a provider actually supplies it. Content-addressed by the SHA-256 of those bytes. Encrypted at rest. A different bucket or prefix from the redacted snapshot. No reply token, webhook password, or cloud key in the object key or in logs. Access is audited and is not the normal inbox download. Malware status must be `CLEAN` before any download. Retention is explicit and separate from the 14-day quarantine of unknown recipients.
2. **Redacted rendering.** Derived text for the inbox, with tokens removed and HTML sanitized for display. Its hash must not be described as the SMTP digest. Quote extraction cites this rendering and the scanned attachment bytes, and stays `UNREVIEWED` until a person accepts a field.

Unknown and revoked tokens stay outside every tenant. Do not infer SPF, DKIM, or DMARC from a raw `Authentication-Results` header. Do not copy human-accepted fields into landed cost in this milestone. A follow-up stays unsent until a fresh approval of its exact content.

## Vendor comparison

This table is for a later decision. It does not approve SES, Postmark, DNS, or a webhook URL. Render staging for this app is Frankfurt (`eu-central-1`). Re-check every price and limit on the vendor's own page before any contract.

| Question | Amazon SES receiving | Postmark inbound |
| --- | --- | --- |
| Availability next to Render Frankfurt | Receiving endpoint `inbound-smtp.eu-central-1.amazonaws.com` is on the AWS email-receiving list. SNS, KMS, and Lambda used by the receipt rule must be in that same region. S3 may differ; keeping the bucket in `eu-central-1` is the simpler operations choice. | Inbound is a hosted webhook, not an AWS region feature. The HTTPS endpoint can be the Frankfurt app. Postmark's own processing region is theirs, not Render's. |
| What "webhook auth" actually is | The usual path is receipt rule to S3, then an SNS notification. SNS messages can be signature-checked (cryptographic signature of the notification, plus the expected topic). That is not a signature of the supplier's MIME, and it is not Basic Auth. | Postmark documents HTTP Basic Auth on the webhook URL. Postmark does not sign inbound webhooks with HMAC. Basic Auth plus an IP list is not an HMAC. Their outbound-webhook IP list does not apply to inbound; inbound uses separate infrastructure. |
| Envelope and MIME | SES exposes the SMTP envelope recipients on the receipt and can store the raw MIME in S3. That object is the candidate provider original. | The webhook JSON has `OriginalRecipient`, parsed bodies, headers, and base64 attachments. That JSON is already a parse. It is not byte-for-byte SMTP. Persist what you need at receipt time. |
| Attachments | Raw MIME in S3 includes attachments, up to SES's receiving size limit (commonly 40 MB; re-check). Virus/spam verdicts from SES do not replace this app's `CLEAN` download gate. | Cumulative inbound attachment size in the webhook is 35 MB. Postmark's message API and UI keep only about 1 MB and truncate larger raw source. Attachments are not fetched later from Postmark. |
| Retries | SNS retries, then a dead-letter queue if one is configured. Idempotency key is the SES message id plus the S3 object. | Non-success webhook responses are retried. Idempotency key is Postmark's `MessageID`. Confirm the current retry schedule before go-live. |
| Cost band | Published receiving price is a small per-thousand charge on 256 KB chunks, plus S3 storage and SNS. A few hundred supplier replies a month is low single-digit USD before malware scanning and log storage. Re-check `https://aws.amazon.com/ses/pricing/`. | Sold as a monthly platform plan, not as AWS chunks. The same volume is still a small monthly plan if attachment retention stays in our database. Re-check Postmark's current pricing page. |
| Operational weight | AWS account, receipt rule set, bucket policy, SNS signature and topic check, separate original object, scanner, and an MX only on the approved subdomain. More parts. Closer to a faithful original archive. | One HTTPS webhook and Basic Auth. Fewer parts. The app must build its own original-retention story because the webhook body is not the MIME archive. |

Neither option is a public route in this draft. Neither option authorizes `gmail.readonly`. Suppliers who reply only inside a marketplace chat stay manual import.

## Still requiring an explicit owner approval

Provider choice and contract, DNS or MX, privacy text for stored supplier mail, secrets, staging mail, a production flag, and applying `20261028170930_supplier_inbox_synthetic` anywhere except an ephemeral CI database. `JAKOV360_INBOUND_MAIL_ENABLED` stays false unless a later approved environment sets it to the exact string `true`.
