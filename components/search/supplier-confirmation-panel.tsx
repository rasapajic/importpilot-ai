"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Locale } from "@/modules/i18n/translations";
import {
  buildSupplierConfirmationBrief,
  confirmSupplierTerm,
  createPreparedConfirmation,
  markInquirySent,
  saveSupplierReply,
  SupplierConfirmationStatuses,
  type SupplierConfirmationRecord,
  type SupplierConfirmationStatus,
} from "@/modules/negotiation/domain/supplier-confirmation";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";

const statuses: SupplierConfirmationStatus[] = [
  SupplierConfirmationStatuses.FOUND,
  SupplierConfirmationStatuses.PREPARED,
  SupplierConfirmationStatuses.SENT,
  SupplierConfirmationStatuses.RESPONSE_RECEIVED,
  SupplierConfirmationStatuses.DOCUMENTED,
];

type Copy = {
  requestConfirmation: string;
  hideConfirmation: string;
  confirmedBySources: string;
  missing: string;
  askSupplier: string;
  message: string;
  notSent: string;
  copy: string;
  copied: string;
  openListing: string;
  markSent: string;
  sent: string;
  response: string;
  writtenQuote: string;
  saveReply: string;
  extracted: string;
  confirmValue: string;
  confirmed: string;
  supplierPrice: string;
  unconfirmedCosts: string;
  additionalConfirmation: string;
  evidence: string;
  status: Record<SupplierConfirmationStatus, string>;
  evidenceLabel: Record<string, string>;
  termLabel: Record<string, string>;
};

const copy: Record<Locale, Copy> = {
  sr: {
    requestConfirmation: "Zatraži potvrdu",
    hideConfirmation: "Sakrij potvrdu",
    confirmedBySources: "Potvrđeno javnim izvorima",
    missing: "Nedostaje",
    askSupplier: "Tražiti od dobavljača",
    message: "Poruka za dobavljača",
    notSent: "Aplikacija ne šalje ovu poruku. Kopirajte je i pošaljite je sami.",
    copy: "Kopiraj poruku",
    copied: "Poruka je kopirana",
    openListing: "Otvori originalni oglas",
    markSent: "Upit sam poslao dobavljaču",
    sent: "Upit je označen kao poslat",
    response: "Odgovor dobavljača",
    writtenQuote: "Pisana ponuda",
    saveReply: "Sačuvaj odgovor",
    extracted: "Izdvojene vrednosti iz pisane ponude",
    confirmValue: "Potvrđujem ovu vrednost",
    confirmed: "Potvrđeno",
    supplierPrice: "Potvrđena cena dobavljača",
    unconfirmedCosts: "Transport, carina i ostali troškovi ostaju nepotvrđeni i ne ulaze u cenu dobavljača.",
    additionalConfirmation: "Potrebna je dodatna potvrda. Odgovor ne pokriva traženu količinu ili specifikaciju.",
    evidence: "Povezano sa pisanom ponudom",
    status: {
      FOUND: "Pronađen kandidat",
      PREPARED: "Upit pripremljen",
      SENT: "Upit poslat",
      RESPONSE_RECEIVED: "Odgovor primljen",
      DOCUMENTED: "Ponuda dokumentovana",
    },
    evidenceLabel: {
      PUBLISHED_TIER_PRICE: "Objavljen je količinski razred za traženu količinu.",
      PUBLISHED_TIER_IS_NOT_A_QUOTE: "Taj razred nije pisana ponuda dobavljača.",
      ADVERTISED_PRICE_NOT_FOR_QUANTITY: "Reklamirana cena nije potvrđena za traženu količinu.",
      ADVERTISED_PRICE_APPLIES_LATER: "Reklamirana niža cena važi tek od veće količine.",
      LISTED_MOQ_NOT_AN_ORDER_TERM: "MOQ iz oglasa ne potvrđuje narudžbinu ni mešanje varijanti.",
      LISTED_INCOTERM: "Incoterm je naveden u oglasu i traži potvrdu.",
      QUANTITY_PRICE: "Cena za traženu količinu.",
      WRITTEN_SUPPLIER_PRICE: "Pisana cena dobavljača.",
      STOCK_OR_PRODUCTION: "Da li je roba sa lagera ili iz proizvodnje.",
      PACKAGING: "Pakovanje.",
      DOCUMENTS: "Dokumentacija.",
      TRANSPORT: "Transport.",
      CUSTOMS: "Carina.",
      OTHER_COSTS: "Ostali troškovi.",
      LEAD_TIME: "Rok.",
      INCOTERM: "Incoterm za ovu narudžbinu.",
      DIOPTERS: "Tačne dioptrije.",
      MOQ_PER_DIOPTER_COLOR_MODEL: "MOQ po dioptriji, boji i modelu.",
      MOQ_PER_VARIANT: "MOQ po varijanti.",
    },
    termLabel: {
      UNIT_PRICE: "Cena",
      ORDER_QUANTITY: "Količina",
      MOQ: "MOQ",
      INCOTERM: "Incoterm",
      LEAD_TIME_DAYS: "Rok u danima",
      DIOPTERS: "Dioptrije",
    },
  },
  de: {
    requestConfirmation: "Bestätigung anfragen",
    hideConfirmation: "Bestätigung ausblenden",
    confirmedBySources: "Durch öffentliche Quellen belegt",
    missing: "Fehlt",
    askSupplier: "Beim Lieferanten anfragen",
    message: "Nachricht an den Lieferanten",
    notSent: "Die Anwendung sendet diese Nachricht nicht. Kopieren Sie sie und senden Sie sie selbst.",
    copy: "Nachricht kopieren",
    copied: "Nachricht kopiert",
    openListing: "Originalanzeige öffnen",
    markSent: "Ich habe die Anfrage an den Lieferanten gesendet",
    sent: "Anfrage ist als gesendet markiert",
    response: "Antwort des Lieferanten",
    writtenQuote: "Schriftliches Angebot",
    saveReply: "Antwort speichern",
    extracted: "Aus dem schriftlichen Angebot erkannte Werte",
    confirmValue: "Diesen Wert bestätigen",
    confirmed: "Bestätigt",
    supplierPrice: "Bestätigter Lieferantenpreis",
    unconfirmedCosts: "Transport, Zoll und sonstige Kosten bleiben unbestätigt und gehören nicht zum Lieferantenpreis.",
    additionalConfirmation: "Eine weitere Bestätigung ist nötig. Die Antwort deckt Menge oder Spezifikation nicht ab.",
    evidence: "Mit dem schriftlichen Angebot verknüpft",
    status: {
      FOUND: "Kandidat gefunden",
      PREPARED: "Anfrage vorbereitet",
      SENT: "Anfrage gesendet",
      RESPONSE_RECEIVED: "Antwort erhalten",
      DOCUMENTED: "Angebot dokumentiert",
    },
    evidenceLabel: {
      PUBLISHED_TIER_PRICE: "Eine Mengenstaffel deckt die gewünschte Menge ab.",
      PUBLISHED_TIER_IS_NOT_A_QUOTE: "Diese Staffel ist kein schriftliches Lieferantenangebot.",
      ADVERTISED_PRICE_NOT_FOR_QUANTITY: "Der beworbene Preis ist für die gewünschte Menge nicht bestätigt.",
      ADVERTISED_PRICE_APPLIES_LATER: "Der niedrigere beworbene Preis gilt erst ab einer höheren Menge.",
      LISTED_MOQ_NOT_AN_ORDER_TERM: "Das MOQ der Anzeige bestätigt weder die Bestellung noch das Mischen von Varianten.",
      LISTED_INCOTERM: "Der Incoterm steht in der Anzeige und muss bestätigt werden.",
      QUANTITY_PRICE: "Preis für die gewünschte Menge.",
      WRITTEN_SUPPLIER_PRICE: "Schriftlicher Lieferantenpreis.",
      STOCK_OR_PRODUCTION: "Lagerware oder Produktion.",
      PACKAGING: "Verpackung.",
      DOCUMENTS: "Dokumente.",
      TRANSPORT: "Transport.",
      CUSTOMS: "Zoll.",
      OTHER_COSTS: "Sonstige Kosten.",
      LEAD_TIME: "Lieferzeit.",
      INCOTERM: "Incoterm für diesen Auftrag.",
      DIOPTERS: "Genaue Dioptrien.",
      MOQ_PER_DIOPTER_COLOR_MODEL: "MOQ je Dioptrie, Farbe und Modell.",
      MOQ_PER_VARIANT: "MOQ je Variante.",
    },
    termLabel: {
      UNIT_PRICE: "Preis",
      ORDER_QUANTITY: "Menge",
      MOQ: "MOQ",
      INCOTERM: "Incoterm",
      LEAD_TIME_DAYS: "Lieferzeit in Tagen",
      DIOPTERS: "Dioptrien",
    },
  },
  en: {
    requestConfirmation: "Request confirmation",
    hideConfirmation: "Hide confirmation",
    confirmedBySources: "Confirmed by public sources",
    missing: "Missing",
    askSupplier: "Ask the supplier",
    message: "Message to the supplier",
    notSent: "The application does not send this message. Copy it and send it yourself.",
    copy: "Copy message",
    copied: "Message copied",
    openListing: "Open original listing",
    markSent: "I sent this inquiry to the supplier",
    sent: "Inquiry marked as sent",
    response: "Supplier response",
    writtenQuote: "Written quotation",
    saveReply: "Save response",
    extracted: "Values extracted from the written quotation",
    confirmValue: "I confirm this value",
    confirmed: "Confirmed",
    supplierPrice: "Confirmed supplier price",
    unconfirmedCosts: "Transport, customs, and other costs stay unconfirmed and are not part of the supplier price.",
    additionalConfirmation: "Additional confirmation is required. The response does not cover the requested quantity or specification.",
    evidence: "Linked to the written quotation",
    status: {
      FOUND: "Candidate found",
      PREPARED: "Inquiry prepared",
      SENT: "Inquiry sent",
      RESPONSE_RECEIVED: "Response received",
      DOCUMENTED: "Offer documented",
    },
    evidenceLabel: {
      PUBLISHED_TIER_PRICE: "A published quantity tier covers the requested quantity.",
      PUBLISHED_TIER_IS_NOT_A_QUOTE: "That tier is not a written supplier quotation.",
      ADVERTISED_PRICE_NOT_FOR_QUANTITY: "The advertised price is not confirmed for the requested quantity.",
      ADVERTISED_PRICE_APPLIES_LATER: "The lower advertised price applies only from a higher quantity.",
      LISTED_MOQ_NOT_AN_ORDER_TERM: "The listing MOQ does not confirm the order or variant mixing.",
      LISTED_INCOTERM: "An Incoterm is listed and still needs confirmation.",
      QUANTITY_PRICE: "Price for the requested quantity.",
      WRITTEN_SUPPLIER_PRICE: "Written supplier price.",
      STOCK_OR_PRODUCTION: "Whether supply is from stock or production.",
      PACKAGING: "Packaging.",
      DOCUMENTS: "Documents.",
      TRANSPORT: "Transport.",
      CUSTOMS: "Customs.",
      OTHER_COSTS: "Other costs.",
      LEAD_TIME: "Lead time.",
      INCOTERM: "Incoterm for this order.",
      DIOPTERS: "Exact diopters.",
      MOQ_PER_DIOPTER_COLOR_MODEL: "MOQ per diopter, color, and model.",
      MOQ_PER_VARIANT: "MOQ per variant.",
    },
    termLabel: {
      UNIT_PRICE: "Price",
      ORDER_QUANTITY: "Quantity",
      MOQ: "MOQ",
      INCOTERM: "Incoterm",
      LEAD_TIME_DAYS: "Lead time in days",
      DIOPTERS: "Diopters",
    },
  },
};

function storageKey(projectId: string, productUrl: string) {
  return `jakov360-supplier-confirmation:${projectId}:${productUrl}`;
}

function parseRecord(raw: string) {
  if (!raw) return createPreparedConfirmation();
  try {
    const parsed = JSON.parse(raw) as SupplierConfirmationRecord;
    if (!parsed || typeof parsed !== "object" || typeof parsed.status !== "string") {
      return createPreparedConfirmation();
    }
    return {
      ...createPreparedConfirmation(),
      ...parsed,
      transportConfirmed: false as const,
      customsConfirmed: false as const,
      otherCostsConfirmed: false as const,
    };
  } catch {
    return createPreparedConfirmation();
  }
}

function subscribeToStoredConfirmation() {
  return () => {};
}

function clientHasStorage() {
  return true;
}

function serverHasStorage() {
  return false;
}

export function supplierConfirmationCopy(locale: Locale) {
  return copy[locale];
}

export function SupplierConfirmationPanel({
  projectId,
  productName,
  quantity,
  targetCountry,
  result,
  locale,
}: {
  projectId: string;
  productName: string;
  quantity: number | null;
  targetCountry: string | null;
  result: SupplierOfferSearchResult;
  locale: Locale;
}) {
  const text = copy[locale];
  const brief = buildSupplierConfirmationBrief({
    result,
    productName,
    quantity,
    destination: targetCountry,
  });
  const storageId = `${projectId}\n${result.productUrl}`;
  const storedRaw = useSyncExternalStore(
    subscribeToStoredConfirmation,
    () => window.localStorage.getItem(storageKey(projectId, result.productUrl)) ?? "",
    () => "",
  );
  const hydrated = useSyncExternalStore(
    subscribeToStoredConfirmation,
    clientHasStorage,
    serverHasStorage,
  );
  const storedRecord = useMemo(() => parseRecord(storedRaw), [storedRaw]);
  const [override, setOverride] = useState<{ id: string; record: SupplierConfirmationRecord } | null>(null);
  const [draft, setDraft] = useState<{ id: string; responseNote: string; writtenQuote: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const record = override?.id === storageId ? override.record : storedRecord;
  const responseNote = draft?.id === storageId ? draft.responseNote : record.responseNote;
  const writtenQuote = draft?.id === storageId ? draft.writtenQuote : record.writtenQuote;

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      storageKey(projectId, result.productUrl),
      JSON.stringify(record),
    );
  }, [hydrated, projectId, record, result.productUrl]);

  function update(next: SupplierConfirmationRecord) {
    setOverride({ id: storageId, record: next });
    setDraft({ id: storageId, responseNote: next.responseNote, writtenQuote: next.writtenQuote });
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(`${brief.subject}\n\n${brief.body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const current = statuses.indexOf(record.status);
  const replyEnabled = current >= statuses.indexOf(SupplierConfirmationStatuses.SENT);

  return (
    <section className="supplier-confirmation-panel" aria-label={text.requestConfirmation}>
      <ol className="supplier-confirmation-status">
        {statuses.map((status, index) => (
          <li key={status} data-state={index < current ? "done" : index === current ? "current" : "upcoming"}>
            {text.status[status]}
          </li>
        ))}
      </ol>
      <EvidenceList title={text.confirmedBySources} codes={brief.publicEvidence} text={text} />
      <EvidenceList title={text.missing} codes={brief.missing} text={text} />
      <div>
        <strong>{text.askSupplier}</strong>
        <ul>
          {brief.asks.map((ask) => <li key={ask}>{ask}</li>)}
        </ul>
      </div>
      <label>
        {text.message}
        <textarea readOnly rows={8} value={`${brief.subject}\n\n${brief.body}`} />
      </label>
      <p className="muted-text">{text.notSent}</p>
      <div className="supplier-confirmation-actions">
        <button className="secondary-button" onClick={() => void copyMessage()} type="button">
          {copied ? text.copied : text.copy}
        </button>
        <a href={result.productUrl} rel="noreferrer" target="_blank">{text.openListing}</a>
        <button
          className="secondary-button"
          disabled={record.status !== SupplierConfirmationStatuses.PREPARED}
          onClick={() => update(markInquirySent(record))}
          type="button"
        >
          {record.status === SupplierConfirmationStatuses.PREPARED ? text.markSent : text.sent}
        </button>
      </div>
      <label>
        {text.response}
        <textarea
          disabled={!replyEnabled}
          onChange={(event) => setDraft({
            id: storageId,
            responseNote: event.target.value,
            writtenQuote,
          })}
          rows={3}
          value={responseNote}
        />
      </label>
      <label>
        {text.writtenQuote}
        <textarea
          disabled={!replyEnabled}
          onChange={(event) => setDraft({
            id: storageId,
            responseNote,
            writtenQuote: event.target.value,
          })}
          rows={4}
          value={writtenQuote}
        />
      </label>
      <button
        className="secondary-button"
        disabled={!replyEnabled}
        onClick={() => update(saveSupplierReply(record, brief, { responseNote, writtenQuote }))}
        type="button"
      >
        {text.saveReply}
      </button>
      {record.proposals.length > 0 && (
        <div>
          <strong>{text.extracted}</strong>
          <ul>
            {record.proposals.map((proposal) => (
              <li key={proposal.key}>
                <span>{text.termLabel[proposal.key]}: {proposal.value}</span>
                <small>{text.evidence}</small>
                {proposal.confirmed ? (
                  <strong>{text.confirmed}</strong>
                ) : (
                  <button
                    className="secondary-button"
                    onClick={() => update(confirmSupplierTerm(record, brief, proposal.key))}
                    type="button"
                  >
                    {text.confirmValue}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <strong>{text.supplierPrice}: </strong>
        {record.supplierPriceConfirmed
          ? record.proposals.find((item) => item.key === "UNIT_PRICE")?.value
          : text.missing}
      </p>
      <p className="supplier-terms-warning">{text.unconfirmedCosts}</p>
      {record.additionalConfirmationRequired && (
        <p className="supplier-terms-warning">{text.additionalConfirmation}</p>
      )}
    </section>
  );
}

function EvidenceList({
  title,
  codes,
  text,
}: {
  title: string;
  codes: string[];
  text: Copy;
}) {
  return (
    <div>
      <strong>{title}</strong>
      <ul>
        {codes.map((code) => <li key={code}>{text.evidenceLabel[code] ?? code}</li>)}
      </ul>
    </div>
  );
}
