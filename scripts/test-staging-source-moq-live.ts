/**
 * #187 acceptance-only source reader rehearsal. One public HTTPS GET at most;
 * no project, database, credentials, background jobs or supplier messaging.
 */
import {
  createAcceptanceLocalMoqReader,
  DILICN_187_EXACT_PRODUCT_URL,
} from "../modules/product-search/infrastructure/staging-source-moq-reader";

const timestamp = new Date().toISOString();
try {
  const result = await createAcceptanceLocalMoqReader()
    .previewSupplierOfferUrl(DILICN_187_EXACT_PRODUCT_URL);
  const accepted = result.productUrl === DILICN_187_EXACT_PRODUCT_URL &&
    result.minimumOrderQuantity === 1200 &&
    result.isPartial !== true &&
    result.titleFromSlug !== true &&
    /senior/i.test(result.title ?? "") &&
    /reading\s+glasses/i.test(result.title ?? "");
  console.log(JSON.stringify({
    test: "JAKOV360-187-STAGING-LOCAL-READER-LIVE",
    checkedAt: timestamp,
    status: accepted ? "PASS" : "NOT_VERIFIED",
    exactProduct: result.productUrl === DILICN_187_EXACT_PRODUCT_URL,
    titleExpected: /senior/i.test(result.title ?? "") && /reading\s+glasses/i.test(result.title ?? ""),
    pageMoq: result.minimumOrderQuantity,
    partial: result.isPartial,
    priceForBuyer1000Confirmed: false,
    requestsMade: 1,
    databaseWrites: 0,
    supplierMessagesSent: 0,
  }));
  if (!accepted) process.exitCode = 2;
} catch (error) {
  console.log(JSON.stringify({
    test: "JAKOV360-187-STAGING-LOCAL-READER-LIVE",
    checkedAt: timestamp,
    status: "NOT_VERIFIED",
    errorType: error instanceof Error ? error.name : "Unknown",
    databaseWrites: 0,
    supplierMessagesSent: 0,
  }));
  process.exitCode = 2;
}
