# JAKOV360 M2 — Amazon SES receiving preflight

- Status: technical preparation only. No AWS account, contract, DNS, secret, migration, or live mail.
- Date checked: 2026-10-29
- Depends on draft PR #182 (`cursor/m2-supplier-inbox-synthetic-9ccf`). This branch does not retarget `main` or `release/1.0.0`.
- Owner decision: Amazon SES receiving is the preferred future direction for the auditable reply archive. Postmark is not the selected path. That decision does not purchase SES and does not turn receiving on.
- Cost, spend-limit, and stop planning for issue #184 is in `docs/architecture/JAKOV360_M2_SES_PILOT_COST_AND_SAFETY.md`. That note does not create resources either.

`JAKOV360_INBOUND_MAIL_ENABLED` stays `false` in `.env.example` and in deployed configuration. The preflight module does not read AWS credentials. It does not import the AWS SDK. It does not perform an HTTP request. No `app/api` route calls it. It does not request `gmail.readonly` or `gmail.metadata`.

The code rejects any binding other than the fixture below. A caller cannot point it at a live account, bucket, or domain without a later reviewed change.

| Fixture | Value |
| --- | --- |
| Region | `eu-central-1` |
| Inbound SMTP endpoint, not configured in DNS | `inbound-smtp.eu-central-1.amazonaws.com` |
| Topic | `arn:aws:sns:eu-central-1:111122223333:jakov360-ses-inbound-preflight` |
| Receipt rule, recorded but not proven by the notification | `arn:aws:ses:eu-central-1:111122223333:receipt-rule-set/jakov360-replies-preflight:receipt-rule/deliver-s3-original` |
| Bucket | `example-jakov360-ses-preflight` |
| Object key | `original-mime/<ses-message-id>` |
| Reply domain | `replies.example.test` |

Account `111122223333` is the placeholder used in AWS documentation examples. It is not a JAKOV360 account.

## 1. Region and receiving path

Official sources checked on 2026-10-29:

- Email receiving endpoints: [Amazon SES endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/ses.html). Europe (Frankfurt), `eu-central-1`, is listed as `inbound-smtp.eu-central-1.amazonaws.com`. The same page says receiving is absent in AWS GovCloud (US-East) and AWS GovCloud (US-West). Frankfurt is not in that exclusion.
- Region rule: [Regions and Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/regions.html). Except for the S3 bucket, the SNS topic, KMS key, and Lambda function used for receiving must be in the same region as the SES endpoint. An active receipt rule set must exist in that region.
- Expansion notice: [Amazon SES email receiving expands to seven regions](https://aws.amazon.com/about-aws/whats-new/2023/09/amazon-ses-email-service-7-regions/), including Europe (Frankfurt).
- Setup order: [Setting up Amazon SES email receiving](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html) and [publishing an MX record](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-mx-record.html). The documented MX value is `10 inbound-smtp.region.amazonaws.com`. For Frankfurt, `region` is `eu-central-1`.

Chosen later shape, not created here:

1. Verify only the future reply subdomain in SES in `eu-central-1`.
2. Publish an MX record only on that subdomain, after a separate approval. Do not change the apex MX. Do not change the mailbox that receives `privacy@`.
3. One active receipt rule set in `eu-central-1`. One rule whose recipient condition is that subdomain.
4. Rule action: deliver the original MIME to an S3 bucket in `eu-central-1`, with an object key prefix `original-mime/`, and publish an SNS notification in `eu-central-1`.
5. Preferred consumer: an SQS queue subscribed to that topic, same account and region, then a worker. No HTTPS subscription on the JAKOV360 app in this design, so there is still no public inbound webhook.
6. Dead-letter queue on that subscription. SNS documents that the subscription and the DLQ queue must be in the same account and region ([SNS dead-letter queues](https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html)). For SQS and Lambda subscriptions, SNS retries server-side failures up to 100,015 times over 23 days. Do not attach a live subscription until the consumer can persist an idempotent row and then acknowledge. This preflight consumer does not exist.

SQS delivery keeps the SNS envelope, including `Signature` and `SigningCertURL`, when raw message delivery is off ([SNS fanout to SQS](https://docs.aws.amazon.com/sns/latest/dg/sns-sqs-as-subscriber.html)). Raw message delivery must stay off. The worker would pass that envelope to this validator. That worker is not implemented.

### S3 permission and lifecycle

[Give SES permission to write to an S3 bucket](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-permissions.html): allow `ses.amazonaws.com` `s3:PutObject` on the bucket prefix, conditioned on `AWS:SourceAccount` and `AWS:SourceArn` of the specific receipt rule. Do not use a bucket wildcard principal.

[Deliver to S3 bucket](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-s3.html), same page, constraints that matter here:

- Default maximum size, including headers, is 40 MB. Larger mail bounces. The app cap remains 25 MB (`MAX_MESSAGE_BYTES`) until a later decision. The preflight rejects a declared size above the smaller of those two.
- The SNS action is a different action. Its notification can include the MIME and is limited to 150 KB ([publish to SNS](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-sns.html)). This preflight rejects `action.type` other than `S3`, and rejects a `content` field. The archive is the S3 object, not the notification.
- SES does not support receipt rules that upload to a bucket with Object Lock configured with a default retention period. Do not turn on default Object Lock retention on the receiving bucket. Immutability for a later approval is bucket versioning, a deny of `s3:DeleteObject` except a named break-glass role, and a lifecycle rule. It is not Object Lock default retention.
- If the "Message encryption" option is selected, SES encrypts with the Amazon S3 encryption client before the put. That is not S3 server-side encryption. The stored bytes are not the raw MIME, and the documented decrypt clients are the AWS SDK for Java and Ruby. This preflight does not select that option (`sesClientSideEncryptionSelected: false`). The planned at-rest control is bucket SSE-KMS with a customer managed key in `eu-central-1`, so a later `GetObject` returns the original MIME bytes. The KMS key alias must not be used where AWS says the full key ARN is required.
- The bucket should stay in a region where SES receiving exists. Frankfurt qualifies. Keep the bucket in `eu-central-1` with the topic and the key. Block public access. Deny non-TLS transport. No public ACL.

Lifecycle duration is an owner decision tied to the privacy notice. This preflight does not create a lifecycle rule and does not invent a retention period. Unknown-token quarantine in the synthetic inbox remains 14 days and applies to rows that this preflight does not write.

### Notification shape

[Contents of notifications](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-notifications-contents.html) and the [S3 alert example](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-notifications-examples.html):

- Outer SNS `Type` is `Notification`. `SubscriptionConfirmation` and `UnsubscribeConfirmation` are rejected. Their URLs are not followed and are not copied into the result.
- Inner `notificationType` is `Received`.
- `receipt.recipients` is the envelope RCPT TO list matched by the rule. Routing uses only that list.
- `receipt.action` for this path has `type` `S3`, `topicArn`, `bucketName`, and `objectKey`.
- `mail.source` is the envelope MAIL FROM. `mail.commonHeaders.from` is the header From. They are annotations, not authentication.
- `mail.destination` and header To/Cc are not routing keys.
- Verdict objects use `PASS`, `FAIL`, `GRAY`, and `PROCESSING_FAILED`.
- The notification does not include the receipt-rule ARN. `receiptRuleProvenByNotification` is therefore false. The topic policy's `AWS:SourceArn` condition is what binds the rule, and this code cannot see that policy.

The preflight accepts an object key only when it is exactly `original-mime/` plus `mail.messageId`. The AWS contents page says the S3 object key is the message id, while the S3 action page also allows a prefix. The fixture requires both: the configured prefix and the message id, with no extra segment and no `..`.

## 2. What the validator trusts

`validateSesReceivingNotice` is a pure function. `admitSesReceivingNotice` runs it only when `JAKOV360_INBOUND_MAIL_ENABLED` is exactly `true` and the caller passes `createSesPreflightContext`. That context is an in-process symbol. `JSON.parse` and object spread drop it. A From address, a subject, a reply token, a raw `Authentication-Results` header, and a certificate URL are not provider authentication.

SNS signature rules used here, from [Verifying the signatures of Amazon SNS messages](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html) and the [string-to-sign procedure](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html):

- Signature version 2 only (RSA-SHA256). Version 1 is SHA-1 and is rejected. Older AWS examples still show version 1. A future live topic that still emits version 1 will fail closed until a reviewed change. This preflight does not implement SHA-1 verification.
- String to sign for a notification, in order: `Message`, `MessageId`, `Subject` if present, `Timestamp`, `TopicArn`, `Type`. Each name and value is followed by a newline.
- `SigningCertURL` is not part of the signed string. It is allowlisted as `https://sns.eu-central-1.amazonaws.com/SimpleNotificationService-<alnum>.pem` and then compared to the caller-supplied pin. The URL is not retrieved. A pin for any other host is ignored.
- The pinned PEM must parse as an X.509 RSA certificate of at least 2048 bits and be valid at both the notice time and the checker time. This does not validate the Amazon certificate chain. Production must not treat this pin as a substitute for the AWS SDK verifier, which retrieves the certificate over HTTPS and checks the chain. That retrieval is intentionally absent until a separate approval, because an unrestricted URL fetch is the bug this preflight refuses.

After a valid signature, the checker still rejects a topic, account, or region other than the fixture; a timestamp more than 24 hours old or more than 5 minutes ahead (preflight windows, not AWS limits); a notification body over 128 KB; inline `content`; a non-S3 action; a bucket or key other than the fixture; truncated headers; and envelope recipients that are not a single `r.<token>@replies.example.test` address.

The reply token is hashed with SHA-256 for the result. It is not looked up, not written, and not logged. Two different envelope tokens are ambiguous and are not routed. A token on any other domain is `UNCONFIGURED_DOMAIN` and is not used to find a thread, including when a header carries a different token on the fixture domain. Header and body text cannot set `organizationId`. That field is always null.

SES `PASS` verdicts do not mark the sender `ALIGNED`. A disagreeing MAIL FROM and header From, or an SPF, DKIM, or DMARC `FAIL`, sets `spoofSuspected` and still leaves trust at `UNVERIFIED`. A raw `Authentication-Results` header is ignored. Virus `FAIL` and a fixture that matches the existing malware, executable, or denied-filename checks are not routed. Spam `FAIL` is held and is not routed. `GRAY` and `PROCESSING_FAILED` do not count as a clean scan.

`admitSesReceivingNotice` single-flights the accept callback on one in-process gate keyed by `ses:eu-central-1:111122223333:<ses-message-id>`. A second overlapping call on that gate does not run the callback again. A second gate in another process both succeed. `durableIdempotency` is false. The synthetic inbox unique key `(provider, providerMessageId)` is the later store. This preflight does not write it.

`JSON.parse` accepts duplicate keys and keeps the last one. There is no public endpoint feeding this parser. A consumer must get a stricter parser before it reads a queue.

## 3. Original MIME and the redacted rendering

Two different artifacts:

| Artifact | What it is in this preflight |
| --- | --- |
| Provider original | The future S3 object. Byte-for-byte MIME after SSE-KMS decrypt. SHA-256 is computed on those bytes at read time. This module does not read S3, so `providerObjectBytesRead` is false and `providerObjectSha256` is null. A fixture digest is labeled `fixtureDigestIsNotTheProviderObject`. |
| Redacted rendering | `sanitizeInboundText` of a separately supplied text fixture, with the reply token removed. `renderedEvidenceClass` is `REDACTED_RENDERING`. It is not the SMTP digest. HTML in a fixture sets `htmlMustBeSanitized`. |

The synthetic inbox column `raw_message` remains a redacted synthetic snapshot. See `docs/architecture/JAKOV360_M2_INBOUND_EVIDENCE_AND_VENDORS.md`. This preflight does not start writing provider originals into that column.

Download stays false. AI extraction stays false. Quote review, when a notice is otherwise acceptable, stays `UNREVIEWED`. Nothing is written into landed cost. No follow-up is sent. SES virus `PASS` is not the application's `CLEAN` scan. A later scanner must return `CLEAN` before any download or model call. The fixture scanner in `syntheticMalwareScan` is not ClamAV and is not a production control.

Access audit, retention, and deletion are specified for the later bucket and are not implemented: CloudTrail data events on `GetObject`, an application audit row for each read, a lifecycle expiration chosen with the privacy notice, and a delete path that removes the object and the redacted rendering together. Unknown objects are not given a tenant id.

Provider retry and poison messages go to the SQS dead-letter queue described above. A retry must not send mail and must not create a second quote. This module has no sender.

## 4. Owner approval checklist

Each line needs its own explicit approval. This document is not that approval.

1. AWS account owner, payer, and region `eu-central-1`. Confirm whether the account is in the SES sandbox and which current price plan applies. Re-read [Amazon SES pricing](https://aws.amazon.com/ses/pricing/) in the console. Do not treat the notes below as a quote.
2. Product choice inside AWS: classic SES receipt rules, which this preflight describes, or Mail Manager, which the pricing page prices separately. This document does not select Mail Manager.
3. Cost acceptance after the account exists. Published à la carte list prices on the US English pricing page on 2026-10-29 were: inbound email $0.10 per 1,000 emails, plus $0.09 per 1,000 incoming chunks. The same page prices Mail Manager email processing at $0.15 per 1,000 and an open ingress endpoint at $50 per month. S3, SNS, SQS, and KMS are additional services with their own pages. Prices change, and the EU currency page was not used as a source for these figures. This is not a quote.
4. DNS: a new MX only on the approved reply subdomain, value `10 inbound-smtp.eu-central-1.amazonaws.com`. Apex MX unchanged. `privacy@` unchanged. No record is proposed for production in this change.
5. SES domain verification and DKIM for that subdomain only, in `eu-central-1`.
6. IAM: receipt-rule role or bucket/topic policies as documented above, least privilege, no long-lived keys in GitHub or Render.
7. S3 bucket, SSE-KMS key, versioning, public-access block, TLS deny, lifecycle, and no Object Lock default retention.
8. SNS topic, SQS queue, and DLQ in `eu-central-1`, raw message delivery off, topic policy limited to the receipt-rule ARN.
9. Privacy notice for stored supplier mail, attachments, subprocessors, region, and retention. The 28 Oct 2026 production privacy update for optional connected Gmail does not cover this archive.
10. Secrets in the hosting environment, not in the repository.
11. Database backup, then a reviewed migration. The synthetic inbox migration and any later SES table stay unapplied on staging and production until that approval. CI may apply migrations only on an ephemeral database.
12. Staging test with two owner-controlled mailboxes: one contradictory quote and one attachment. No customer mail.
13. Production flag `JAKOV360_INBOUND_MAIL_ENABLED=true` only after the items above. Absence, `1`, `yes`, and `TRUE` stay off.
14. A later, separate decision to copy human-accepted fields into the cost engine. Marketplace chats stay manual import. `gmail.readonly` stays unrequested. Gmail `gmail.send` remains an optional From identity and cannot receive replies.

## 5. Tests and limitations

Tests are fixture PEM certificates, signed synthetic SNS bodies, and the ephemeral CI database. They cover a forged signature, signature version 1, wrong topic and account, certificate URL and pin failures, inline MIME, wrong bucket and object key, wrong receipt domain, two envelope tokens, a header token, prompt text that names another organization, spoofed From with a misleading `Authentication-Results` header, oversized and unsafe MIME, virus failure, spam hold, truncated headers, subscription-control messages, stale and future timestamps, the absent flag, an overlapping accept on one gate, and a second gate that does not share that lock. The database test looks for the fixture message id on inbound and outbound tables and expects no row.

Still unresolved, and not approved by this preflight:

- No provider account, no receipt rule, no bucket, no topic, no queue, and no MX.
- No Amazon CA chain check and no live certificate retrieval.
- No S3 read, malware appliance, HTML sanitizer beyond the existing text cleaner, or quote extractor on this path.
- No durable idempotency across processes.
- No stricter JSON parser.
- No public webhook and no change to PR #175, PR #177, or the PR #182 branch.
