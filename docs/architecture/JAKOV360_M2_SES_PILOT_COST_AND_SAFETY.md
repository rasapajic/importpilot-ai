# JAKOV360 M2 — SES pilot cost, spend limit, and stop plan

- Status: planning only for issue #184. No AWS account, payment method, IAM write, bucket, topic, queue, key, domain, DNS, MX, secret, live mail, migration, deploy, or merge.
- Date checked: 2026-10-29.
- Parent: draft PR #183 (`cursor/ses-inbound-preflight-c232` at `13298ef2d3e4ef8f8697d59064d48d754f7f225b`). Draft PRs #182 and #183 stay as they are. This note does not target `main` or `release/1.0.0`.
- Technical receiving shape: `docs/architecture/JAKOV360_M2_SES_RECEIVING_PREFLIGHT.md`.
- Prices below are public USD list prices. They are not a quote, a tax invoice, or spending authority. Read them again in the account before any resource is created.

`JAKOV360_INBOUND_MAIL_ENABLED` stays off. No module in this change calls AWS.

## 1. Owner decision this note supports

The proposed operating target is **USD 20 per month, before tax**, for a classic Amazon SES receiving pilot in **Europe (Frankfurt), `eu-central-1`**.

That target is an alert budget. On the account path that can place the archive in Frankfurt, AWS does not offer the hard spend limit. The path that does offer the hard spend limit assigns a Europe contact address to **Europe (Stockholm), `eu-north-1`**, and removes the limit if advanced features are turned on to reach other regions.

Nothing in this file authorizes spending. A fresh owner decision is required before an account exists, because a hard cap and Frankfurt residency are not both available on the published signup matrix.

At the design point (100 messages in a month, 1 MB each, resources left in place), the modeled pre-tax AWS total is **$1.05**. The largest modeled grid point (1,000 messages, 5 MB each) is **$3.03**. Both figures include the $1 customer-managed key and exclude tax, credits, and any service this design leaves turned off. Section 4 has the grid. Section 5 has the ways the bill leaves the target.

## 2. Sources read on 2026-10-29

| Topic | Source | What was taken from it |
| --- | --- | --- |
| SES list prices and plans | [Amazon SES pricing](https://aws.amazon.com/ses/pricing/) | À la carte inbound **$0.10 / 1,000 emails** plus **$0.09 / 1,000 complete 256 KB chunks**. Mail Manager open ingress **$50 / month / endpoint**, including while the endpoint is closed. Pro **$105 / account / region / month**. Enterprise **$500**. New account-region pairs with no metered SES use since 1 June 2025 start on Essentials on 21 July 2026. The first switch from that default to à la carte takes effect immediately. |
| Receiving regions | [SES endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/ses.html) | Inbound SMTP exists for Frankfurt (`inbound-smtp.eu-central-1.amazonaws.com`) and for Stockholm (`inbound-smtp.eu-north-1.amazonaws.com`). |
| Same-region rule | [Regions and Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/regions.html) | SNS, KMS, and a receipt rule set used for receiving must be in the receiving region. S3 is the documented exception. This design still keeps the bucket in the receiving region. |
| S3 action limits | [Deliver to S3](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-s3.html) | Default maximum 40 MB. Object Lock with a default retention period is unsupported. The SES "message encryption" option is client-side encryption and is not the at-rest control. |
| Chunk rule | SES pricing page, same historical rule as the [2015 receiving announcement](https://aws.amazon.com/blogs/aws/new-receive-and-process-incoming-email-with-amazon-ses/) | Only complete 256 KB chunks are billed. 768 KB is 3 chunks. 255 KB is 0 chunks. |
| Signup and region | [Compare sign-up options](https://docs.aws.amazon.com/accounts/latest/reference/sign-up-for-aws.html), [project regions](https://docs.aws.amazon.com/accounts/latest/reference/project-regions.html) (regions table current as of 18 August 2026 on that page) | "Create spend limits" is **Yes** for Sign up for AWS (new) and **No** for Sign up for AWS (advanced). "Select a specific AWS Region" is the opposite. Europe projects are `eu-north-1`. Changing the contact address does not move an existing project. |
| Advanced features | [Activate advanced AWS features](https://docs.aws.amazon.com/accounts/latest/reference/activate-advanced-features.html) | Activation removes every spend limit, paused projects resume, new spend limits cannot be created, and more regions become available. Activation cannot be reversed. |
| Spend limit behavior | [Create a spend limit](https://docs.aws.amazon.com/accounts/latest/reference/create-spend-limit.html), [upgrade to the Paid Plan](https://docs.aws.amazon.com/accounts/latest/reference/upgrade-account.html) | Paid Plan required. Minimum limit is the greater of $20 or AWS's conservative estimate. Pre-tax, credits excluded. Notifications at 50%, 75%, and 90%, plus a 10-day forecast. Reaching the limit pauses the project. After 90 days without reactivation, AWS deletes the project data. |
| Ordinary budgets | [Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html), [Billing console budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/bcm-lite-use-budget.html) | Billing data refreshes at least once a day. Alerts can lag the charge. A spend limit is created in AWS Settings, not in the Budgets console. |
| Services on the new experience | [Supported services for Sign up for AWS (new)](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html) | SES (deliverability dashboard excluded), S3, SNS, SQS, KMS, CloudTrail, CloudWatch, and IAM are on the Free Tier list. GuardDuty is on the unsupported list until advanced features are activated. |
| KMS | [KMS pricing](https://aws.amazon.com/kms/pricing/) and offer `awskms/20261026201814` for `eu-central-1` | **$1 per customer-managed key version per month** in Frankfurt. Symmetric requests **$0.03 / 10,000** after **20,000 requests / month** free across regions. Each of the first two rotations adds another $1 / month on the marketing page. |
| S3 | Offer `AmazonS3/20261015173540` for `eu-central-1` | Standard / General Purpose storage **$0.0245 / GB-month** for the first 50 TB. PUT/COPY/POST/LIST **$0.0054 / 1,000**. GET and other **$0.0043 / 10,000**. |
| SNS | Offer `AmazonSNS/20260915151944` for `eu-central-1`, plus the [SNS pricing](https://aws.amazon.com/sns/pricing/) page | Standard API requests: first **1,000,000 / month** at $0, then **$0.50 / 1,000,000**. Standard delivery attempts to SQS: **$0**. |
| SQS | Offer `AWSQueueService/20260911124607` for `eu-central-1`, plus the [SQS pricing](https://aws.amazon.com/sqs/pricing/) page | First **1,000,000 requests / month** at $0 for all customers, then standard **$0.40 / 1,000,000** in Frankfurt. Same-region SQS data transfer between AWS resources is $0. Internet transfer is a separate charge. |
| CloudTrail | [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/) and offer `AWSCloudTrail/20260911124531` | One trail copy of management events is $0. Further management copies are $2.00 / 100,000. Data events are $0.10 / 100,000. The Frankfurt offer matches those unit prices ($0.00002 and $0.000001). |
| CloudWatch | Offer `AmazonCloudWatch/20261007115540` for `eu-central-1` | First 10 alarms, first 10 metrics, and first 5 GB of log ingestion are $0 on the global free SKUs. A standard alarm after that is $0.10 / alarm-month. A custom metric is $0.30 / metric-month. Standard log ingestion is $0.63 / GB. |
| Budgets | Offer `AWSBudgets/20260911124529` | Budget notifications are $0 per budget-day in that file. An action-enabled budget is $0 for 62 budget-days, then $0.10 / budget-day. A budgets report is $0.01 / message. |
| GuardDuty S3 malware | Offer `AmazonGuardDuty/20261008231203` for `eu-central-1` | Malware Protection for S3: first 1 GB scanned $0, then **$0.129 / GB**. First 1,000 S3 PUT requests monitored $0, then **$0.000308 / request**. |
| Internet egress allowance | [EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/), Data Transfer section | **100 GB / month** of data transfer out to the internet, aggregated across services and regions, excluding China and GovCloud. The per-GB price after that allowance did not render on the page and was not extracted from the EC2 offer file. |
| Signature version | [Configure the SNS message signature version](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-configure-message-signature.html) | Topics default to SignatureVersion 1 (SHA-1). The page documents `SetTopicAttributes` with attribute `SignatureVersion` and value `2`. Its only worked example is the AWS CLI. |
| SES permissions | [Permissions for receiving](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-permissions.html) | Bucket, key, and topic statements conditioned on `AWS:SourceAccount` and `AWS:SourceArn`. |
| DLQ | [SNS dead-letter queues](https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html) | Subscription and DLQ queue must share account and region. SQS server-side retries can run 100,015 times over 23 days. DLQ retention of 14 days is the published recommendation. |

`eu-north-1` prices were not downloaded. Do not reuse the Frankfurt numbers for a Stockholm project.

No AWS account was opened. Whether a future signup screen offers "Sign up for AWS (new)", a Paid Plan, or the spend-limit button is **`ACCOUNT_CHECK_REQUIRED`**. The pages fetched on this date do not publish an account allowlist. They also do not repeat the words "limited rollout". The documented gates are the signup type and the Paid Plan.

## 3. Spend limit, ordinary budget, and Frankfurt

Three published facts decide this:

1. A spend limit exists for **Sign up for AWS (new)** projects on a **Paid Plan**. It is a project ceiling on pre-tax usage. At the ceiling, AWS pauses the project. If you take no action within 90 days of that pause, AWS permanently deletes the project data. The minimum value is the greater of **$20** and a conservative estimate of current resources. Notifications on that feature are 50%, 75%, and 90%, plus a forecast alert. The idle-resource control names EC2, RDS, and SageMaker. The top-cost-driver control names EC2, RDS, Lambda, Bedrock, and SageMaker. Neither list names SES, S3, SNS, or SQS.
2. **Sign up for AWS (advanced)** can select Frankfurt. The same comparison table sets "Create spend limits" to **No**. The account-management task list says a spend limit is "Not applicable" for that signup.
3. Turning on **advanced features** from a new-experience account is irreversible, removes spend limits that already exist, and then allows other regions. Replacement controls named on that page are Budgets, Cost Explorer, and Cost Anomaly Detection.

A Europe contact country on the project-region table, which includes Serbia (`RS`) among many others, is assigned **Stockholm**. The owner's future billing country was not inspected. Frankfurt is not one of the three project regions (Ohio, Stockholm, Sydney).

SES receiving itself exists in both Frankfurt and Stockholm. A Stockholm project could run the same receiving shape under a spend limit. That would store the MIME in Sweden, and it is a different decision from the one already recorded for Frankfurt. This plan does not move the pilot to Stockholm.

GuardDuty is absent from the new experience until advanced features are on. Those features remove the spend limit. Malware Protection for S3 is therefore priced only as an optional line on an advanced account.

### What to call the $20 figure

| Control | Can it sit on a Frankfurt receiving setup? | Does it stop the bill? |
| --- | --- | --- |
| AWS Settings spend limit | No, on the published matrix. Stockholm project only, and lost if advanced features are activated to leave Stockholm. | It pauses that project. It can also delete project data after 90 days. That deletion conflicts with an evidence archive. |
| Ordinary AWS Budget at $20, alerts at 25%, 50%, 75%, and 90% of actual spend | Yes, on an advanced account in Frankfurt. | No. Reports lag. The best-practices page says billing data refreshes at least once a day. An alert is not a stop. |
| This worksheet's operating target | Yes, as a number the owner watches. | No. |

**Finding:** for the chosen Frankfurt design, the $20 figure is a **target and an alert budget**. It is **`NOT_A_CAP`**. A hard cap that also keeps Frankfurt was not found in the public docs. Confirming the buttons in a real account is **`ACCOUNT_CHECK_REQUIRED`**. If the console has no spend limit that applies to `eu-central-1` resources, the owner decides again before any resource is created.

The Paid Plan described for AWS Settings is the usage plan that follows the free credit plan. This review did not find a separate monthly fee for that plan. It is a different product from an AWS Support plan. This pilot does not add Developer, Business, or Enterprise Support.

## 4. Cost worksheet

### 4.1 How a row is built

Official meters, used as published:

- SES email charge = messages × $0.10 / 1,000.
- SES chunk charge = messages × complete chunks × $0.09 / 1,000.
- One complete chunk = 256 KB. **1 MB in this sheet means 1,024 KB, which is 4 chunks.** That is the reading that reproduces the issue's own example: 100 messages × 1 MB = 400 chunks = $0.01 + $0.036 = **$0.046** of SES ingestion.
- 0.1 MB = 102.4 KB, which is below 256 KB, so **0 chunks**. 5 MB = 5,120 KB = **20 chunks**.
- S3 storage GB = messages × MB / 1,024. Price = GB × **$0.0245**. This assumes the object is stored for the month it arrives and is not overwritten.
- S3 PUT = messages × $0.0054 / 1,000. One PUT from SES per message.
- S3 GET = messages × $0.0043 / 10,000. One worker read per message.
- KMS key = **$1.00** for one version, for any month the key exists, including a month with zero mail. Requests at or below 20,000 stay on the published free tier. The grid stays under that tier if each object causes one encrypt and one decrypt and nothing else uses the key.
- SNS standard publishes and SQS standard requests stay inside the published first 1,000,000. SNS delivery attempts to SQS are $0 on the Frankfurt SKU `EUC1-DeliveryAttempts-SQS`.
- CloudTrail data events, if turned on for the prefix, are 2 × messages × $0.10 / 100,000. The first management-event trail copy is $0. No second trail, Insights, or Lake.
- Two CloudWatch alarms on SQS metrics stay inside the first 10 free alarms. No custom metrics. No application log ingestion.
- Internet egress for the grid is under 100 GB (1,000 × 5 MB is about 4.9 GB). Modeled egress is $0 while that published allowance still has room. The $/GB price after 100 GB is **`RATE_NOT_VERIFIED`**.

Engineering assumptions, labeled as such:

- Every message is exactly the row's size. A mix of sizes is not averaged into the chunk count, because only complete chunks bill and an average can hide them.
- The account is on **à la carte** classic receipt rules. The Essentials, Pro, and Enterprise meters on the pricing page are defined there as outbound sends or Mail Manager processing. A brand-new account-region can still be placed on Essentials. The console has to be read before mail is accepted. That check is **`ACCOUNT_CHECK_REQUIRED`**.
- No promotional credit is subtracted. The SES page describes up to $200 of new-customer credits, and the billing pages describe $100 plus up to $100 more. Those credits are time-limited and were not applied.
- Tax is excluded. The pricing pages say list prices exclude VAT and sales tax. The rate depends on the billing address and tax registration. **`TAX_ACCOUNT_CHECK_REQUIRED`**. The $20 target is pre-tax, which matches how a spend limit is defined, on the path where a spend limit exists.
- The worker is the existing application host. It is not a new EC2, Lambda, NAT gateway, or load balancer. Its non-AWS fee is outside this sheet.
- SNS and SQS do not use the customer-managed key. S3 does. The receipt-rule "message encryption" checkbox stays off, so the stored object remains the raw MIME under bucket SSE-KMS.
- SQS long polling from outside AWS is assumed at one receive every 20 seconds while a consumer runs: about 130,000 receives in 30 days, still inside the 1,000,000 request allowance. A tight one-second poll can leave that allowance. After it, the Frankfurt standard rate is $0.40 per million.

The SNS pricing page also says data moved from SNS to SQS is charged at internet data-transfer rates, including inside one region. The Frankfurt SNS offer file used here has no separate standard-topic GB SKU for that path, and the delivery-attempt SKU is $0. SES S3 notifications carry a pointer, not the MIME. Residual GB pricing for that hop is **`RATE_NOT_VERIFIED`**. It is not given a dollar value in the grid.

### 4.2 Selected-design grid, USD per month, pre-tax

The total column is the $1 key plus SES, S3 storage, one PUT, and one GET. SNS, SQS, KMS requests, the first CloudTrail management copy, two alarms, and in-allowance egress are $0 under the assumptions above. CloudTrail data events add less than one cent even at 1,000 messages and are omitted from the rounded total.

| Messages / month | Size | Chunks each | SES | S3 storage | S3 PUT + GET | Key | Modeled total |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | — | — | 0 | 0 | 0 | 1.00 | **1.00** |
| 10 | 0.1 MB | 0 | 0.0010 | 0.0000 | 0.0001 | 1.00 | **1.00** |
| 10 | 1 MB | 4 | 0.0046 | 0.0002 | 0.0001 | 1.00 | **1.00** |
| 10 | 5 MB | 20 | 0.0190 | 0.0012 | 0.0001 | 1.00 | **1.02** |
| 100 | 0.1 MB | 0 | 0.0100 | 0.0002 | 0.0006 | 1.00 | **1.01** |
| 100 | 1 MB | 4 | 0.0460 | 0.0024 | 0.0006 | 1.00 | **1.05** |
| 100 | 5 MB | 20 | 0.1900 | 0.0120 | 0.0006 | 1.00 | **1.20** |
| 1,000 | 0.1 MB | 0 | 0.1000 | 0.0024 | 0.0058 | 1.00 | **1.11** |
| 1,000 | 1 MB | 4 | 0.4600 | 0.0239 | 0.0058 | 1.00 | **1.49** |
| 1,000 | 5 MB | 20 | 1.9000 | 0.1196 | 0.0058 | 1.00 | **3.03** |

The financial design point in the issue is the **100 × 1 MB** row: about **$1.05** against a **$20** pre-tax target. The 10–20 real test replies, once separately approved, sit near the 10-message rows.

Holding a steady 1,000 × 5 MB for 12 months, with no expiration, makes the storage line about **$1.44 / month** at the end of the year (12 × 4.8828125 GB × $0.0245) while that month's SES charge is still $1.90 and the key is still $1. That steady state remains under $20. Retention length is still an owner and privacy decision. This sheet does not choose it.

### 4.3 Lines that stay off the selected total

| Line | Published price used | Treatment |
| --- | --- | --- |
| Mail Manager open or mTLS ingress | $50 / month / endpoint, billed until the endpoint is deleted, including status Closed | Out. One endpoint spends the target more than twice over. |
| Mail Manager processing | $0.15 / 1,000 emails, plus the chunk meter | Out. Classic receipt rules are the selected product. |
| Essentials / Pro / Enterprise plan fees | Essentials has no fixed fee in the plan table. Pro is $105. Enterprise is $500. Per-email plan rates differ from à la carte. | Out until the console shows à la carte. |
| Dedicated IP, BYOIP, Virtual Deliverability Manager, tenants, Global Endpoints | From $15 to $1,250 / month on the same SES page, depending on the add-on | Out. |
| Automatic KMS rotation | Up to two extra $1 / month key versions | Out. One version only. |
| GuardDuty Malware Protection for S3 | $0.129 / GB after the first 1 GB, and $0.000308 / PUT after the first 1,000 | Optional on an advanced account only. At 1,000 × 5 MB the scanned volume is about 4.9 GB, so about **$0.50** after the first free GB, plus $0 of PUT fees inside the first 1,000. Full GuardDuty (VPC, CloudTrail analysis, and the rest) was not priced and stays off. |
| Mail Manager Trend Micro add-on | $0.1875 / 1,000 emails | Out with Mail Manager. At 1,000 emails the add-on alone would be about $0.19. It is not a substitute for the application scan. |
| CloudTrail Lake | Frankfurt offer shows $2.50 / GB for the first 5 GB on one ingestion SKU. The marketing page lists $0.75 / GB for one-year retention of CloudTrail events. | Out. The two pages describe different Lake options. Neither is selected. |
| CloudWatch Logs delivery of the trail | $0.25 / GB on the CloudTrail page, plus log ingestion | Out. |
| New compute, NAT, load balancer, AWS Support, Route 53 domain purchase | Not selected, so not given a modeled total | Out. A Route 53 domain also has the spend-limit note that only one domain can be purchased every 24 hours on that feature. This pilot does not buy a domain. |
| VAT or sales tax | Not a single rate | **`TAX_ACCOUNT_CHECK_REQUIRED`**. |

## 5. Ways the bill leaves $20

These are arithmetic illustrations from the same official meters, not forecasts.

| Event | Modeled pre-tax addition | Result |
| --- | --- | --- |
| The key exists and no mail arrives | $1.00 / month | Inside the target. This is the idle-pilot floor. |
| Design point, 100 × 1 MB | $1.05 | Inside the target. |
| Grid maximum, 1,000 × 5 MB | $3.03 | Inside the target. |
| 1,000 messages at the application cap of 25 MB (100 chunks each) | SES $9.10 + S3 storage about $0.60 + key $1 | About **$10.70**. Inside the target, and already far above the financial design size. The application cap is applied after SES has accepted the bytes. |
| 1,000 messages at the SES S3-action maximum of 40 MB (160 chunks each) | SES $14.50 + S3 storage about $0.96 + key $1 | About **$16.46**. Still inside $20, with little room for tax or a second key. |
| 10,000 messages at 40 MB | SES $145 + S3 storage about $9.57 + key $1 | About **$156**. Outside the target. A public MX can receive this. There is no hard cap on the Frankfurt path. |
| One Mail Manager ingress endpoint | $50 | Outside the target even with zero mail. Deleting the endpoint is what stops that charge. |
| Pro plan fixed fee, or one dedicated IP | $105, or $24.95 | Outside the target. |

The receipt rule's recipient condition and a disabled rule set are the practical limits. They are operational, not a billing cap. IP filters can drop some SMTP sources and are a later hardening step, not part of the first test.

## 6. Minimum resources

Design names only. The account id `111122223333` is the placeholder from AWS documentation examples. It is not a JAKOV360 account.

| Piece | Design value | Why it is the minimum |
| --- | --- | --- |
| Region | `eu-central-1` only | Owner decision. SNS, KMS, rules, queue, and bucket stay here. |
| SES product | Classic receipt rule set. À la carte. | Avoids the $50 ingress endpoint and the plan fixed fees. |
| Identity | One future reply subdomain | Apex MX and `privacy@jakov360.com` stay unchanged. |
| Rule | One active rule set, one rule, S3 action, prefix `original-mime/`, SNS notification, message encryption unchecked | The preflight rejects every other action and any inline `content`. |
| KMS | One symmetric customer-managed key. Rotation off. Alias for humans. Policies and the bucket use the key ARN. | $1 / month. A second version is another dollar. |
| S3 | One bucket, Block Public Access on, versioning on, Object Lock off, default encryption SSE-KMS with an S3 Bucket Key, TLS required | Object Lock default retention is incompatible with the S3 receiving action. The bucket key is a request reduction, not a modeled discount. |
| SNS | One standard topic. SignatureVersion **2**. Raw message delivery off. SSE with a customer-managed key left off. | Version 1 is SHA-1 and the preflight fails closed on it. A CMK on the topic adds an unmodeled KMS request rate. The MIME is not in the notification. |
| SQS | One standard queue and one standard DLQ. Subscription and both queues in the same account and region. Queue SSE is SSE-SQS, not the customer-managed key. Retention 14 days. | The queue holds a pointer. The archive is the S3 object. After 14 days SQS can drop the pointer; it must not be treated as the copy of record. |
| Consumer | Not deployed by this plan | Overlapping accepts are single-flight only inside one process. `durableIdempotency` is false. A second process can write twice. The consumer waits until a durable `(provider, providerMessageId)` key exists, a strict JSON parser rejects duplicate keys, and the SNS signature check uses the AWS certificate chain. |
| Scanner | Existing fixture scanner is not the production control | GuardDuty is optional and incompatible with a spend limit. A production scanner still has to return a clean result before download or a model call. |
| Trail | At most one trail, management events, to a separate log bucket or the account's existing single trail. Data events may be limited to `GetObject` and `PutObject` on `original-mime/`. | A second management copy is a paid meter. Lake and Insights stay off. |
| Alarms | DLQ `ApproximateNumberOfMessagesVisible` ≥ 1, and the main queue `ApproximateAgeOfOldestMessage` above the review window | Both are SQS metrics. The alarm notification goes to an email, not to the receiving topic. |
| Budget | One monthly cost budget, $20, unblended, pre-tax, actual alerts at 25, 50, 75, and 90 percent, email only, actions off | This is the Frankfurt control. It does not pause SES. |
| Identity for the worker | No access key in this plan | When a later approval creates a worker credential, it is least privilege and it stays out of git and out of the Render env until that approval. |

Idempotency, once a consumer is allowed: the accept runs once per SES message id in the account. A retry must not send mail and must not create a second quote. Poison messages land on the DLQ and stay there until a person looks at them. The stop procedure does not purge the DLQ.

## 7. Example policies

These are copies of the AWS receiving-permission examples, with the region written as `eu-central-1` and the names left as placeholders. They are not attached to anything. Do not paste them during issue #184.

The published IAM-role example on the permissions page contains the key ARN `arn:aws:kms:us-east-1::111122223333:key/key-id` (an empty account field). Do not copy that ARN. The key ARN form to use later is `arn:aws:kms:eu-central-1:111122223333:key/KEY_ID`.

Same-account Frankfurt bucket policy, from "Give SES permission to write to an S3 bucket". Prefer this over an IAM role because the bucket is in a receiving region.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESPuts",
      "Effect": "Allow",
      "Principal": { "Service": "ses.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/original-mime/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceAccount": "111122223333",
          "AWS:SourceArn": "arn:aws:ses:eu-central-1:111122223333:receipt-rule-set/rule_set_name:receipt-rule/receipt_rule_name"
        }
      }
    }
  ]
}
```

Key-policy statement to add, from the same page's SSE-KMS variant. Add it beside the console's default administrator statement. Replacing the whole key policy can lock the key.

```json
{
  "Sid": "AllowSESToUseTheBucketKey",
  "Effect": "Allow",
  "Principal": { "Service": "ses.amazonaws.com" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceAccount": "111122223333",
      "AWS:SourceArn": "arn:aws:ses:eu-central-1:111122223333:receipt-rule-set/rule_set_name:receipt-rule/receipt_rule_name"
    }
  }
}
```

Topic policy, adapted from the same page's cross-account example so both account ids are the pilot account. `SNS:Publish` is the action spelling in that example.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ses.amazonaws.com" },
      "Action": "SNS:Publish",
      "Resource": "arn:aws:sns:eu-central-1:111122223333:topic_name",
      "Condition": {
        "StringEquals": {
          "AWS:SourceAccount": "111122223333",
          "AWS:SourceArn": "arn:aws:ses:eu-central-1:111122223333:receipt-rule-set/rule_set_name:receipt-rule/receipt_rule_name"
        }
      }
    }
  ]
}
```

Queue policy for the SNS subscription. This shape is the standard SNS-to-SQS grant. The DLQ needs the same statement with the DLQ ARN, because SNS writes there directly.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "sns.amazonaws.com" },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:eu-central-1:111122223333:queue_name",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:sns:eu-central-1:111122223333:topic_name"
        }
      }
    }
  ]
}
```

Later worker identity, written for this design and not copied from an AWS tutorial. It cannot delete objects and it cannot publish.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/original-mime/*"
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "arn:aws:kms:eu-central-1:111122223333:key/KEY_ID"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:eu-central-1:111122223333:queue_name"
    }
  ]
}
```

A `Deny` of `s3:DeleteObject` for every principal except one break-glass role matches the preflight. A wrong `Deny` can make the bucket undeletable, including by the owner. Add that `Deny` only in a later change, and prove it first on a disposable object that is not supplier mail. Versioning plus the absence of `s3:DeleteObject` on the worker is the control this minimum set actually specifies.

Signature check the future consumer must perform, still not implemented here:

- `SignatureVersion` is `2` (RSA-SHA256). Version 1 fails closed.
- `SigningCertURL` is HTTPS on `sns.eu-central-1.amazonaws.com`. The certificate chain is the Amazon chain. A pinned fixture PEM is not the production check.
- The JSON parser rejects duplicate keys.
- `SubscribeURL` and `UnsubscribeURL` are not fetched.
- Raw message delivery stays off, so the SQS body is still the signed SNS envelope.

## 8. Future setup, one action at a time

Do not perform this list under issue #184. Start it only after section 11 is signed. Each number is one sitting. Stop at the end of the number. If a screen disagrees with the linked doc, stop and reread the doc rather than improvising. No PowerShell. No script from this repository.

1. Sign in to the AWS account the owner has already decided to use. Write down the 12-digit account id. Stop if that account also holds unrelated production workloads.
2. Open [AWS Settings](https://settings.aws.com) if the account is a project, or the region menu in the advanced console if it is not. Record which one you see. This is the **`ACCOUNT_CHECK_REQUIRED`** fork.
3. If the screen is a project, open Project, Additional Info, and record the assigned region. If it is `eu-north-1` and the decision is still Frankfurt, stop. Do not create the resources in Stockholm under this plan.
4. If the screen offers "Activate advanced features" as the way to reach Frankfurt, stop. That action removes spend limits and cannot be undone. It needs its own written decision.
5. On an advanced account, open Billing and Cost Management, Budgets, and create one monthly cost budget for $20 of actual cost. In the advanced options, exclude taxes so the figure matches the pre-tax target. Save it before adding alerts.
6. Add email alerts at 25%, 50%, 75%, and 90% of actual spend. Leave budget actions off. Label the budget, in its name, `target-not-a-cap`.
7. Open the SES console in **Europe (Frankfurt)**. Confirm the region indicator says Frankfurt / `eu-central-1`. If the console returns you to another region and will not stay, stop.
8. Open the SES pricing or account plan control and record whether the account-region is à la carte, Essentials, Pro, or Enterprise. If it is anything other than à la carte, stop. Do not create an ingress endpoint while you look.
9. Open KMS in Frankfurt. Create one symmetric customer-managed key. Leave automatic rotation off. Give it an alias you can recognize. Copy the key ARN.
10. Open S3. Create one bucket in Europe (Frankfurt). Turn on "Block all public access" in that creation step.
11. Open the bucket, turn versioning on. Leave Object Lock off. If the creation wizard already locked the bucket, stop and leave it empty. SES cannot use a bucket with Object Lock default retention.
12. Set default encryption to SSE-KMS, choose the key by ARN, and enable the S3 Bucket Key.
13. Add a bucket policy statement that denies any request where `aws:SecureTransport` is false. Save.
14. Leave lifecycle empty. Retention waits for the privacy decision.
15. Open SNS in Frankfurt. Create one **standard** topic. Leave encryption disabled. Copy the topic ARN.
16. On that topic's edit screen, look for a signature-version control. If it is present, set it to **2** and save.
17. If the console has no signature-version control, stop for the day. The only procedure on the [official page](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-configure-message-signature.html) is `SetTopicAttributes` with attribute name `SignatureVersion` and value `2`, and the worked example is the AWS CLI. A later approval may run that one command and then `GetTopicAttributes` to read the value back. Do not run it from this repository, and do not use PowerShell. Leave the topic unused until the attribute reads `2`.
18. Open the topic access policy and add the SES `SNS:Publish` statement from section 7, with this account, `eu-central-1`, and the rule name you are about to create. If the rule does not exist yet, use a name you write down and use that exact name in the later rule step.
19. Open SQS in Frankfurt. Create one standard queue for the consumer and one standard queue for the dead letter. Set both message retention periods to 14 days. Leave encryption on the SQS-managed setting.
20. On the consumer queue, set a redrive policy whose dead-letter target is the DLQ. Use a small max-receive count so a poison message leaves the main queue.
21. Attach the SNS `sqs:SendMessage` statement from section 7 to the consumer queue, then the same statement to the DLQ with the DLQ ARN.
22. In SNS, create a subscription from the topic to the consumer queue. Protocol SQS. Leave raw message delivery **disabled**.
23. On that subscription, set the dead-letter queue to the DLQ. The subscription and the DLQ must show the same account and `eu-central-1`.
24. Publish one console test notification to the topic, with no mail content. Receive it from the queue in the console. Confirm the JSON contains `"SignatureVersion": "2"`. Delete that test message. If the field is `1`, stop and return to step 16 or 17.
25. In SES, still in Frankfurt, create a domain identity for the future reply subdomain only. Do not add the apex domain. Do not add `privacy@jakov360.com`.
26. Start DKIM for that subdomain. The DNS records at the current DNS host are a separate approval. Do not publish them in this sitting unless that approval is already written. Easy DKIM tokens are not MX records.
27. Create a receipt rule set. Do not set it active yet.
28. Add one rule. Recipient condition: the reply subdomain. Action: deliver to the S3 bucket, object key prefix `original-mime/`, SNS topic set to the topic from step 15. Leave "Encrypt message" unchecked. Add no Lambda action and no bounce action.
29. Add the bucket policy from section 7 and the KMS statement from section 7, using the real rule-set name and rule name. Keep the existing key administrators in the key policy.
30. Set the rule set active only for the window the owner has approved. If that approval is not today's, leave the rule set inactive and stop. An inactive rule set does not receive mail.
31. Create the CloudWatch alarms from section 6. Point them at an email that is not the receiving topic.
32. If the account has no CloudTrail trail, create one trail for management events. Skip a second trail if one already exists. Leave Insights and Lake off. Data events on `original-mime/` are a separate yes, because they are a paid meter even though the grid makes them a fraction of a cent.
33. Do not create an IAM access key in the setup sitting. Do not set `JAKOV360_INBOUND_MAIL_ENABLED`. Do not change Render. Do not publish an MX record. The MX value, when a later approval exists, is `10 inbound-smtp.eu-central-1.amazonaws.com` on the reply subdomain only.

After those gates, a test is still a separate approval: two owner-controlled mailboxes, 10 to 20 messages, no customer mail, no supplier mail that is not part of that test.

## 9. Stop and rollback

Use this only after resources exist. Issue #184 does not run it. The order matters: stop new mail first, then stop the consumer, then look. Do not delete the archive as a way to stop the bill.

1. In SES, Frankfurt, open the receipt rule set and disable it, or set the active rule set to none. New SMTP deliveries stop being accepted by this rule. Write down the time.
2. If mail must also stop at DNS, remove only the reply subdomain's MX in a separate approved change. Leave the apex MX and `privacy@` as they are. Disabling the rule is the AWS-side stop and does not require a DNS change to halt receipt into the bucket.
3. In SNS, delete or disable the SQS subscription so new notifications are not delivered. Leave the topic in place until the queue is understood.
4. Stop the consumer process. Do not deploy, restart, or change Render configuration as part of a casual look. Stopping a consumer that was never started is a no-op.
5. In SQS, open the main queue and the DLQ. Record visible message counts and the age of the oldest message. Leave the messages. A test reply that arrived before the rule was disabled is still evidence. Do not purge.
6. In S3, confirm the `original-mime/` objects are still present. Do not add a lifecycle expiration, do not empty the bucket, and do not turn on a rule that deletes noncurrent versions.
7. Leave the KMS key enabled so those objects can still be decrypted. Scheduling key deletion is a separate decision. Deletion makes the archive unreadable. The $1 charge continues until the key is pending deletion or deleted. The pricing page says a key scheduled for deletion is not charged, and cancelling deletion bills it as if deletion was never scheduled.
8. The next day, open Cost Explorer for SES, S3, KMS, SNS, and SQS. Budget data can lag, so a same-day total is not the month's bill.
9. Confirm no legitimate test reply was discarded. If the DLQ holds one, a person decides whether to redrive it after the consumer is safe, or to leave it.
10. To resume, reverse the stop: consumer ready, signature version still 2, subscription restored with raw delivery off, then the rule set made active. Resume is its own approval.

Never auto-delete the evidence archive to save the storage line. At the design point that line is a fraction of a cent.

## 10. Data protection

- The object in S3 is the supplier's raw MIME, which can contain personal data and commercial terms. The redacted rendering in the app database is a different artifact. This plan does not start writing either one.
- The 28 October 2026 privacy text for optional connected Gmail does not cover this archive. Real mail waits for a privacy and retention decision. The retention period is not invented here.
- Region for the selected design is Frankfurt. A Stockholm spend-limit project would be a different storage country.
- Two owner-controlled mailboxes only, and only after the test approval. No customer mailbox. No inbox read through Gmail. `gmail.readonly` stays unrequested.
- Block Public Access stays on. The bucket policy allows `s3:PutObject` to `ses.amazonaws.com` only with the account and rule ARN conditions. The worker, when it exists, gets `s3:GetObject` on the prefix.
- Versioning is the undo for an overwrite. Object Lock default retention stays off because SES receiving does not support it.
- The consumer must not log the reply token, the message body, or the certificate PEM.
- A `GetObject` of a real message is an access to personal data. The later audit is a CloudTrail data event plus an application audit row. Neither is implemented by this change.
- Unknown recipients do not get a tenant id. The preflight already refuses a second token and a token on any other domain.
- SQS retention of 14 days is a delivery buffer. It is not the retention period for the MIME.
- The 90-day project-data deletion that follows a spend-limit pause is unsafe for this archive. It is another reason the Frankfurt path uses an alert budget and a manual stop, rather than a feature that deletes the project.

## 11. Release gate

Every line is still open. This document does not check any of them.

| Gate | State on 2026-10-29 |
| --- | --- |
| Written cost estimate accepted, with the grid in section 4 and the overrun cases in section 5 | Open. Target $20 pre-tax. Modeled design point about $1.05. |
| Budget exists in the account and is named as a target, not a cap. Frankfurt spend-limit result recorded, including `ACCOUNT_CHECK_REQUIRED` if the console was not opened | Open. No account was opened. Public docs say a hard cap and Frankfurt do not combine. |
| À la carte classic SES confirmed in the console. Mail Manager ingress absent. Plan is not Pro or Enterprise | Open. |
| Privacy text covers supplier MIME, attachments, subprocessors, Frankfurt, and retention | Open. |
| Operator approves a mailbox test: two owner-controlled mailboxes, 10–20 messages | Open. Synthetic fixtures only until then. |
| Immutable staging database backup taken, and a restore rehearsed, before any schema migration | Open. No migration in this change. |
| IAM reviewed against section 7, including `AWS:SourceAccount` and `AWS:SourceArn` | Open. No policy attached. |
| Route authentication unchanged. No new public webhook | Open. The preflight still has no public route. |
| Production untouched. `JAKOV360_INBOUND_MAIL_ENABLED` remains off. Render not changed | Open, and this change keeps it that way. |
| Worker has a durable idempotency key, a strict JSON parser, and SNS SignatureVersion 2 checked with the Amazon certificate chain | Open. Not implemented. |
| Manual rollback in section 9 is accepted, including "do not delete the archive" | Open. |
| No production deploy, no merge to `main` or `release/1.0.0` | Open. |

## 12. What this change does

It adds this note and a pointer from the SES preflight document. It does not provision AWS, publish DNS, send or receive mail, rotate a key, store a secret, or change application behavior.
