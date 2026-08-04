import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { translateText } from "../../modules/i18n/translations";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("application-controlled locale rendering", () => {
  it("does not translate already rendered DOM nodes", () => {
    const provider = source("components/i18n/i18n-provider.tsx");

    expect(provider).not.toContain("MutationObserver");
    expect(provider).not.toContain("createTreeWalker");
    expect(provider).not.toContain("NodeFilter.SHOW_TEXT");
    expect(provider).toContain("window.location.reload()");
    expect(provider).toContain("LOCALE_COOKIE");
  });

  it("prevents browser translation from competing with the app locale", () => {
    const layout = source("app/layout.tsx");

    expect(layout).toContain('translate="no"');
    expect(layout).toContain('className="notranslate"');
    expect(layout).toContain('google: "notranslate"');
  });

  it("renders public and authentication pages from the locale cookie", () => {
    for (const path of [
      "app/page.tsx",
      "app/(auth)/login/page.tsx",
      "app/(auth)/register/page.tsx",
    ]) {
      const page = source(path);
      expect(page).toContain("getServerLocale");
      expect(page).toContain("translateText");
    }

    const authForm = source("components/auth/auth-form.tsx");
    expect(authForm).toContain("useI18n");
    expect(authForm).toContain("authCopy[locale]");
  });

  it("returns complete dashboard headings in each selected locale", () => {
    expect(translateText("Uporedite ponude i kupujte sigurnije", "sr"))
      .toBe("Uporedite ponude i kupujte sigurnije");
    expect(translateText("Uporedite ponude i kupujte sigurnije", "de"))
      .toBe("Angebote vergleichen und sicherer einkaufen");
    expect(translateText("Uporedite ponude i kupujte sigurnije", "en"))
      .toBe("Compare offers and buy with confidence");

    expect(translateText("Vaše aktivne pretrage", "sr"))
      .toBe("Vaše aktivne pretrage");
    expect(translateText("Vaše aktivne pretrage", "de"))
      .toBe("Ihre aktiven Suchen");
    expect(translateText("Vaše aktivne pretrage", "en"))
      .toBe("Your active searches");
  });
});
