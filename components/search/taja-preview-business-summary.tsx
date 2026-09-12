"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import type { SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";
import {
  buildTajaPreviewBusinessSummary,
  TajaPreviewBusinessStatuses,
  TajaPreviewLandedCostStatuses,
  TajaPreviewMoqStatuses,
  TajaPreviewNextActions,
  TajaPreviewPriceBasisStatuses,
  type TajaPreviewBusinessSummary as TajaPreviewBusinessSummaryValue,
} from "@/modules/product-search/domain/taja-preview-business-summary";
import {
  TajaOfferProductForms,
} from "@/modules/product-search/domain/taja-product-form";
import {
  TajaRequirementEvidenceStatuses,
  TajaRequirementMatchStatuses,
} from "@/modules/product-search/domain/taja-requirement-match";

type SummaryCopy = {
  title: string;
  statusReady: string;
  statusReview: string;
  statusBlocked: string;
  descriptionReady: string;
  descriptionReview: string;
  descriptionBlocked: string;
  productForm: string;
  requirementMatch: string;
  pump: string;
  nozzles: string;
  exactNozzleCount: (count: number) => string;
  displayedPrice: string;
  moq: string;
  landedCost: string;
  nextStep: string;
  supplierQuestion: string;
  formComplete: string;
  formPump: string;
  formNozzles: string;
  formComponent: string;
  formUnclear: string;
  matchFull: string;
  matchPartial: string;
  matchUnconfirmed: string;
  matchNotEvaluated: string;
  evidenceConfirmed: string;
  evidenceLikely: string;
  evidenceUnconfirmed: string;
  sourceStates: (value: string) => string;
  priceMissing: string;
  priceConfirmed: (price: string, sellingUnit: string | null) => string;
  priceUnconfirmed: (price: string) => string;
  moqUnknown: string;
  moqStated: (moq: number) => string;
  moqOk: (moq: number, quantity: number) => string;
  moqBlocking: (moq: number, quantity: number) => string;
  landedMissingPrice: string;
  landedBlockedPrice: string;
  landedBlockedMoq: string;
  landedBlockedIncoterm: string;
  landedBlockedLogistics: string;
  landedReady: string;
  actionConfirmPrice: string;
  actionDoNotCompare: string;
  actionConfirmRequirements: string;
  actionNegotiateMoq: string;
  actionConfirmIncoterm: string;
  actionConfirmPackaging: string;
  actionReady: string;
  questionConfirmPrice: (price: string | null) => string;
  questionDoNotCompare: string;
  questionConfirmRequirements: string;
  questionNegotiateMoq: string;
  questionConfirmIncoterm: string;
  questionConfirmPackaging: string;
  questionReady: string;
};

const copyByLocale: Record<Locale, SummaryCopy> = {
  sr: {
    title: "Tajin poslovni pregled",
    statusReady: "SPREMNO ZA POREĐENJE",
    statusReview: "POTREBNA PROVERA",
    statusBlocked: "NIJE UPOREDIVO",
    descriptionReady: "Osnovni podaci su dovoljno jasni za preliminarno poređenje. Konačna odluka i dalje zahteva proveru dobavljača.",
    descriptionReview: "Stranica sadrži korisne podatke, ali još nije dovoljno jasno šta se prodaje ili šta prikazana cena obuhvata.",
    descriptionBlocked: "Ponuda trenutno nije direktno uporediva sa traženim proizvodom ili količinom.",
    productForm: "Šta se prodaje",
    requirementMatch: "Usklađenost sa zahtevom",
    pump: "Pumpa",
    nozzles: "Mlaznice",
    exactNozzleCount: (count) => `Tačno ${count} mlaznica`,
    displayedPrice: "Prikazana cena",
    moq: "Minimalna količina",
    landedCost: "Landed cost",
    nextStep: "Sledeći korak",
    supplierQuestion: "Predloženo pitanje dobavljaču",
    formComplete: "kompletan sistem / kit",
    formPump: "samo pumpa",
    formNozzles: "samo mlaznice",
    formComponent: "komponenta ili rezervni deo",
    formUnclear: "nije jasno da li je kompletan sistem",
    matchFull: "potpuno potvrđena",
    matchPartial: "delimično potvrđena",
    matchUnconfirmed: "nije potvrđena",
    matchNotEvaluated: "nije ocenjena",
    evidenceConfirmed: "potvrđeno",
    evidenceLikely: "verovatno relevantno",
    evidenceUnconfirmed: "nije potvrđeno",
    sourceStates: (value) => `Stranica navodi: ${value}`,
    priceMissing: "cena nije navedena",
    priceConfirmed: (price, sellingUnit) => sellingUnit
      ? `${price}; jedinica cene: ${sellingUnit}`
      : `${price}; jedinica cene je potvrđena`,
    priceUnconfirmed: (price) => `${price}; nije potvrđeno na koju jedinicu se cena odnosi`,
    moqUnknown: "MOQ nije naveden",
    moqStated: (moq) => `naveden MOQ ${moq}`,
    moqOk: (moq, quantity) => `MOQ ${moq}; odgovara traženoj količini ${quantity}`,
    moqBlocking: (moq, quantity) => `MOQ ${moq} je iznad tražene količine ${quantity}`,
    landedMissingPrice: "nije obračunat — nedostaje potpuna cena",
    landedBlockedPrice: "nije obračunat — jedinica cene nije potvrđena",
    landedBlockedMoq: "nije obračunat — tražena količina je ispod MOQ-a",
    landedBlockedIncoterm: "nije obračunat — Incoterm nije potvrđen",
    landedBlockedLogistics: "nije obračunat — pakovanje i težina nisu pouzdano potvrđeni",
    landedReady: "podaci su spremni za preliminarni obračun",
    actionConfirmPrice: "Potvrditi sadržaj ponude i jedinicu cene kod dobavljača.",
    actionDoNotCompare: "Ne porediti cenu sa traženim kompletnim proizvodom; ponudu tretirati samo kao drugu vrstu proizvoda ili komponentu.",
    actionConfirmRequirements: "Potvrditi nedostajuće osobine proizvoda pre poređenja.",
    actionNegotiateMoq: "Pregovarati o manjoj minimalnoj količini ili promeniti planiranu količinu.",
    actionConfirmIncoterm: "Potvrditi Incoterm i polaznu tačku transporta.",
    actionConfirmPackaging: "Potvrditi dimenzije, bruto težinu i broj komada po kartonu.",
    actionReady: "Dodati ponudu za poređenje i pokrenuti preliminarni landed-cost obračun.",
    questionConfirmPrice: (price) => price
      ? `Da li prikazana cena ${price} važi za jednu mlaznicu, paket delova ili kompletan sistem? Molimo navedite tačan sadržaj prodajne jedinice.`
      : "Šta tačno obuhvata jedna prodajna jedinica i koja je cena za kompletan proizvod?",
    questionDoNotCompare: "Da li dobavljač nudi kompletan proizvod koji odgovara našem zahtevu, a ne samo pumpu, mlaznice ili drugi deo?",
    questionConfirmRequirements: "Molimo potvrdite sve tražene osobine proizvoda i pošaljite tačnu specifikaciju ponuđene varijante.",
    questionNegotiateMoq: "Da li možete prihvatiti našu traženu količinu ispod navedenog MOQ-a i po kojoj ceni?",
    questionConfirmIncoterm: "Koji Incoterm važi za prikazanu cenu i iz kog grada ili luke roba polazi?",
    questionConfirmPackaging: "Molimo pošaljite dimenzije i bruto težinu po prodajnoj jedinici i broj jedinica u jednom kartonu.",
    questionReady: "Molimo potvrdite konačnu cenu, rok proizvodnje, dostupnost uzorka i uslove plaćanja.",
  },
  de: {
    title: "TAJAs geschäftliche Prüfung",
    statusReady: "BEREIT ZUM VERGLEICH",
    statusReview: "PRÜFUNG ERFORDERLICH",
    statusBlocked: "NICHT VERGLEICHBAR",
    descriptionReady: "Die Grunddaten sind für einen vorläufigen Vergleich ausreichend. Die endgültige Entscheidung erfordert weiterhin eine Lieferantenprüfung.",
    descriptionReview: "Die Seite enthält nützliche Daten, aber Produktumfang oder Preisbasis sind noch nicht eindeutig.",
    descriptionBlocked: "Das Angebot ist derzeit nicht direkt mit dem gesuchten Produkt oder der gewünschten Menge vergleichbar.",
    productForm: "Was wird verkauft",
    requirementMatch: "Übereinstimmung mit der Anfrage",
    pump: "Pumpe",
    nozzles: "Düsen",
    exactNozzleCount: (count) => `Genau ${count} Düsen`,
    displayedPrice: "Angezeigter Preis",
    moq: "Mindestmenge",
    landedCost: "Landed Cost",
    nextStep: "Nächster Schritt",
    supplierQuestion: "Vorgeschlagene Lieferantenfrage",
    formComplete: "komplettes System / Kit",
    formPump: "nur Pumpe",
    formNozzles: "nur Düsen",
    formComponent: "Komponente oder Ersatzteil",
    formUnclear: "unklar, ob es sich um ein komplettes System handelt",
    matchFull: "vollständig bestätigt",
    matchPartial: "teilweise bestätigt",
    matchUnconfirmed: "nicht bestätigt",
    matchNotEvaluated: "nicht bewertet",
    evidenceConfirmed: "bestätigt",
    evidenceLikely: "wahrscheinlich relevant",
    evidenceUnconfirmed: "nicht bestätigt",
    sourceStates: (value) => `Die Seite nennt: ${value}`,
    priceMissing: "Preis nicht angegeben",
    priceConfirmed: (price, sellingUnit) => sellingUnit
      ? `${price}; Preiseinheit: ${sellingUnit}`
      : `${price}; Preiseinheit bestätigt`,
    priceUnconfirmed: (price) => `${price}; die Preiseinheit ist nicht bestätigt`,
    moqUnknown: "MOQ nicht angegeben",
    moqStated: (moq) => `angegebene MOQ ${moq}`,
    moqOk: (moq, quantity) => `MOQ ${moq}; passend zur gewünschten Menge ${quantity}`,
    moqBlocking: (moq, quantity) => `MOQ ${moq} liegt über der gewünschten Menge ${quantity}`,
    landedMissingPrice: "nicht berechnet — vollständiger Preis fehlt",
    landedBlockedPrice: "nicht berechnet — Preiseinheit nicht bestätigt",
    landedBlockedMoq: "nicht berechnet — gewünschte Menge liegt unter der MOQ",
    landedBlockedIncoterm: "nicht berechnet — Incoterm nicht bestätigt",
    landedBlockedLogistics: "nicht berechnet — Verpackung und Gewicht sind nicht zuverlässig bestätigt",
    landedReady: "Daten sind für eine vorläufige Berechnung bereit",
    actionConfirmPrice: "Angebotsumfang und Preiseinheit beim Lieferanten bestätigen.",
    actionDoNotCompare: "Preis nicht mit dem gesuchten Komplettprodukt vergleichen; das Angebot nur als andere Produktart oder Komponente behandeln.",
    actionConfirmRequirements: "Fehlende Produkteigenschaften vor dem Vergleich bestätigen.",
    actionNegotiateMoq: "Eine niedrigere Mindestmenge verhandeln oder die geplante Menge ändern.",
    actionConfirmIncoterm: "Incoterm und Transportausgangspunkt bestätigen.",
    actionConfirmPackaging: "Abmessungen, Bruttogewicht und Stückzahl pro Karton bestätigen.",
    actionReady: "Angebot zum Vergleich hinzufügen und eine vorläufige Landed-Cost-Berechnung starten.",
    questionConfirmPrice: (price) => price
      ? `Gilt der angezeigte Preis von ${price} für eine Düse, ein Teilepaket oder ein komplettes System? Bitte nennen Sie den genauen Inhalt einer Verkaufseinheit.`
      : "Was umfasst eine Verkaufseinheit genau und wie hoch ist der Preis für das komplette Produkt?",
    questionDoNotCompare: "Bietet der Lieferant ein vollständiges Produkt gemäß unserer Anfrage an und nicht nur Pumpe, Düsen oder Einzelteile?",
    questionConfirmRequirements: "Bitte bestätigen Sie alle geforderten Produkteigenschaften und senden Sie die genaue Spezifikation der angebotenen Variante.",
    questionNegotiateMoq: "Können Sie unsere gewünschte Menge unterhalb der MOQ akzeptieren und zu welchem Preis?",
    questionConfirmIncoterm: "Welcher Incoterm gilt für den angezeigten Preis und von welcher Stadt oder welchem Hafen startet die Ware?",
    questionConfirmPackaging: "Bitte senden Sie Abmessungen und Bruttogewicht je Verkaufseinheit sowie die Stückzahl pro Karton.",
    questionReady: "Bitte bestätigen Sie Endpreis, Produktionszeit, Musterverfügbarkeit und Zahlungsbedingungen.",
  },
  en: {
    title: "TAJA business review",
    statusReady: "READY TO COMPARE",
    statusReview: "REVIEW REQUIRED",
    statusBlocked: "NOT COMPARABLE",
    descriptionReady: "The core data is clear enough for a preliminary comparison. Final selection still requires supplier verification.",
    descriptionReview: "The page contains useful data, but the product scope or price basis is not yet clear enough.",
    descriptionBlocked: "The offer is not currently comparable with the requested product or quantity.",
    productForm: "What is being sold",
    requirementMatch: "Match to the request",
    pump: "Pump",
    nozzles: "Nozzles",
    exactNozzleCount: (count) => `Exactly ${count} nozzles`,
    displayedPrice: "Displayed price",
    moq: "Minimum order",
    landedCost: "Landed cost",
    nextStep: "Next step",
    supplierQuestion: "Suggested supplier question",
    formComplete: "complete system / kit",
    formPump: "pump only",
    formNozzles: "nozzles only",
    formComponent: "component or spare part",
    formUnclear: "unclear whether this is a complete system",
    matchFull: "fully confirmed",
    matchPartial: "partially confirmed",
    matchUnconfirmed: "not confirmed",
    matchNotEvaluated: "not evaluated",
    evidenceConfirmed: "confirmed",
    evidenceLikely: "likely relevant",
    evidenceUnconfirmed: "not confirmed",
    sourceStates: (value) => `The page states: ${value}`,
    priceMissing: "price not stated",
    priceConfirmed: (price, sellingUnit) => sellingUnit
      ? `${price}; price unit: ${sellingUnit}`
      : `${price}; price unit confirmed`,
    priceUnconfirmed: (price) => `${price}; the price unit is not confirmed`,
    moqUnknown: "MOQ not stated",
    moqStated: (moq) => `stated MOQ ${moq}`,
    moqOk: (moq, quantity) => `MOQ ${moq}; compatible with requested quantity ${quantity}`,
    moqBlocking: (moq, quantity) => `MOQ ${moq} exceeds requested quantity ${quantity}`,
    landedMissingPrice: "not calculated — complete price is missing",
    landedBlockedPrice: "not calculated — price unit is unconfirmed",
    landedBlockedMoq: "not calculated — requested quantity is below MOQ",
    landedBlockedIncoterm: "not calculated — Incoterm is unconfirmed",
    landedBlockedLogistics: "not calculated — packaging and weight are not reliably confirmed",
    landedReady: "data is ready for a preliminary calculation",
    actionConfirmPrice: "Confirm offer contents and the price unit with the supplier.",
    actionDoNotCompare: "Do not compare this price with the requested complete product; treat the offer only as another product type or component.",
    actionConfirmRequirements: "Confirm the missing product requirements before comparison.",
    actionNegotiateMoq: "Negotiate a lower MOQ or change the planned quantity.",
    actionConfirmIncoterm: "Confirm the Incoterm and transport origin.",
    actionConfirmPackaging: "Confirm dimensions, gross weight and pieces per carton.",
    actionReady: "Add the offer for comparison and start a preliminary landed-cost calculation.",
    questionConfirmPrice: (price) => price
      ? `Does the displayed price of ${price} apply to one nozzle, a parts package or a complete system? Please state the exact contents of one selling unit.`
      : "What exactly is included in one selling unit and what is the price of the complete product?",
    questionDoNotCompare: "Does the supplier offer a complete product matching our request rather than only a pump, nozzles or another component?",
    questionConfirmRequirements: "Please confirm every requested product feature and send the exact specification of the offered variant.",
    questionNegotiateMoq: "Can you accept our requested quantity below the stated MOQ, and at what price?",
    questionConfirmIncoterm: "Which Incoterm applies to the displayed price, and from which city or port will the goods depart?",
    questionConfirmPackaging: "Please provide dimensions and gross weight per selling unit and the number of units per carton.",
    questionReady: "Please confirm final price, production lead time, sample availability and payment terms.",
  },
};

function productFormText(
  summary: TajaPreviewBusinessSummaryValue,
  copy: SummaryCopy,
) {
  if (summary.productForm === TajaOfferProductForms.COMPLETE_SYSTEM) return copy.formComplete;
  if (summary.productForm === TajaOfferProductForms.PUMP_ONLY) return copy.formPump;
  if (summary.productForm === TajaOfferProductForms.NOZZLES_ONLY) return copy.formNozzles;
  if (summary.productForm === TajaOfferProductForms.COMPONENT) return copy.formComponent;
  return copy.formUnclear;
}

function requirementText(
  status: TajaPreviewBusinessSummaryValue["requirementMatchStatus"],
  copy: SummaryCopy,
) {
  if (status === TajaRequirementMatchStatuses.FULL) return copy.matchFull;
  if (status === TajaRequirementMatchStatuses.PARTIAL) return copy.matchPartial;
  if (status === TajaRequirementMatchStatuses.UNCONFIRMED) return copy.matchUnconfirmed;
  return copy.matchNotEvaluated;
}

function evidenceText(
  status: TajaPreviewBusinessSummaryValue["pumpStatus"],
  value: string | null,
  copy: SummaryCopy,
) {
  const label = status === TajaRequirementEvidenceStatuses.CONFIRMED
    ? copy.evidenceConfirmed
    : status === TajaRequirementEvidenceStatuses.LIKELY
      ? copy.evidenceLikely
      : copy.evidenceUnconfirmed;
  return value ? `${label} · ${copy.sourceStates(value)}` : label;
}

function priceText(
  preview: SupplierOfferUrlPreview,
  summary: TajaPreviewBusinessSummaryValue,
  copy: SummaryCopy,
) {
  if (preview.price === null || preview.currency === null) return copy.priceMissing;
  const price = `${preview.price} ${preview.currency}`;
  return summary.priceBasisStatus === TajaPreviewPriceBasisStatuses.CONFIRMED
    ? copy.priceConfirmed(price, summary.sellingUnit)
    : copy.priceUnconfirmed(price);
}

function moqText(
  preview: SupplierOfferUrlPreview,
  summary: TajaPreviewBusinessSummaryValue,
  copy: SummaryCopy,
) {
  if (summary.moqStatus === TajaPreviewMoqStatuses.UNKNOWN || preview.minimumOrderQuantity === null) {
    return copy.moqUnknown;
  }
  if (summary.moqStatus === TajaPreviewMoqStatuses.STATED || summary.requestedQuantity === null) {
    return copy.moqStated(preview.minimumOrderQuantity);
  }
  return summary.moqStatus === TajaPreviewMoqStatuses.OK
    ? copy.moqOk(preview.minimumOrderQuantity, summary.requestedQuantity)
    : copy.moqBlocking(preview.minimumOrderQuantity, summary.requestedQuantity);
}

function landedCostText(
  status: TajaPreviewBusinessSummaryValue["landedCostStatus"],
  copy: SummaryCopy,
) {
  if (status === TajaPreviewLandedCostStatuses.MISSING_PRICE) return copy.landedMissingPrice;
  if (status === TajaPreviewLandedCostStatuses.BLOCKED_PRICE_BASIS) return copy.landedBlockedPrice;
  if (status === TajaPreviewLandedCostStatuses.BLOCKED_MOQ) return copy.landedBlockedMoq;
  if (status === TajaPreviewLandedCostStatuses.BLOCKED_INCOTERM) return copy.landedBlockedIncoterm;
  if (status === TajaPreviewLandedCostStatuses.BLOCKED_LOGISTICS) return copy.landedBlockedLogistics;
  return copy.landedReady;
}

function actionText(
  action: TajaPreviewBusinessSummaryValue["nextAction"],
  copy: SummaryCopy,
) {
  if (action === TajaPreviewNextActions.CONFIRM_PRICE_AND_CONTENTS) return copy.actionConfirmPrice;
  if (action === TajaPreviewNextActions.DO_NOT_COMPARE_AS_REQUESTED_PRODUCT) return copy.actionDoNotCompare;
  if (action === TajaPreviewNextActions.CONFIRM_REQUIREMENTS) return copy.actionConfirmRequirements;
  if (action === TajaPreviewNextActions.NEGOTIATE_MOQ) return copy.actionNegotiateMoq;
  if (action === TajaPreviewNextActions.CONFIRM_INCOTERM) return copy.actionConfirmIncoterm;
  if (action === TajaPreviewNextActions.CONFIRM_PACKAGING) return copy.actionConfirmPackaging;
  return copy.actionReady;
}

function supplierQuestion(
  preview: SupplierOfferUrlPreview,
  summary: TajaPreviewBusinessSummaryValue,
  copy: SummaryCopy,
) {
  const price = preview.price !== null && preview.currency
    ? `${preview.price} ${preview.currency}`
    : null;
  if (summary.nextAction === TajaPreviewNextActions.CONFIRM_PRICE_AND_CONTENTS) {
    return copy.questionConfirmPrice(price);
  }
  if (summary.nextAction === TajaPreviewNextActions.DO_NOT_COMPARE_AS_REQUESTED_PRODUCT) {
    return copy.questionDoNotCompare;
  }
  if (summary.nextAction === TajaPreviewNextActions.CONFIRM_REQUIREMENTS) {
    return copy.questionConfirmRequirements;
  }
  if (summary.nextAction === TajaPreviewNextActions.NEGOTIATE_MOQ) {
    return copy.questionNegotiateMoq;
  }
  if (summary.nextAction === TajaPreviewNextActions.CONFIRM_INCOTERM) {
    return copy.questionConfirmIncoterm;
  }
  if (summary.nextAction === TajaPreviewNextActions.CONFIRM_PACKAGING) {
    return copy.questionConfirmPackaging;
  }
  return copy.questionReady;
}

function statusCopy(summary: TajaPreviewBusinessSummaryValue, copy: SummaryCopy) {
  if (summary.status === TajaPreviewBusinessStatuses.READY) {
    return { label: copy.statusReady, description: copy.descriptionReady, className: "ready" };
  }
  if (summary.status === TajaPreviewBusinessStatuses.BLOCKED) {
    return { label: copy.statusBlocked, description: copy.descriptionBlocked, className: "blocked" };
  }
  return { label: copy.statusReview, description: copy.descriptionReview, className: "review" };
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function TajaPreviewBusinessSummary({
  preview,
  productQuery,
  requestedQuantity,
}: {
  preview: SupplierOfferUrlPreview;
  productQuery?: string | null;
  requestedQuantity?: number | null;
}) {
  const { locale } = useI18n();
  const copy = copyByLocale[locale];
  const summary = buildTajaPreviewBusinessSummary(preview, {
    productQuery,
    requestedQuantity,
  });
  const status = statusCopy(summary, copy);
  const nozzleStatus = summary.requestedNozzleCount !== null && summary.nozzleCountStatus
    ? summary.nozzleCountStatus
    : summary.nozzleStatus;

  return (
    <section className={`taja-preview-summary taja-preview-summary-${status.className}`}>
      <header>
        <div>
          <p className="eyebrow">TAJA</p>
          <h3>{copy.title}</h3>
          <p>{status.description}</p>
        </div>
        <span className="taja-preview-summary-status">{status.label}</span>
      </header>

      <dl className="taja-preview-summary-grid">
        <SummaryRow label={copy.productForm} value={productFormText(summary, copy)} />
        {summary.requirementMatchStatus !== null && (
          <SummaryRow
            label={copy.requirementMatch}
            value={requirementText(summary.requirementMatchStatus, copy)}
          />
        )}
        <SummaryRow
          label={copy.pump}
          value={evidenceText(summary.pumpStatus, summary.pumpValue, copy)}
        />
        <SummaryRow
          label={summary.requestedNozzleCount !== null
            ? copy.exactNozzleCount(summary.requestedNozzleCount)
            : copy.nozzles}
          value={evidenceText(nozzleStatus, summary.nozzleValue, copy)}
        />
        <SummaryRow
          label={copy.displayedPrice}
          value={priceText(preview, summary, copy)}
        />
        <SummaryRow label={copy.moq} value={moqText(preview, summary, copy)} />
        <SummaryRow
          label={copy.landedCost}
          value={landedCostText(summary.landedCostStatus, copy)}
        />
      </dl>

      <div className="taja-preview-next-step">
        <strong>{copy.nextStep}</strong>
        <p>{actionText(summary.nextAction, copy)}</p>
      </div>

      <div className="taja-preview-supplier-question">
        <strong>{copy.supplierQuestion}</strong>
        <p>{supplierQuestion(preview, summary, copy)}</p>
      </div>
    </section>
  );
}
