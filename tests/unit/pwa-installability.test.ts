import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("JAKOV360 PWA installability", () => {
  const manifest = source("app/manifest.ts");
  const layout = source("app/layout.tsx");
  const install = source("components/pwa/pwa-install-button.tsx");
  const css = source("app/globals.css");

  it("publishes a standalone manifest with required Chromium icon sizes", () => {
    expect(manifest).toContain('name: "JAKOV360"');
    expect(manifest).toContain('short_name: "JAKOV360"');
    expect(manifest).toContain('start_url: "/"');
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('sizes: "192x192"');
    expect(manifest).toContain('sizes: "512x512"');
  });

  it("advertises the manifest, icons and mobile app metadata", () => {
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain('applicationName: "JAKOV360"');
    expect(layout).toContain('themeColor: "#0b5f41"');
    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain("<PwaInstallButton />");
  });

  it("shows a localized install action only when Chromium declares the app installable", () => {
    expect(install).toContain("beforeinstallprompt");
    expect(install).toContain("event.preventDefault()");
    expect(install).toContain("appinstalled");
    expect(install).toContain('"Instaliraj aplikaciju"');
  });

  it("keeps key mobile controls phone-friendly", () => {
    expect(css).toContain(".pwa-install-button");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("font-size: 16px");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});
