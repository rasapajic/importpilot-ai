/**
 * Browser verification of real TAJA component SSR + exact app CSS.
 * Only file:// fixture pages are opened. No Render, supplier GET, or login.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), "test-results", "taja-199-mobile");
mkdirSync(outDir, { recursive: true });
const cases = [
  { name: "sr-catalog-one-source", sources: 1, marker: "jedan izvor" },
  { name: "sr-two-public-listings", sources: 2, marker: "dve objave" },
  { name: "sr-teaser-only", sources: 0, marker: "Prikazana cena" },
  { name: "de-catalog-one-source", sources: 1, marker: "eine Quelle" },
  { name: "en-catalog-one-source", sources: 1, marker: "one source" },
];
const sizes = [
  { id: "mobile", width: 390, height: 844 },
  { id: "desktop", width: 1440, height: 900 },
];
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const example of cases) {
    for (const size of sizes) {
      const page = await browser.newPage({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      try {
        const url = pathToFileURL(join(outDir, example.name + ".html")).href;
        await page.goto(url, { waitUntil: "load" });
        await page.locator(".taja-preview-summary").waitFor();
        const current = await page.evaluate(() => {
          const section = document.querySelector(".taja-preview-summary");
          const sources = document.querySelector(".taja-preview-public-price-sources");
          const anchors = Array.from(document.querySelectorAll(".taja-preview-public-price-sources a"));
          const width = document.documentElement.clientWidth;
          const overflows = Array.from(document.querySelectorAll(
            "body,main,.taja-preview-summary,.taja-preview-summary-grid,dl > div,.taja-preview-public-price-sources,.taja-preview-public-price-sources a",
          )).filter(node => {
            const bounds = node.getBoundingClientRect();
            return bounds.right > width + 1 || bounds.left < -1;
          }).map(node => ({
            selector: node.tagName.toLowerCase() + (node.className ? "." + String(node.className).split(" ").join(".") : ""),
            right: Math.round(node.getBoundingClientRect().right),
            left: Math.round(node.getBoundingClientRect().left),
          }));
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: width,
            bodyWidth: document.body.scrollWidth,
            sectionWidth: Math.round(section?.getBoundingClientRect().width ?? -1),
            sourceCount: anchors.length,
            sourceLinksWithinViewport: anchors.every(a => {
              const x = a.getBoundingClientRect();
              return x.left >= -1 && x.right <= width + 1;
            }),
            sourceContainerPresent: Boolean(sources),
            overflows,
            text: section?.textContent ?? "",
          };
        });

        const issue = [];
        if (current.documentWidth > size.width + 1 || current.bodyWidth > size.width + 1)
          issue.push("horizontal scroll: " + current.documentWidth + "/" + current.bodyWidth);
        if (current.overflows.length > 0)
          issue.push("overflowing elements: " + JSON.stringify(current.overflows.slice(0, 8)));
        if (current.sourceCount !== example.sources)
          issue.push("source link count " + current.sourceCount + " expected " + example.sources);
        if (!current.sourceLinksWithinViewport)
          issue.push("a source link extends beyond the viewport");
        if (!current.text.toLowerCase().includes(example.marker.toLowerCase()))
          issue.push("missing expected localized text marker");
        if (!current.text.includes("1200"))
          issue.push("missing primary MOQ 1200");
        if (!current.text.includes("0.5 USD"))
          issue.push("missing original public teaser, kept separate from range");
        if (current.text.includes("Pumpa") || current.text.includes("Mlaznice"))
          issue.push("wrong product category");

        const name = example.name + "-" + size.id;
        await page.screenshot({ path: join(outDir, name + "-viewport.png"), fullPage: false });
        await page.screenshot({ path: join(outDir, name + "-full.png"), fullPage: true });
        results.push({
          name, width: size.width, height: size.height,
          horizontalScroll: current.documentWidth > size.width,
          sourceLinkCount: current.sourceCount,
          sectionWidth: current.sectionWidth,
          passed: issue.length === 0,
          issues: issue,
        });
        console.info(JSON.stringify(results.at(-1)));
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
const passed = results.every(item => item.passed);
const report = { passed, scenarios: results.length, checks: results };
writeFileSync(join(outDir, "browser-layout-report.json"), JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
