import { resolve4 } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_HEAD_BYTES = 256_000;
const SOURCE_TIMEOUT_MS = 2_800;
const SOURCE_IMAGE_CACHE_TTL_MS = 15 * 60 * 1_000;

const NON_PRODUCT_IMAGE =
  /(?:^|[\/_.-])(?:logo|favicon|icon|sprite|avatar|flag|star|badge|qr(?:code)?)(?:[\/_.-]|$)/i;

const cachedImages = new Map<string, { expires: number; value: Promise<string | null> }>();

/**
 * A web-search result is a lead, not permission to request arbitrary URLs.
 * Support exact public product pages only; reject catalog PDFs and category
 * listings. This function never follows a redirect or reads image bytes.
 */
export function eligibleExactProductPage(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" || url.port || url.username || url.password ||
      isIP(host) !== 0 || host.length > 253 || !host.includes(".") ||
      !/^[a-z0-9.-]+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)
    ) return null;
    if (
      !/\/(?:product|products|product-detail)\/[^/]+/i.test(url.pathname) &&
      !/^\/offer\/\d+\.html?$/i.test(url.pathname)
    ) return null;
    if (/\.(?:pdf|xml|json|zip|exe)(?:$|\/)/i.test(url.pathname)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function isPublicIpv4ForSource(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || (b === 168))) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 255 && b === 255 && c === 255)
  );
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number(code))));
}

function attribute(tag: string, key: string) {
  const match = tag.match(new RegExp(
    "(?:^|\\s)" + key + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i",
  ));
  return match ? decodeEntities(match[1] ?? match[2] ?? "").trim() : null;
}

function metaValue(html: string, name: string) {
  for (const match of html.matchAll(/<meta\b[^>]{1,3000}>/gi)) {
    const tag = match[0];
    const actual = attribute(tag, "property") ?? attribute(tag, "name");
    if (actual?.toLowerCase() === name.toLowerCase()) {
      return attribute(tag, "content");
    }
  }
  return null;
}

const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "factory", "wholesale", "china",
  "supplier", "suppliers", "bulk", "shop", "store", "online", "products",
  "product", "manufacturer", "manufacturers", "cheap", "sale", "buy", "best",
]);

function titleTokens(value: string) {
  return new Set(
    value.toLowerCase().split(/[^a-z0-9]+/).filter((part) =>
      part.length >= 3 && !TITLE_STOPWORDS.has(part)),
  );
}

/**
 * Accept only image metadata attached to the exact, title-matching public
 * product page. No guesses from a site logo, category page or other seller.
 */
export function imageFromExactSourcePage(
  html: string,
  productUrl: string,
  expectedTitle: string,
) {
  const source = eligibleExactProductPage(productUrl);
  if (!source) return null;
  const titleMatch = html.match(/<title\b[^>]*>([^<]{1,600})<\/title>/i);
  const pageTitle = metaValue(html, "og:title") ?? (
    titleMatch ? decodeEntities(titleMatch[1]) : null
  );
  if (!pageTitle) return null;
  const expected = titleTokens(expectedTitle);
  const onPage = titleTokens(pageTitle);
  const overlap = [...expected].filter((token) => onPage.has(token)).length;
  if (overlap < 2) return null;

  for (const name of ["og:image:secure_url", "og:image", "twitter:image"]) {
    const raw = metaValue(html, name);
    if (!raw) continue;
    try {
      const imageUrl = new URL(raw, source);
      if (
        imageUrl.protocol !== "https:" || imageUrl.username ||
        imageUrl.password || imageUrl.port || isIP(imageUrl.hostname) !== 0 ||
        !imageUrl.hostname.includes(".") ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(imageUrl.hostname) ||
        imageUrl.href.length > 2_000 ||
        NON_PRODUCT_IMAGE.test(imageUrl.pathname) ||
        imageUrl.href === source.href
      ) continue;
      imageUrl.hash = "";
      return imageUrl.href;
    } catch {
      continue;
    }
  }
  return null;
}

function readPinnedPublicPage(url: URL, ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    let finished = false;
    let activeResponse: import("node:http").IncomingMessage | null = null;
    const finish = (value: string | null) => {
      if (finished) return;
      finished = true;
      resolve(value);
      activeResponse?.destroy();
    };
    const req = httpsRequest(url, {
      method: "GET",
      timeout: SOURCE_TIMEOUT_MS,
      headers: {
        accept: "text/html",
        "user-agent": "JAKOV360/1.0 (supplier image metadata; exact public page)",
      },
      // Pin the validated DNS answer to prevent a second, unsafe lookup.
      // Node HTTPS still validates the certificate against the source hostname.
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
    }, (response) => {
      activeResponse = response;
      const type = String(response.headers["content-type"] ?? "").toLowerCase();
      if (response.statusCode !== 200 ||
          !(type.includes("text/html") || type.includes("application/xhtml+xml"))) {
        finish(null); return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        if (finished) return;
        length += chunk.length;
        if (length > MAX_HEAD_BYTES) { finish(null); return; }
        chunks.push(chunk);
        const tail = Buffer.concat(chunks).toString("utf8");
        if (/<\/head\s*>/i.test(tail)) finish(tail);
      });
      response.on("end", () => {
        if (!finished) finish(Buffer.concat(chunks).toString("utf8"));
      });
      response.on("error", () => finish(null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => finish(null));
    req.end();
  });
}

export type ImageRecoveryDependencies = {
  lookup4?: (hostname: string) => Promise<string[]>;
  readPage?: (url: URL, validatedPublicIpv4: string) => Promise<string | null>;
};

export async function recoverExactSourceProductImage(
  productUrl: string,
  expectedTitle: string,
  deps: ImageRecoveryDependencies = {},
): Promise<string | null> {
  const url = eligibleExactProductPage(productUrl);
  if (!url) return null;
  try {
    // DNS must resolve exclusively to routable IPv4 answers. There are no
    // redirects and the HTTPS request is pinned to the validated address.
    const lookup4 = deps.lookup4 ?? resolve4;
    const addresses = await Promise.race([
      lookup4(url.hostname),
      new Promise<string[]>((_, reject) =>
        setTimeout(() => reject(new Error("DNS timeout")), SOURCE_TIMEOUT_MS)),
    ]);
    if (addresses.length === 0 || addresses.some((ip) => !isPublicIpv4ForSource(ip))) {
      return null;
    }
    const html = await (deps.readPage ?? readPinnedPublicPage)(url, addresses[0]);
    return html ? imageFromExactSourcePage(html, url.href, expectedTitle) : null;
  } catch {
    return null;
  }
}

export function recoverCachedExactSourceImage(
  productUrl: string,
  expectedTitle: string,
) {
  const key = productUrl + "\u0000" + expectedTitle;
  const now = Date.now();
  const cached = cachedImages.get(key);
  if (cached && cached.expires > now) return cached.value;
  if (cachedImages.size >= 200) cachedImages.clear();
  const value = recoverExactSourceProductImage(productUrl, expectedTitle);
  cachedImages.set(key, {
    expires: now + SOURCE_IMAGE_CACHE_TTL_MS,
    value,
  });
  return value;
}
