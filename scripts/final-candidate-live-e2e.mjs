import { randomUUID } from "node:crypto";

const origin = process.env.STAGING_ORIGIN ?? "https://importpilot-1-0-staging.onrender.com";
const requestTimeoutMs = 75_000;
let sessionCookie = "";

function timeoutSignal(ms = requestTimeoutMs) {
  return AbortSignal.timeout(ms);
}

async function raw(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (sessionCookie) headers.set("cookie", sessionCookie);
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? timeoutSignal(),
  });
  return response;
}

async function jsonRequest(path, { method = "GET", body, expected, timeoutMs = requestTimeoutMs } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers.origin = origin;
  const response = await raw(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeoutSignal(timeoutMs),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (expected !== undefined && response.status !== expected) {
    throw new Error(`${method} ${path} returned ${response.status}, expected ${expected}: ${text.slice(0, 1200)}`);
  }
  return { response, payload };
}

function supportedIncoterm(value) {
  return ["EXW", "FCA", "FAS", "FOB"].includes(String(value ?? "").toUpperCase());
}

function safePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validCurrency(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value.toUpperCase());
}

function candidateScore(result) {
  let score = 0;
  const source = String(result.source ?? "").toLowerCase();
  if (source.includes("made-in-china")) score += 40;
  if (source.includes("alibaba")) score += 25;
  if (supportedIncoterm(result.incoterm)) score += 25;
  const moq = result.minimumOrderQuantity == null ? null : Number(result.minimumOrderQuantity);
  if (moq == null || moq <= 80) score += 20;
  if (result.imageUrl) score += 10;
  if (result.provenance?.resultOrigin === "live") score += 10;
  return score;
}

function costBody({ unitPrice, quantity, vatRate, sellingPrice }) {
  const goods = unitPrice * quantity;
  const money = (number) => Math.max(0, number).toFixed(2);
  return {
    chinaDomesticTransportCost: money(Math.max(10, goods * 0.01)),
    internationalTransportCost: money(Math.max(50, goods * 0.05)),
    insuranceCost: money(Math.max(5, goods * 0.005)),
    customsBrokerCost: money(Math.max(20, goods * 0.01)),
    customsDutyRate: "5",
    vatRate: String(vatRate),
    vatSource: "COUNTRY_PROFILE_DEFAULT",
    storageCost: money(Math.max(10, goods * 0.005)),
    inspectionCost: money(Math.max(10, goods * 0.005)),
    otherCosts: money(Math.max(5, goods * 0.003)),
    targetSellingPrice: money(sellingPrice),
    transportConfirmed: true,
    customsDutyConfirmed: true,
    calculationStatus: "CALCULATED",
  };
}

async function main() {
  const health = await jsonRequest("/api/health", { expected: 200, timeoutMs: 20_000 });
  if (health.payload?.status !== "ok" || health.payload?.database !== "ok") {
    throw new Error(`Staging health is not ready: ${JSON.stringify(health.payload)}`);
  }

  const registerPage = await raw("/register", { signal: timeoutSignal(20_000) });
  const registerHtml = await registerPage.text();
  if (!registerPage.ok || !registerHtml.includes('method="post"') || !registerHtml.includes('action="/api/auth/register"')) {
    throw new Error("Exact candidate deployment marker is missing from /register.");
  }
  console.log("EXACT_CANDIDATE_DEPLOYMENT_MARKER PASS");

  const email = `final-e2e-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = "Final-E2E-2026A";
  const registration = await jsonRequest("/api/auth/register", {
    method: "POST",
    expected: 201,
    timeoutMs: 30_000,
    body: {
      name: "Final Candidate E2E",
      organizationName: "ImportPilot Final Candidate E2E",
      email,
      password,
    },
  });
  const setCookie = registration.response.headers.get("set-cookie") ?? "";
  const firstCookie = setCookie.split(";", 1)[0];
  if (!firstCookie.startsWith("tradepilot_session=")) {
    throw new Error("Registration did not return the ImportPilot session cookie.");
  }
  sessionCookie = firstCookie;

  const quantity = 80;
  const project = await jsonRequest("/api/projects", {
    method: "POST",
    expected: 201,
    timeoutMs: 30_000,
    body: {
      name: `Final Candidate RS Household ${Date.now()}`,
      targetCountry: "RS",
      quantity,
      targetMargin: 20,
    },
  });
  const projectId = project.payload?.id;
  if (!projectId) throw new Error("Project creation did not return an id.");

  const searchStarted = Date.now();
  const search = await jsonRequest(`/api/projects/${projectId}/supplier-search`, {
    method: "POST",
    expected: 200,
    timeoutMs: 75_000,
    body: {
      query: "stainless steel insulated lunch box 1000ml",
      quantity,
      targetCountry: "RS",
      targetMarginPercent: 20,
    },
  });
  const results = Array.isArray(search.payload?.results) ? search.payload.results : [];
  if (!results.length) throw new Error(`Final candidate live search returned zero results: ${search.payload?.reason ?? "no reason"}`);

  for (const result of results) {
    if (result.provenance?.targetCountry && result.provenance.targetCountry !== "RS") {
      throw new Error("Live result provenance target country does not match RS.");
    }
    if (result.provenance?.quantity && Number(result.provenance.quantity) !== quantity) {
      throw new Error("Live result provenance quantity does not match 80.");
    }
    if ((result.price == null) !== (result.currency == null)) {
      throw new Error("Live result has an invalid price/currency pair.");
    }
  }

  const candidates = results
    .filter((result) => {
      if (!safePositive(result.price) || !validCurrency(result.currency)) return false;
      try {
        const host = new URL(result.productUrl).hostname.toLowerCase();
        return host.includes("made-in-china.com") || host.includes("alibaba.com");
      } catch {
        return false;
      }
    })
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, 5);
  if (!candidates.length) throw new Error("No priced supported-page finalist exists in final candidate search results.");

  let selected = null;
  let preview = null;
  for (const candidate of candidates) {
    const attempt = await jsonRequest(`/api/projects/${projectId}/supplier-search/url-preview`, {
      method: "POST",
      timeoutMs: 30_000,
      body: { productUrl: candidate.productUrl },
    });
    console.log(JSON.stringify({
      exactPageHost: new URL(candidate.productUrl).hostname,
      exactPageStatus: attempt.response.status,
    }));
    if (attempt.response.status === 200) {
      selected = candidate;
      preview = attempt.payload?.preview ?? {};
      break;
    }
    if (![413, 422, 423, 504].includes(attempt.response.status)) {
      throw new Error(`Unexpected exact-page status ${attempt.response.status}: ${JSON.stringify(attempt.payload)}`);
    }
  }
  if (!selected || !preview) throw new Error("No exact-page finalist succeeded in five evidence-backed attempts.");

  const exactPrice = safePositive(preview.price);
  const exactCurrency = validCurrency(String(preview.currency ?? "").toUpperCase())
    ? String(preview.currency).toUpperCase()
    : null;
  const searchPrice = safePositive(selected.price);
  const searchCurrency = String(selected.currency ?? "").toUpperCase();
  const useExactPrice = exactPrice && exactCurrency;
  const unitPrice = useExactPrice ? exactPrice : searchPrice;
  const currency = useExactPrice ? exactCurrency : searchCurrency;
  if (!unitPrice || !validCurrency(currency)) throw new Error("Selected finalist has no usable commercial price/currency evidence.");

  const exactTerm = String(preview.incoterm ?? "").toUpperCase();
  const searchTerm = String(selected.incoterm ?? "").toUpperCase();
  const incoterm = supportedIncoterm(exactTerm)
    ? exactTerm
    : supportedIncoterm(searchTerm)
      ? searchTerm
      : "FOB";
  const incotermSource = supportedIncoterm(exactTerm)
    ? "exact-page"
    : supportedIncoterm(searchTerm)
      ? "search-result"
      : "manual-acceptance-input";

  console.log(JSON.stringify({
    searchDurationMs: Date.now() - searchStarted,
    searchResultCount: results.length,
    liveOriginCount: results.filter((result) => result.provenance?.resultOrigin === "live").length,
    selectedSource: selected.source,
    selectedOrigin: selected.provenance?.resultOrigin ?? "unknown",
    exactPageFields: ["title", "supplierName", "price", "currency", "minimumOrderQuantity", "imageUrl", "incoterm"]
      .filter((field) => preview[field] !== null && preview[field] !== undefined && preview[field] !== ""),
    priceSource: useExactPrice ? "exact-page" : "search-result",
    unitPrice,
    currency,
    incoterm,
    incotermSource,
    minimumOrderQuantity: selected.minimumOrderQuantity ?? null,
  }));

  const imported = await jsonRequest(`/api/projects/${projectId}/supplier-search/import`, {
    method: "POST",
    expected: 201,
    timeoutMs: 30_000,
    body: selected,
  });
  const offerId = imported.payload?.offerId;
  if (!offerId) throw new Error("Final candidate offer import did not return offerId.");

  await jsonRequest(`/api/offers/${offerId}/commercial-terms`, {
    method: "PATCH",
    expected: 200,
    timeoutMs: 30_000,
    body: { unitPrice, currency, incoterm, deliveryTimeDays: null },
  });

  const fx = await jsonRequest("/api/fx/latest", { expected: 200, timeoutMs: 20_000 });
  const timestamp = Date.parse(fx.payload?.timestamp);
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  const rateToEur = Number(fx.payload?.ratesToEur?.[currency]);
  if (!Number.isFinite(timestamp) || ageDays < -1 || ageDays > 7 || !(rateToEur > 0)) {
    throw new Error(`Fresh FX gate failed for ${currency}: ${JSON.stringify(fx.payload)}`);
  }

  const firstSellingPrice = Math.max(unitPrice * 5, 5);
  const firstCost = await jsonRequest(`/api/offers/${offerId}/cost-calculations`, {
    method: "POST",
    expected: 201,
    timeoutMs: 30_000,
    body: costBody({ unitPrice, quantity, vatRate: 20, sellingPrice: firstSellingPrice }),
  });
  if (firstCost.payload?.calculationStatus !== "CALCULATED" || firstCost.payload?.targetCountry !== "RS") {
    throw new Error(`First cost is not a confirmed RS calculation: ${JSON.stringify(firstCost.payload)}`);
  }
  if (Number(firstCost.payload?.vatRate) !== 20 || !(Number(firstCost.payload?.landedCostPerUnit) > 0)) {
    throw new Error("First RS cost has invalid VAT or landed cost.");
  }

  const firstDecision = await jsonRequest(`/api/projects/${projectId}/profitability-check?offerId=${offerId}`, {
    method: "POST",
    expected: 201,
    timeoutMs: 25_000,
  });
  if (firstDecision.payload?.selectedOfferId !== offerId) {
    throw new Error("First decision does not point to the imported offer.");
  }
  if (firstDecision.payload?.status === "DO_NOT_BUY") {
    throw new Error("High-margin first decision is already DO_NOT_BUY; cannot prove decision transition.");
  }

  const landedCostPerUnit = Number(firstCost.payload.landedCostPerUnit);
  const secondSellingPrice = landedCostPerUnit * 0.8;
  const secondCost = await jsonRequest(`/api/offers/${offerId}/cost-calculations`, {
    method: "POST",
    expected: 201,
    timeoutMs: 30_000,
    body: costBody({ unitPrice, quantity, vatRate: 20, sellingPrice: secondSellingPrice }),
  });
  if (secondCost.payload?.calculationStatus !== "CALCULATED") {
    throw new Error("Negative-margin recalculation is not CALCULATED.");
  }
  if (!(Number(secondCost.payload?.grossMarginPercent) < 0)) {
    throw new Error("Negative-margin recalculation did not produce a negative gross margin.");
  }

  const secondDecision = await jsonRequest(`/api/projects/${projectId}/profitability-check?offerId=${offerId}`, {
    method: "POST",
    expected: 201,
    timeoutMs: 25_000,
  });
  if (secondDecision.payload?.selectedOfferId !== offerId) {
    throw new Error("Second decision no longer points to the selected offer.");
  }
  if (secondDecision.payload?.status !== "DO_NOT_BUY") {
    throw new Error(`Expected DO_NOT_BUY after negative-margin recalculation, got ${secondDecision.payload?.status}.`);
  }
  if (firstDecision.payload.status === secondDecision.payload.status) {
    throw new Error("Decision did not change after material economics changed.");
  }

  const finalHealth = await jsonRequest("/api/health", { expected: 200, timeoutMs: 20_000 });
  if (finalHealth.payload?.database !== "ok") throw new Error("Database health is not ok after final E2E.");

  console.log("IMPORTPILOT_FINAL_CANDIDATE_LIVE_E2E PASS");
  console.log(JSON.stringify({
    projectId,
    offerId,
    fx: {
      source: fx.payload.source,
      timestamp: fx.payload.timestamp,
      currency,
      rateToEur,
    },
    firstCalculation: {
      landedCostPerUnit,
      grossMarginPercent: Number(firstCost.payload.grossMarginPercent),
      vatRate: Number(firstCost.payload.vatRate),
      status: firstCost.payload.calculationStatus,
    },
    firstDecision: firstDecision.payload.status,
    secondCalculation: {
      sellingPrice: Number(secondSellingPrice.toFixed(2)),
      grossMarginPercent: Number(secondCost.payload.grossMarginPercent),
      status: secondCost.payload.calculationStatus,
    },
    secondDecision: secondDecision.payload.status,
    selectedOfferPreserved: secondDecision.payload.selectedOfferId === offerId,
    decisionChanged: firstDecision.payload.status !== secondDecision.payload.status,
    finalHealth: finalHealth.payload,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
