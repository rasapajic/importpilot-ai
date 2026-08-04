"use client";

import type { CostCalculation, SupplierOffer } from "@prisma/client";
import Link from "next/link";

import { useI18n } from "@/components/i18n/i18n-provider";
import {
  calculateProfitabilityRecovery,
  ProfitabilityRecoveryActions,
  type ProfitabilityRecoveryAction,
} from "@/modules/cost-engine/domain/profitability-recovery";
import type { LandedCostAssumptions } from "@/modules/cost-engine/domain/serbia-landed-cost";
import type { ProjectDecisionResult } from "@/modules/decisions/domain/project-decision";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import type { Locale } from "@/modules/i18n/translations";

type DecisionView = ProjectDecisionResult & { id: string; createdAt: Date | string };

type RecoveryOffer = SupplierOffer & {
  costCalculations: CostCalculation[];
  latestCostAssumptions?: LandedCostAssumptions | null;
};

type RecoveryCopy = {
  eyebrow: string;
  title: string;
  description: string;
  maxLandedCost: string;
  minSellingPrice: string;
  maxSupplierPrice: string;
  supplierReduction: string;
  sellingIncrease: string;
  recommendation: string;
  assumptions: string;
  unavailable: string;
  actions: Record<ProfitabilityRecoveryAction, string>;
  actionButtons: Record<ProfitabilityRecoveryAction, string>;
};

const copy: Record<Locale, RecoveryCopy> = {
  sr: {
    eyebrow: "Put do ciljne marže",
    title: "Kako da proizvod postane isplativ?",
    description: "ImportPilot računa koliko cena ili prodajni uslovi moraju da se promene da biste dostigli ciljnu maržu.",
    maxLandedCost: "Maksimalna stvarna cena po komadu",
    minSellingPrice: "Minimalna potrebna prodajna cena",
    maxSupplierPrice: "Maksimalna cena dobavljača",
    supplierReduction: "Potrebno sniženje cene dobavljača",
    sellingIncrease: "Potrebno povećanje prodajne cene",
    recommendation: "Najrealniji sledeći potez",
    assumptions: "Ovaj proračun koristi trenutno unete pretpostavke za transport, carinu, PDV i ostale troškove. Potvrdite ih pre kupovine.",
    unavailable: "Nije moguće dostići cilj samo promenom cene dobavljača.",
    actions: {
      TARGET_MET: "Ciljna marža je već dostignuta.",
      NEGOTIATE_SUPPLIER: "Tražite nižu cenu dobavljača.",
      RAISE_SELLING_PRICE: "Povećajte prodajnu cenu.",
      FIND_NEW_OFFERS: "Pronađite nove ponude ili promenite proizvod.",
    },
    actionButtons: {
      TARGET_MET: "Pogledaj rezultat",
      NEGOTIATE_SUPPLIER: "Predloži poruku",
      RAISE_SELLING_PRICE: "Promeni prodajnu cenu",
      FIND_NEW_OFFERS: "Pronađi nove ponude",
    },
  },
  de: {
    eyebrow: "Weg zur Zielmarge",
    title: "Wie wird das Produkt rentabel?",
    description: "ImportPilot berechnet, wie stark Preis oder Verkaufsbedingungen geändert werden müssen, um die Zielmarge zu erreichen.",
    maxLandedCost: "Maximale tatsächliche Stückkosten",
    minSellingPrice: "Erforderlicher Mindestverkaufspreis",
    maxSupplierPrice: "Maximaler Lieferantenpreis",
    supplierReduction: "Erforderliche Senkung des Lieferantenpreises",
    sellingIncrease: "Erforderliche Erhöhung des Verkaufspreises",
    recommendation: "Realistischster nächster Schritt",
    assumptions: "Diese Berechnung verwendet die aktuell erfassten Annahmen für Transport, Zoll, Mehrwertsteuer und sonstige Kosten. Vor dem Kauf bestätigen.",
    unavailable: "Das Ziel kann nicht allein durch eine Änderung des Lieferantenpreises erreicht werden.",
    actions: {
      TARGET_MET: "Die Zielmarge ist bereits erreicht.",
      NEGOTIATE_SUPPLIER: "Einen niedrigeren Lieferantenpreis verhandeln.",
      RAISE_SELLING_PRICE: "Den Verkaufspreis erhöhen.",
      FIND_NEW_OFFERS: "Neue Angebote suchen oder das Produkt wechseln.",
    },
    actionButtons: {
      TARGET_MET: "Ergebnis ansehen",
      NEGOTIATE_SUPPLIER: "Nachricht vorschlagen",
      RAISE_SELLING_PRICE: "Verkaufspreis ändern",
      FIND_NEW_OFFERS: "Neue Angebote suchen",
    },
  },
  en: {
    eyebrow: "Path to target margin",
    title: "How can this product become profitable?",
    description: "ImportPilot calculates how much the price or selling conditions must change to reach the target margin.",
    maxLandedCost: "Maximum true cost per unit",
    minSellingPrice: "Minimum required selling price",
    maxSupplierPrice: "Maximum supplier price",
    supplierReduction: "Required supplier-price reduction",
    sellingIncrease: "Required selling-price increase",
    recommendation: "Most realistic next step",
    assumptions: "This calculation uses the current transport, customs, VAT and other cost assumptions. Confirm them before purchasing.",
    unavailable: "The target cannot be reached by changing the supplier price alone.",
    actions: {
      TARGET_MET: "The target margin is already reached.",
      NEGOTIATE_SUPPLIER: "Negotiate a lower supplier price.",
      RAISE_SELLING_PRICE: "Increase the selling price.",
      FIND_NEW_OFFERS: "Find new offers or change the product.",
    },
    actionButtons: {
      TARGET_MET: "View result",
      NEGOTIATE_SUPPLIER: "Draft a message",
      RAISE_SELLING_PRICE: "Change selling price",
      FIND_NEW_OFFERS: "Find new offers",
    },
  },
};

function displayMoney(value: string, currency: string) {
  const display = getEuroDisplay(value, currency);
  if (!display.original) return value;
  return display.converted ? `${display.original} (≈ ${display.eur})` : display.original;
}

function actionHref(projectId: string, offerId: string, action: ProfitabilityRecoveryAction) {
  if (action === ProfitabilityRecoveryActions.NEGOTIATE_SUPPLIER) {
    return "#negotiation-assistant";
  }
  if (action === ProfitabilityRecoveryActions.RAISE_SELLING_PRICE) {
    return `/projects/${projectId}?editCalculationOffer=${offerId}#workflow-step-decision`;
  }
  if (action === ProfitabilityRecoveryActions.FIND_NEW_OFFERS) {
    return "#workflow-step-offer";
  }
  return "#workflow-step-decision";
}

export function ProfitabilityRecoveryPanel({
  projectId,
  targetCountry,
  projectTargetMargin,
  offers,
  decision,
}: {
  projectId: string;
  targetCountry: string;
  projectTargetMargin: number;
  offers: RecoveryOffer[];
  decision: DecisionView | null;
}) {
  const { locale } = useI18n();
  const text = copy[locale];

  if (!decision || !["DO_NOT_BUY", "NEGOTIATE_FIRST"].includes(decision.status)) {
    return null;
  }

  const offer = decision.selectedOfferId
    ? offers.find((candidate) => candidate.id === decision.selectedOfferId) ?? null
    : null;
  const calculation = offer?.costCalculations[0] ?? null;
  if (!offer || !calculation || !offer.unitPrice || !offer.currency || !offer.incoterm) {
    return null;
  }

  const assumptions = offer.latestCostAssumptions ?? null;
  const recovery = calculateProfitabilityRecovery({
    targetCountry,
    quantity: calculation.quantity,
    currentSupplierUnitPrice: offer.unitPrice,
    currency: offer.currency,
    incoterm: offer.incoterm,
    shippingCost: calculation.shippingCost,
    customsDutyRate: calculation.customsDutyRate,
    vatRate: calculation.vatRate,
    storageCost: calculation.storageCost,
    inspectionCost: calculation.inspectionCost,
    customsBrokerCost: assumptions?.customsBrokerCost ?? "0.00",
    otherCosts: assumptions?.otherCosts ?? calculation.otherCosts,
    targetSellingPrice: calculation.targetSellingPrice,
    currentLandedCostPerUnit: calculation.landedCostPerUnit,
    currentGrossMarginPercent: calculation.grossMarginPercent,
    targetMarginPercent: projectTargetMargin,
  });

  const supplierReduction = recovery.supplierReductionAmount === null
    ? text.unavailable
    : `${displayMoney(recovery.supplierReductionAmount, offer.currency)} (${recovery.supplierReductionPercent}%)`;
  const sellingIncrease = `${displayMoney(recovery.sellingPriceIncreaseAmount, offer.currency)} (${recovery.sellingPriceIncreasePercent}%)`;

  return (
    <section className="dashboard-card profitability-recovery-card">
      <p className="eyebrow">{text.eyebrow}</p>
      <h3>{text.title}</h3>
      <p>{text.description}</p>

      <div className="decision-summary-primary">
        <div>
          <span>{text.maxLandedCost}</span>
          <strong>{displayMoney(recovery.maximumLandedCostPerUnit, offer.currency)}</strong>
        </div>
        <div>
          <span>{text.minSellingPrice}</span>
          <strong>{displayMoney(recovery.minimumSellingPrice, offer.currency)}</strong>
        </div>
        <div>
          <span>{text.maxSupplierPrice}</span>
          <strong>
            {recovery.maximumSupplierUnitPrice === null
              ? text.unavailable
              : displayMoney(recovery.maximumSupplierUnitPrice, offer.currency)}
          </strong>
        </div>
        <div>
          <span>{text.supplierReduction}</span>
          <strong>{supplierReduction}</strong>
        </div>
        <div>
          <span>{text.sellingIncrease}</span>
          <strong>{sellingIncrease}</strong>
        </div>
      </div>

      <div className="empty-state">
        <strong>{text.recommendation}: {text.actions[recovery.action]}</strong>
        <p>{text.assumptions}</p>
        <Link
          className="primary-link"
          href={actionHref(projectId, offer.id, recovery.action)}
        >
          {text.actionButtons[recovery.action]}
        </Link>
      </div>
    </section>
  );
}
