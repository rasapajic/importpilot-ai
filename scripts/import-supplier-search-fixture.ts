import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { supplierOfferSearchResultsSchema } from "../modules/product-search/domain/search";
import { storeSuccessfulSupplierSearch } from "../modules/product-search/infrastructure/persistent-cache";
import { parseAlibabaSearchHtml } from "../services/importpilot-search-provider/src/alibaba-source";
import { parseMadeInChinaSearchHtml } from "../services/importpilot-search-provider/src/made-in-china-provider";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const file = option("file");
  const provider = option("provider");
  const query = option("query");
  const quantity = Number(option("quantity"));
  const targetCountry = option("target-country")?.toUpperCase();

  if (
    !file ||
    !provider ||
    !query ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !targetCountry?.match(/^[A-Z]{2}$/)
  ) {
    throw new Error(
      "Usage: npm run cache:import-supplier-fixture -- --file <path> --provider <alibaba|made-in-china|json> --query <query> --quantity <number> --target-country <code>",
    );
  }

  const contents = await readFile(resolve(file), "utf8");
  const results = supplierOfferSearchResultsSchema.min(1).parse(
    provider === "alibaba"
      ? parseAlibabaSearchHtml(contents)
      : provider === "made-in-china"
        ? parseMadeInChinaSearchHtml(contents)
        : provider === "json"
          ? JSON.parse(contents)
          : [],
  );

  const cache = await storeSuccessfulSupplierSearch({
    query,
    quantity,
    targetCountry,
  }, results);

  console.log(JSON.stringify({
    stored: true,
    cacheId: cache.id,
    resultCount: results.length,
    source: cache.source,
    normalizedQuery: cache.normalizedQuery,
    expiresAt: cache.expiresAt,
  }, null, 2));
}

void main();
