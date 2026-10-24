"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Locale } from "@/modules/i18n/translations";
import type { SupplierConfirmationView } from "@/modules/negotiation/application/supplier-confirmation-service";
import {
  buildSupplierConfirmationBrief,
  quotedPriceCoversRequestedQuantity,
  SupplierConfirmationStatuses,
  type ConfirmableSupplierTermKey,
  type SupplierConfirmationStatus,
} from "@/modules/negotiation/domain/supplier-confirmation";
import {
  inquiryMessageForSending,
  inquiryTranslationFields,
  usableInquiryTranslation,
} from "@/modules/negotiation/domain/supplier-message";
import { SupplierMailSendControl } from "@/components/search/supplier-mail-send-control";
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
  confirmedQuantity: string;
  confirmedMoq: string;
  confirmedVariants: string;
  completeOrderTerms: string;
  notConfirmed: string;
  proposal: string;
  moqDoesNotFit: string;
  variantsNotRequested: string;
  transferToCalculation: string;
  transferred: string;
  costsRemainOpen: string;
  loading: string;
  saveError: string;
  unconfirmedCosts: string;
  additionalConfirmation: string;
  priceQuantityMismatch: string;
  diopterRangeIsNotMixing: string;
  prepareSection: string;
  translationSection: string;
  sendSection: string;
  replySection: string;
  confirmationSection: string;
  sourceMessage: string;
  editBeforeTranslation: string;
  targetLanguage: string;
  languageEn: string;
  languageZh: string;
  languageBoth: string;
  translateMessage: string;
  translateReply: string;
  original: string;
  translation: string;
  saveCorrection: string;
  translationNotProof: string;
  reusedTranslation: string;
  estimatedCost: string;
  followUp: string;
    staleTranslation: string;
    translationHidden: string;
    incompleteTranslation: string;
    sendingUsesSource: string;
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
    supplierPrice: "Dokumentovana cena dobavljača",
    confirmedQuantity: "Potvrđena količina",
    confirmedMoq: "Potvrđen MOQ",
    confirmedVariants: "Potvrđene varijante",
    completeOrderTerms: "Uslovi kompletne narudžbine",
    notConfirmed: "Nije potvrđeno",
    proposal: "Predlog iz teksta, čeka potvrdu",
    moqDoesNotFit: "MOQ ne pokriva traženu količinu",
    variantsNotRequested: "Ovaj upit ne traži mešanje varijanti",
    transferToCalculation: "Prenesi potvrđenu cenu u obračun",
    transferred: "Potvrđena cena je preneta u obračun uvoza.",
    costsRemainOpen: "Transport, carina, PDV i ostali troškovi ostaju odvojeni i nepotvrđeni.",
    loading: "Učitavanje potvrde...",
    saveError: "Potvrda nije sačuvana. Pokušajte ponovo.",
    unconfirmedCosts: "Transport, carina, PDV i ostali troškovi ostaju nepotvrđeni i ne ulaze u cenu dobavljača.",
    additionalConfirmation: "Potrebna je dodatna potvrda. Odgovor ne pokriva traženu količinu ili specifikaciju.",
    priceQuantityMismatch: "Cena ne važi za traženu količinu.",
    diopterRangeIsNotMixing: "Raspon dioptrija nije potvrda mešanja varijanti.",
    prepareSection: "Priprema poruke",
    translationSection: "Prevod",
    sendSection: "Slanje",
    replySection: "Odgovor",
    confirmationSection: "Potvrda",
    sourceMessage: "Upit na srpskom",
    editBeforeTranslation: "Tekst možete izmeniti pre prevođenja.",
    targetLanguage: "Jezik dobavljača",
    languageEn: "Engleski",
    languageZh: "Kineski (pojednostavljeni)",
    languageBoth: "Engleski i kineski",
    translateMessage: "Prevedi poruku",
    translateReply: "Prevedi odgovor",
    original: "Original",
    translation: "Prevod",
    saveCorrection: "Sačuvaj ispravku",
    translationNotProof: "Prevod nije dokaz da su uslovi potvrđeni. Potvrdite izdvojene vrednosti iz originalnog odgovora.",
    reusedTranslation: "Korišćen je sačuvan prevod, bez novog AI poziva.",
    estimatedCost: "Procenjeni trošak prevoda",
    followUp: "Predlog dodatnih pitanja",
    staleTranslation: "Izvorni tekst je izmenjen. Prevod treba ponovo napraviti.",
    translationHidden: "Prethodni prevod je sakriven jer ne odgovara izabranom jeziku. Novi AI poziv počinje tek kada izaberete Prevedi poruku.",
    incompleteTranslation: "Kombinovani prevod nije kompletan, pa nije prikazan i ne može da se pošalje.",
    sendingUsesSource: "Kopiranje koristi srpski tekst. Prethodni prevod nije uključen.",
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
      VARIANT_MIXING: "Posebna potvrda da se dioptrije mogu mešati u jednoj narudžbini.",
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
      VARIANT_MIXING: "Mešanje varijanti",
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
    supplierPrice: "Dokumentierter Lieferantenpreis",
    confirmedQuantity: "Bestätigte Menge",
    confirmedMoq: "Bestätigtes MOQ",
    confirmedVariants: "Bestätigte Varianten",
    completeOrderTerms: "Bedingungen der vollständigen Bestellung",
    notConfirmed: "Nicht bestätigt",
    proposal: "Vorschlag aus dem Text, wartet auf Bestätigung",
    moqDoesNotFit: "Das MOQ deckt die gewünschte Menge nicht ab",
    variantsNotRequested: "Diese Anfrage verlangt kein Mischen von Varianten",
    transferToCalculation: "Bestätigten Preis in die Kalkulation übernehmen",
    transferred: "Der bestätigte Preis wurde in die Importkalkulation übernommen.",
    costsRemainOpen: "Transport, Zoll, MwSt. und sonstige Kosten bleiben getrennt und unbestätigt.",
    loading: "Bestätigung wird geladen...",
    saveError: "Die Bestätigung wurde nicht gespeichert. Versuchen Sie es erneut.",
    unconfirmedCosts: "Transport, Zoll, MwSt. und sonstige Kosten bleiben unbestätigt und gehören nicht zum Lieferantenpreis.",
    additionalConfirmation: "Eine weitere Bestätigung ist nötig. Die Antwort deckt Menge oder Spezifikation nicht ab.",
    priceQuantityMismatch: "Der Preis gilt nicht für die gewünschte Menge.",
    diopterRangeIsNotMixing: "Ein Dioptrienbereich bestätigt nicht, dass die Varianten gemischt werden können.",
    prepareSection: "Nachricht vorbereiten",
    translationSection: "Übersetzung",
    sendSection: "Senden",
    replySection: "Antwort",
    confirmationSection: "Bestätigung",
    sourceMessage: "Anfrage auf Serbisch",
    editBeforeTranslation: "Sie können den Text vor der Übersetzung ändern.",
    targetLanguage: "Sprache des Lieferanten",
    languageEn: "Englisch",
    languageZh: "Chinesisch (vereinfacht)",
    languageBoth: "Englisch und Chinesisch",
    translateMessage: "Nachricht übersetzen",
    translateReply: "Antwort übersetzen",
    original: "Original",
    translation: "Übersetzung",
    saveCorrection: "Korrektur speichern",
    translationNotProof: "Die Übersetzung beweist nicht, dass die Bedingungen bestätigt sind. Bestätigen Sie die erkannten Werte aus der Originalantwort.",
    reusedTranslation: "Die gespeicherte Übersetzung wurde verwendet, ohne einen neuen KI-Aufruf.",
    estimatedCost: "Geschätzte Übersetzungskosten",
    followUp: "Vorgeschlagene weitere Fragen",
    staleTranslation: "Der Ausgangstext wurde geändert. Die Übersetzung muss neu erstellt werden.",
    translationHidden: "Die vorherige Übersetzung ist ausgeblendet, weil sie nicht zur gewählten Sprache passt. Ein neuer KI-Aufruf startet erst mit „Nachricht übersetzen“.",
    incompleteTranslation: "Die kombinierte Übersetzung ist unvollständig und wird weder angezeigt noch gesendet.",
    sendingUsesSource: "Kopieren verwendet den serbischen Text. Die vorherige Übersetzung ist nicht enthalten.",
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
      VARIANT_MIXING: "Gesonderte Bestätigung, dass die Dioptrien in einer Bestellung gemischt werden können.",
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
      VARIANT_MIXING: "Mischen der Varianten",
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
    supplierPrice: "Documented supplier price",
    confirmedQuantity: "Confirmed quantity",
    confirmedMoq: "Confirmed MOQ",
    confirmedVariants: "Confirmed variants",
    completeOrderTerms: "Complete order terms",
    notConfirmed: "Not confirmed",
    proposal: "Proposal from the text, waiting for confirmation",
    moqDoesNotFit: "The MOQ does not cover the requested quantity",
    variantsNotRequested: "This inquiry does not request variant mixing",
    transferToCalculation: "Transfer the confirmed price to the calculation",
    transferred: "The confirmed price was transferred to the import calculation.",
    costsRemainOpen: "Transport, customs, VAT, and other costs stay separate and unconfirmed.",
    loading: "Loading confirmation...",
    saveError: "The confirmation was not saved. Try again.",
    unconfirmedCosts: "Transport, customs, VAT, and other costs stay unconfirmed and are not part of the supplier price.",
    additionalConfirmation: "Additional confirmation is required. The response does not cover the requested quantity or specification.",
    priceQuantityMismatch: "The price does not apply to the requested quantity.",
    diopterRangeIsNotMixing: "A diopter range does not confirm that the variants can be mixed.",
    prepareSection: "Prepare message",
    translationSection: "Translation",
    sendSection: "Sending",
    replySection: "Response",
    confirmationSection: "Confirmation",
    sourceMessage: "Inquiry in Serbian",
    editBeforeTranslation: "You can edit the text before translation.",
    targetLanguage: "Supplier language",
    languageEn: "English",
    languageZh: "Chinese (Simplified)",
    languageBoth: "English and Chinese",
    translateMessage: "Translate message",
    translateReply: "Translate response",
    original: "Original",
    translation: "Translation",
    saveCorrection: "Save correction",
    translationNotProof: "The translation does not prove that the terms are confirmed. Confirm the extracted values from the original response.",
    reusedTranslation: "The saved translation was used, without a new AI call.",
    estimatedCost: "Estimated translation cost",
    followUp: "Suggested follow-up questions",
    staleTranslation: "The source text changed. Translate the message again.",
    translationHidden: "The previous translation is hidden because it does not match the selected language. A new AI call starts only when you choose Translate message.",
    incompleteTranslation: "The combined translation is incomplete, so it is hidden and will not be sent.",
    sendingUsesSource: "Copying uses the Serbian text. The previous translation is not included.",
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
      VARIANT_MIXING: "A separate confirmation that the diopters can be mixed in one order.",
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
      VARIANT_MIXING: "Variant mixing",
    },
  },
};

export function supplierConfirmationCopy(locale: Locale) {
  return copy[locale];
}

type MessageLanguage = "EN" | "ZH" | "EN_ZH";

function initiallyOpen(open: boolean) {
  return (node: HTMLDetailsElement | null) => {
    if (node && open && node.dataset.ready !== "true") {
      node.open = true;
      node.dataset.ready = "true";
    }
  };
}

async function postConfirmation(
  projectId: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`/api/projects/${projectId}/supplier-confirmations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "supplier-confirmation-save-failed");
  }
  return await response.json() as SupplierConfirmationView;
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
  const router = useRouter();
  const text = copy[locale];
  const brief = buildSupplierConfirmationBrief({
    result,
    productName,
    quantity,
    destination: targetCountry,
  });
  const [view, setView] = useState<SupplierConfirmationView | null>(null);
  const [sourceMessage, setSourceMessage] = useState(brief.serbianBody);
  const [targetLanguage, setTargetLanguage] = useState<MessageLanguage>("EN");
  const [translatedMessage, setTranslatedMessage] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [writtenQuote, setWrittenQuote] = useState("");
  const [replyTranslation, setReplyTranslation] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [transferred, setTransferred] = useState(false);
  const record = view?.record ?? null;
  const savedSource = (view?.communication.sourceMessage ?? brief.serbianBody).trim();
  const sourceIsCurrent = sourceMessage.trim() === savedSource;
  const savedLanguage = view?.communication.targetLanguage ?? null;
  const translationInput = {
    selectedLanguage: targetLanguage,
    savedLanguage,
    translatedMessage,
    sourceIsCurrent,
    translationCurrent: Boolean(view?.communication.translationCurrent),
  };
  const translationFields = inquiryTranslationFields(translationInput);
  const usableTranslation = usableInquiryTranslation(translationInput);
  const translationIsCurrent = usableTranslation !== null;
  const savedReply = (view?.communication.supplierReplyOriginal ?? "").trim();
  const replyIsCurrent = writtenQuote.trim() === savedReply && Boolean(view?.communication.replyTranslationCurrent);
  const finalMessage = inquiryMessageForSending({
    ...translationInput,
    serbianFallback: `${brief.serbianSubject}\n\n${sourceMessage.trim() || brief.serbianBody}`,
  });

  function applyView(next: SupplierConfirmationView) {
    setView(next);
    setSourceMessage(next.communication.sourceMessage);
    setTargetLanguage(next.communication.targetLanguage ?? "EN");
    setTranslatedMessage(next.communication.translatedMessage);
    setResponseNote(next.record.responseNote);
    setWrittenQuote(next.communication.supplierReplyOriginal || next.record.writtenQuote);
    setReplyTranslation(next.communication.supplierReplyTranslation);
    setTransferred(Boolean(next.offerId));
  }

  useEffect(() => {
    let cancelled = false;
    void postConfirmation(projectId, {
      action: "prepare",
      productName,
      result,
    }).then((next) => {
      if (!cancelled) applyView(next);
    }).catch(() => {
      if (!cancelled) setError(text.saveError);
    });
    return () => {
      cancelled = true;
    };
  }, [productName, projectId, result, text.saveError]);

  async function run(body: Record<string, unknown>) {
    setPending(true);
    setError("");
    try {
      const next = await postConfirmation(projectId, body);
      applyView(next);
      return next;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message && message !== "supplier-confirmation-save-failed" ? message : text.saveError);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function reloadAfterGmailSend() {
    const response = await fetch(
      `/api/projects/${projectId}/supplier-confirmations?productUrl=${encodeURIComponent(result.productUrl)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      setError("Gmail je potvrdio slanje, ali prikaz statusa nije osvežen.");
      return;
    }
    const next = await response.json() as SupplierConfirmationView;
    applyView(next);
    router.refresh();
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(finalMessage);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const current = record ? statuses.indexOf(record.status) : statuses.indexOf(SupplierConfirmationStatuses.FOUND);
  const replyEnabled = record !== null && current >= statuses.indexOf(SupplierConfirmationStatuses.SENT);
  const moqProposal = record?.proposals.find((item) => item.key === "MOQ") ?? null;

  return (
    <section className="supplier-confirmation-panel" aria-label={text.requestConfirmation}>
      <ol className="supplier-confirmation-status">
        {statuses.map((status, index) => (
          <li key={status} data-state={index < current ? "done" : index === current ? "current" : "upcoming"}>
            {text.status[status]}
          </li>
        ))}
      </ol>
      {!record && <p className="muted-text">{error || text.loading}</p>}
      <details className="supplier-message-section" ref={initiallyOpen(true)}>
        <summary>{text.prepareSection}</summary>
        <p className="supplier-message-subject">{brief.serbianSubject}</p>
        <label>
          {text.sourceMessage}
          <textarea
            disabled={!record || pending}
            onChange={(event) => setSourceMessage(event.target.value)}
            rows={10}
            value={sourceMessage}
          />
        </label>
        <p className="muted-text">{text.editBeforeTranslation}</p>
        <EvidenceList title={text.confirmedBySources} codes={brief.publicEvidence} text={text} />
        <EvidenceList title={text.missing} codes={brief.missing} text={text} />
      </details>
      <details className="supplier-message-section" ref={initiallyOpen(true)}>
        <summary>{text.translationSection}</summary>
        <label>
          {text.targetLanguage}
          <select
            disabled={!record || pending}
            onChange={(event) => setTargetLanguage(event.target.value as MessageLanguage)}
            value={targetLanguage}
          >
            <option value="EN">{text.languageEn}</option>
            <option value="ZH">{text.languageZh}</option>
            <option value="EN_ZH">{text.languageBoth}</option>
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={!record || pending || !sourceMessage.trim()}
          onClick={() => void run({
            action: "translateInquiry",
            productUrl: result.productUrl,
            sourceMessage,
            targetLanguage,
          })}
          type="button"
        >
          {text.translateMessage}
        </button>
        {translationFields.kind === "single" && (
          <label>
            {translationFields.language === "ZH" ? text.languageZh : text.languageEn}
            <textarea
              disabled={pending}
              onChange={(event) => setTranslatedMessage(event.target.value)}
              rows={8}
              value={translationFields.text}
            />
          </label>
        )}
        {translationFields.kind === "bilingual" && (
          <div className="supplier-translation-fields">
            <label>
              {text.languageEn}
              <textarea
                disabled={pending}
                onChange={(event) => setTranslatedMessage(`${event.target.value}\n---\n${translationFields.chinese}`)}
                rows={8}
                value={translationFields.english}
              />
            </label>
            <label>
              {text.languageZh}
              <textarea
                disabled={pending}
                onChange={(event) => setTranslatedMessage(`${translationFields.english}\n---\n${event.target.value}`)}
                rows={8}
                value={translationFields.chinese}
              />
            </label>
          </div>
        )}
        {translationFields.kind !== "hidden" && (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => void run({
              action: "saveTranslation",
              productUrl: result.productUrl,
              translatedMessage,
            })}
            type="button"
          >
            {text.saveCorrection}
          </button>
        )}
        {translationFields.kind !== "hidden" && view?.communication.translationReused && sourceIsCurrent && (
          <p className="muted-text">{text.reusedTranslation}</p>
        )}
        {translationFields.kind !== "hidden" && view?.communication.estimatedCostUsd && (
          <p className="muted-text">{text.estimatedCost}: USD {view.communication.estimatedCostUsd}</p>
        )}
        {savedLanguage && savedLanguage !== targetLanguage && translatedMessage.trim() && (
          <p className="supplier-terms-warning">{text.translationHidden}</p>
        )}
        {savedLanguage === "EN_ZH" && targetLanguage === "EN_ZH" && translatedMessage.trim() && translationFields.kind === "hidden" && (
          <p className="supplier-terms-warning">{text.incompleteTranslation}</p>
        )}
        {translationFields.kind !== "hidden" && !translationIsCurrent && (
          <p className="supplier-terms-warning">{text.staleTranslation}</p>
        )}
      </details>
      <details className="supplier-message-section">
        <summary>{text.sendSection}</summary>
        <label>
          {text.message}
          <textarea readOnly rows={6} value={finalMessage} />
        </label>
        {translatedMessage.trim() && !translationIsCurrent && (
          <p className="supplier-terms-warning">{text.sendingUsesSource}</p>
        )}
        <p className="muted-text">{text.notSent}</p>
        <div className="supplier-confirmation-actions">
          <button className="secondary-button" onClick={() => void copyMessage()} type="button">
            {copied ? text.copied : text.copy}
          </button>
          <a href={result.productUrl} rel="noreferrer" target="_blank">{text.openListing}</a>
          <button
            className="secondary-button"
            disabled={!record || pending || record.status !== SupplierConfirmationStatuses.PREPARED}
            onClick={() => void run({ action: "markSent", productUrl: result.productUrl })}
            type="button"
          >
            {!record || record.status === SupplierConfirmationStatuses.PREPARED ? text.markSent : text.sent}
          </button>
        </div>
        {record?.status === SupplierConfirmationStatuses.PREPARED && view && (
          <SupplierMailSendControl
            projectId={projectId}
            productUrl={result.productUrl}
            draftCurrent={translationIsCurrent &&
              translatedMessage.trim() === view.communication.translatedMessage.trim()}
            onSent={reloadAfterGmailSend}
          />
        )}
      </details>
      <details className="supplier-message-section">
        <summary>{text.replySection}</summary>
        <label>
          {text.response}
          <textarea
            disabled={!replyEnabled || pending}
            onChange={(event) => setResponseNote(event.target.value)}
            rows={3}
            value={responseNote}
          />
        </label>
        <label>
          {text.writtenQuote}
          <textarea
            disabled={!replyEnabled || pending}
            onChange={(event) => setWrittenQuote(event.target.value)}
            rows={4}
            value={writtenQuote}
          />
        </label>
        <div className="supplier-confirmation-actions">
          <button
            className="secondary-button"
            disabled={!replyEnabled || pending || !writtenQuote.trim()}
            onClick={() => void run({
              action: "translateReply",
              productUrl: result.productUrl,
              responseNote,
              writtenQuote,
            })}
            type="button"
          >
            {text.translateReply}
          </button>
          <button
            className="secondary-button"
            disabled={!replyEnabled || pending}
            onClick={() => void run({
              action: "saveReply",
              productUrl: result.productUrl,
              responseNote,
              writtenQuote,
            })}
            type="button"
          >
            {text.saveReply}
          </button>
        </div>
        {replyTranslation.trim() && (
          <div className="supplier-message-compare">
            <label>
              {text.original}
              <textarea readOnly rows={6} value={writtenQuote} />
            </label>
            <label>
              {text.translation}
              <textarea readOnly rows={6} value={replyTranslation} />
            </label>
          </div>
        )}
        {replyTranslation.trim() && !replyIsCurrent && (
          <p className="supplier-terms-warning">{text.staleTranslation}</p>
        )}
        <p className="supplier-terms-warning">{text.translationNotProof}</p>
        {(view?.communication.followUpQuestions.length ?? 0) > 0 && (
          <div>
            <strong>{text.followUp}</strong>
            <ul>
              {view?.communication.followUpQuestions.map((question) => <li key={question}>{question}</li>)}
            </ul>
          </div>
        )}
      </details>
      <details className="supplier-message-section">
        <summary>{text.confirmationSection}</summary>
        {record && record.proposals.length > 0 && (
          <div>
            <strong>{text.extracted}</strong>
            <ul>
              {record.proposals.map((proposal) => (
                <li key={proposal.key}>
                  <span>{text.termLabel[proposal.key]}: {proposal.value}</span>
                  <small>{proposal.confirmed ? text.evidence : text.proposal}</small>
                  {proposal.confirmed ? (
                    <strong>{text.confirmed}</strong>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={pending}
                      onClick={() => void run({
                        action: "confirmTerm",
                        productUrl: result.productUrl,
                        termKey: proposal.key satisfies ConfirmableSupplierTermKey,
                      })}
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
        {record && (
          <div>
            <p>
              <strong>{text.supplierPrice}: </strong>
              {record.supplierPriceConfirmed
                ? record.proposals.find((item) => item.key === "UNIT_PRICE")?.value
                : record.proposals.find((item) => item.key === "UNIT_PRICE")?.confirmed
                  ? text.priceQuantityMismatch
                  : text.notConfirmed}
            </p>
            <p>
              <strong>{text.confirmedQuantity}: </strong>
              {record.quantityConfirmed
                ? record.proposals.find((item) => item.key === "ORDER_QUANTITY")?.value
                : text.notConfirmed}
            </p>
            <p>
              <strong>{text.confirmedMoq}: </strong>
              {record.moqConfirmed
                ? moqProposal?.value
                : moqProposal?.confirmed
                  ? text.moqDoesNotFit
                  : text.notConfirmed}
            </p>
            <p>
              <strong>{text.confirmedVariants}: </strong>
              {brief.readingGlasses
                ? record.variantsConfirmed
                  ? record.proposals.find((item) => item.key === "VARIANT_MIXING")?.value
                  : text.notConfirmed
                : text.variantsNotRequested}
            </p>
            <p>
              <strong>{text.completeOrderTerms}: </strong>
              {record.orderTermsConfirmed ? text.confirmed : text.notConfirmed}
            </p>
          </div>
        )}
        {record && record.proposals.some((item) => item.key === "UNIT_PRICE") && !quotedPriceCoversRequestedQuantity(record.writtenQuote, brief.quantity) && (
          <p className="supplier-terms-warning">{text.priceQuantityMismatch}</p>
        )}
        {brief.readingGlasses && record?.proposals.some((item) => item.key === "DIOPTERS") && !record.variantsConfirmed && (
          <p className="supplier-terms-warning">{text.diopterRangeIsNotMixing}</p>
        )}
        {record?.supplierPriceConfirmed && (
          <button
            className="secondary-button"
            disabled={pending || transferred}
            onClick={() => void run({ action: "transfer", productUrl: result.productUrl }).then((next) => {
              if (!next?.offerId) return;
              setTransferred(true);
              router.push(`/projects/${projectId}?selectedOffer=${next.offerId}#workflow-step-decision`);
              router.refresh();
            })}
            type="button"
          >
            {text.transferToCalculation}
          </button>
        )}
        {transferred && <p className="muted-text">{text.transferred}</p>}
        <p className="supplier-terms-warning">{text.unconfirmedCosts}</p>
        <p className="muted-text">{text.costsRemainOpen}</p>
        {record?.additionalConfirmationRequired && (
          <p className="supplier-terms-warning">{text.additionalConfirmation}</p>
        )}
      </details>
      {error && <p className="supplier-terms-warning">{error}</p>}
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
