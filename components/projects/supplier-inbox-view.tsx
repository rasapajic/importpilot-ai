import { inboxCopy, quoteFieldLabel } from "@/modules/supplier-inbox/domain/copy";
import type { ProjectInboxDto } from "@/modules/supplier-inbox/domain/types";

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function SupplierInboxView({
  model,
  locale,
  projectId,
}: {
  model: ProjectInboxDto;
  locale: string;
  projectId: string;
}) {
  const labels = inboxCopy(locale);
  return (
    <div className="supplier-inbox" data-testid="supplier-inbox">
      <p className="supplier-inbox-banner">
        {model.receivingEnabled ? labels.receivingOnSynthetic : labels.receivingOff}
      </p>
      <p>{labels.extractorNote}</p>
      <p>{labels.gmailNote}</p>
      <p>{labels.marketplaceNote}</p>
      <p data-testid="cost-note">{labels.costNote}</p>
      {model.threads.length === 0 ? <p>{labels.empty}</p> : null}
      {model.threads.map((thread) => (
        <section key={thread.id} className="dashboard-card supplier-inbox-thread">
          <header>
            <h2>{thread.supplierName}</h2>
            <p>
              {thread.status}
              {" · "}
              {thread.orderedQuantity}
            </p>
            {thread.ingestionDelayed ? <p>{labels.delayed}</p> : null}
            <p>{labels.noOrder}</p>
          </header>
          {thread.messages.map((message) => (
            <article key={message.id} className="supplier-inbox-message">
              <p>
                {labels.senderTrust}: {message.senderTrust}
              </p>
              <p>{message.subject}</p>
              <div className="supplier-inbox-columns">
                <section>
                  <h3>{labels.original}</h3>
                  <pre data-testid="inbox-original">{message.originalText}</pre>
                </section>
                <section>
                  <h3>{labels.serbian}</h3>
                  <pre data-testid="inbox-serbian">{message.serbianText}</pre>
                </section>
              </div>
              <h3>{labels.attachments}</h3>
              {message.attachments.length === 0 ? <p>—</p> : null}
              <ul>
                {message.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <span>{attachment.filename}</span>
                    {" · "}
                    <span>
                      {labels.scan}: {attachment.scanStatus}
                    </span>
                    {" · "}
                    <span>{attachment.sha256}</span>
                    {attachment.downloadAllowed ? (
                      <a href={`/api/projects/${projectId}/supplier-inbox/attachments/${attachment.id}`}>
                        {labels.download}
                      </a>
                    ) : (
                      <button type="button" disabled>
                        {labels.downloadBlocked}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <h3>{labels.fields}</h3>
              <ul>
                {message.extractions.map((field) => {
                  const blocked = field.flag !== "NONE" || field.fieldKey === "untrusted_instruction";
                  return (
                    <li key={field.id} data-testid="quote-field">
                      <strong>{quoteFieldLabel(field.fieldKey, locale)}</strong>
                      <pre>{formatValue(field.value)}</pre>
                      <p>
                        {labels.review}: {field.reviewStatus === "UNREVIEWED" ? labels.unreviewed : field.reviewStatus}
                        {" · "}
                        {field.flag}
                      </p>
                      <p>
                        {field.attachmentFilename ? `${field.attachmentFilename} ` : ""}
                        {field.page ? `p.${field.page} ` : ""}
                        {field.snippet}
                      </p>
                      {field.reviewStatus === "UNREVIEWED" && !blocked ? (
                        <form action={`/api/projects/${projectId}/supplier-inbox/review`} method="post">
                          <input type="hidden" name="action" value="accept" />
                          <input type="hidden" name="extractionId" value={field.id} />
                          <button type="submit">{labels.accept}</button>
                        </form>
                      ) : null}
                      {field.reviewStatus !== "REJECTED" ? (
                        <form action={`/api/projects/${projectId}/supplier-inbox/review`} method="post">
                          <input type="hidden" name="action" value="reject" />
                          <input type="hidden" name="extractionId" value={field.id} />
                          <button type="submit">{labels.reject}</button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
          {thread.followUps.map((followUp) => (
            <section key={followUp.id} data-testid="follow-up">
              <h3>{labels.followUp}</h3>
              <p>{followUp.status}</p>
              <p>{followUp.sentAt ? followUp.sentAt : labels.unsent}</p>
              <p>{followUp.subject}</p>
              <pre>{followUp.body}</pre>
            </section>
          ))}
          <p>{thread.confirmBlockedReason ?? labels.confirm}</p>
          <form action={`/api/projects/${projectId}/supplier-inbox/review`} method="post">
            <input type="hidden" name="action" value="confirm" />
            <input type="hidden" name="threadId" value={thread.id} />
            <button type="submit" disabled={!thread.confirmAllowed} data-testid="confirm-quote">
              {labels.confirm}
            </button>
          </form>
          {thread.messages.some((message) => message.senderTrust === "UNVERIFIED") && !thread.unverifiedSenderAcknowledged ? (
            <form action={`/api/projects/${projectId}/supplier-inbox/review`} method="post">
              <input type="hidden" name="action" value="acknowledge" />
              <input type="hidden" name="threadId" value={thread.id} />
              <button type="submit">{labels.acknowledge}</button>
            </form>
          ) : null}
          <h3>{labels.activity}</h3>
          <ol>
            {thread.events.map((event) => (
              <li key={event.id}>
                {event.type}: {event.summary}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
