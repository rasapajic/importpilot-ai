import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";

const projectRoot = process.cwd();
const fixture = resolve(projectRoot, "tests/browser/moq187-harness.tsx");
const css = await readFile(resolve(projectRoot, "app/globals.css"), "utf8");

// Bundle the REAL production Step 2 React component. Only the Next navigation
// hook is stubbed (no router exists in a component-only browser sandbox).
const bundle = await build({
  entryPoints: [fixture],
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
  jsx: "automatic",
  target: "es2022",
  loader: { ".ts": "ts", ".tsx": "tsx" },
  tsconfig: resolve(projectRoot, "tsconfig.json"),
  plugins: [{
    name: "isolated-next-navigation",
    setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "next/navigation", namespace: "isolated" }));
      b.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({
        contents: `export function useRouter() { return { push() { throw Error("Navigation forbidden in isolated UI test"); }, refresh() {} }; }
export function usePathname() { return "/isolated"; }
export function useSearchParams() { return new URLSearchParams(); }`,
        loader: "js",
      }));
    },
  }],
  logLevel: "warning",
});
const js = bundle.outputFiles.find(x => x.path.endsWith(".js"))?.contents ?? bundle.outputFiles[0]?.contents;
assert(js, "esbuild did not produce a browser bundle");

const server = createServer((req, res) => {
  if (req.url?.startsWith("/bundle.js")) {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(js);
  } else if (req.url?.startsWith("/app.css")) {
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(css);
  } else if (req.url?.startsWith("/isolated")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(`<!doctype html><html lang="sr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  } else {
    res.writeHead(404);
    res.end("Only isolated test routes are permitted");
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const port = server.address()?.port;
assert.equal(typeof port, "number");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const dilicinSku = "jYzpeDtbEMkd";
const sourceUrl = "https://dilicn.en.made-in-china.com/product/jYzpeDtbEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const confirmed = [];
const report = [];

async function exercise({ savedMoq, width }) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: "sr-RS" });
  const page = await context.newPage();
  const pageErrors = [];
  let backgroundPreview = 0;
  let manualPreview = 0;
  let confirmationPrepare = 0;
  const forbiddenRequests = [];
  page.on("pageerror", e => pageErrors.push(e.message));

  await page.route("**/*", async route => {
    const req = route.request();
    const u = new URL(req.url());
    const method = req.method();
    if (u.hostname === "127.0.0.1" && !u.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    if (u.pathname.endsWith("/supplier-search/url-preview") && method === "POST") {
      const payload = req.postDataJSON();
      assert.equal(payload.productUrl, sourceUrl, "Only Dilicin's exact SKU may be verified");
      // First preview is component background image recovery. This is deliberately
      // unverified and must not overwrite the cached MOQ. The explicit click is
      // the second request and receives synthetic, exact-page evidence.
      if (backgroundPreview === 0) {
        backgroundPreview++;
        await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({error:"background read not authoritative"}) });
      } else {
        manualPreview++;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          checkedAt: "2026-10-31T00:00:00.000Z",
          preview: {
            title: "New Model Senior Reading Glasses High Definition",
            supplierName: "Dilicin",
            supplierCountry: "CN",
            price: 0.18,
            currency: "USD",
            minimumOrderQuantity: 1200,
            incoterm: null,
            productUrl: sourceUrl,
            imageUrl: null,
            source: "dilicn.en.made-in-china.com",
            isPartial: false,
            titleFromSlug: false,
          },
        }) });
      }
      return;
    }
    if (u.pathname.endsWith("/supplier-confirmations") && method === "POST") {
      const payload = req.postDataJSON();
      assert.equal(payload.action, "prepare", "No send/markSent/transfer is allowed");
      assert.equal(payload.result.productUrl, sourceUrl);
      confirmationPrepare++;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        offerId: null,
        record: {
          status: "PREPARED",
          responseNote: "",
          writtenQuote: "",
          proposals: [],
          supplierPriceConfirmed: false,
          quantityConfirmed: false,
          moqConfirmed: false,
          variantsConfirmed: false,
          orderTermsConfirmed: false,
          additionalConfirmationRequired: false,
        },
        communication: {
          sourceMessage: "Poštovani, možete li potvrditi ponudu za 1.000 komada i cenu za ovu količinu?",
          targetLanguage: "EN",
          translatedMessage: "",
          translationCurrent: false,
          translationReused: false,
          supplierReplyOriginal: "",
          supplierReplyTranslation: "",
          replyTranslationCurrent: false,
          followUpQuestions: [],
        },
      }) });
      return;
    }
    if (u.pathname === "/api/fx/latest") {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }
    forbiddenRequests.push({method, url:req.url()});
    await route.abort("blockedbyclient");
  });

  try {
    const backgroundResponse = page.waitForResponse(
      r => r.url().endsWith("/supplier-search/url-preview") && r.status() === 422,
      { timeout: 15000 },
    );
    await page.goto(`http://127.0.0.1:${port}/isolated?savedMoq=${savedMoq}`, { waitUntil:"domcontentloaded" });
    const card = page.locator("article.search-result-card").filter({has:page.locator(`a.supplier-source-link[href*="${dilicinSku}"]`)});
    await card.waitFor({ state:"visible", timeout:20000 });
    await backgroundResponse;

    assert.equal(await card.count(),1,"Specific Dilicin SKU must remain visible");
    const before = await card.innerText();
    assert.match(before, new RegExp(`\\b${savedMoq.toLocaleString("sr-RS")}\\b`), "Initial cached MOQ must be visible");
    assert.doesNotMatch(before, /Prioritet za upit 1/, "Unverified cache must not receive price-priority 1");
    assert.doesNotMatch(before, /\+5/, "Unverified price must not earn +5");
    assert.match(before, /0,18/, "Conditional US$0.18 must remain visible");

    await card.getByRole("button",{name:"Proveri MOQ na originalnoj stranici"}).click();
    await page.waitForFunction((sku) => {
      const c = [...document.querySelectorAll("article.search-result-card")]
        .find(node => node.querySelector(`a.supplier-source-link[href*="${sku}"]`));
      return c?.textContent?.includes("Vreme odgovora servisa:");
    },dilicinSku,{timeout:15000});

    const after = await card.innerText();
    assert.match(after,/Minimum prodavca iz oglasa: 1\.200 kom\./, "Seller listing MOQ 1200 must be shown");
    assert.match(after,/Traženo: 1\.000 kom\./, "Buyer quantity must stay 1000");
    assert.match(after,/0,18/, "Advertised USD 0.18 must still be displayed");
    assert.match(after,/nije potvrđena za 1\.000/, "Price for buyer quantity must be unconfirmed");
    assert.doesNotMatch(after,/Prioritet za upit 1/, "No false price-based priority 1");
    assert.doesNotMatch(after,/\+5/, "No false +5");
    if (savedMoq === 200) assert.match(after,/Neslaganje MOQ-a: sačuvana pretraga 200 kom\., pročitana stranica 1200 kom\./);
    if (savedMoq === 1200) assert.match(after,/MOQ iz sačuvane pretrage i pročitanog izvora je isti\./);

    // Opening the regular inquiry can only hit the explicitly mocked endpoint,
    // which must receive action:prepare. No supplier emails or real app writes.
    await card.getByRole("button",{name:"Zatraži potvrdu",exact:true}).click();
    await page.waitForFunction(() => {
      const el=document.querySelector("section.supplier-confirmation-panel textarea");
      return Boolean(el?.value?.includes("1.000 komada"));
    });
    assert.equal(confirmationPrepare,1,"One local mock prepare only");
    assert.equal(manualPreview,1,"One deliberate exact-URL source check");
    assert.deepEqual(forbiddenRequests,[],"No unmocked network requests");
    assert.deepEqual(pageErrors,[],"No browser JavaScript exceptions");

    const overflow = await page.evaluate(() => ({
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    }));
    assert(overflow.scrollWidth <= overflow.viewportWidth + 1,`Horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
    report.push({savedMoq,width,status:"PASS",backgroundPreview,manualPreview,confirmationPrepare,overflow});
  } catch (e) {
    console.error("UI_ACCEPTANCE_FAIL",JSON.stringify({savedMoq,width,error:String(e),pageErrors,forbiddenRequests}));
    throw e;
  } finally {
    await context.close();
  }
}
try {
  for(const savedMoq of [200,1200]) {
    for(const width of [390,1280]) {
      await exercise({savedMoq,width});
    }
  }
  console.log("UI_ACCEPTANCE_PASS",JSON.stringify({
    test:"JAKOV360-187-REAL-REACT-CHROMIUM",
    cases:report, credentials:false, database:false, outboundMessages:0,
    staging:false, testMode:"browser with synthetic data and mocked endpoints",
  }));
} finally {
  await browser.close();
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
