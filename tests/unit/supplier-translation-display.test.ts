import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  inquiryMessageForSending,
  inquiryTranslationFields,
} from "../../modules/negotiation/domain/supplier-message";

const panelSource = readFileSync(
  join(process.cwd(), "components/search/supplier-confirmation-panel.tsx"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/api/projects/[projectId]/supplier-confirmations/route.ts"),
  "utf8",
);

const english = "Zlin 2025 Retro Round, X5000, ISO 9001, Quantity: 1,000 pieces.";
const chinese = "Zlin 2025 Retro Round, X5000, ISO 9001, 数量：1,000件。";
const combined = `${english}\n---\n${chinese}`;
const serbian = "Zlin 2025 Retro Round, X5000, ISO 9001, Količina: 1.000 komada.";

describe("inquiry translation display", () => {
  it("hides a saved English translation when EN+ZH is selected and does not send it", () => {
    const input = {
      selectedLanguage: "EN_ZH" as const,
      savedLanguage: "EN" as const,
      translatedMessage: english,
      sourceIsCurrent: true,
      translationCurrent: true,
    };
    expect(inquiryTranslationFields(input)).toEqual({ kind: "hidden" });
    expect(inquiryMessageForSending({ ...input, serbianFallback: serbian })).toBe(serbian);
    expect(inquiryTranslationFields({ ...input, selectedLanguage: "EN" })).toEqual({
      kind: "single",
      language: "EN",
      text: english,
    });
    expect(inquiryMessageForSending({
      ...input,
      selectedLanguage: "EN",
      serbianFallback: serbian,
    })).toBe(english);
  });

  it("shows a complete EN+ZH translation as two parts and refuses an incomplete one", () => {
    const current = {
      selectedLanguage: "EN_ZH" as const,
      savedLanguage: "EN_ZH" as const,
      translatedMessage: combined,
      sourceIsCurrent: true,
      translationCurrent: true,
    };
    expect(inquiryTranslationFields(current)).toEqual({
      kind: "bilingual",
      english,
      chinese,
    });
    expect(inquiryMessageForSending({ ...current, serbianFallback: serbian })).toBe(combined);
    expect(inquiryTranslationFields({ ...current, translatedMessage: english }).kind).toBe("hidden");
    expect(inquiryMessageForSending({
      ...current,
      translatedMessage: `${english}\n---\n`,
      serbianFallback: serbian,
    })).toBe(serbian);
  });

  it("does not send a translation after the Serbian source changes", () => {
    const input = {
      selectedLanguage: "ZH" as const,
      savedLanguage: "ZH" as const,
      translatedMessage: chinese,
      sourceIsCurrent: false,
      translationCurrent: false,
    };
    expect(inquiryTranslationFields(input)).toMatchObject({ kind: "single", language: "ZH" });
    expect(inquiryMessageForSending({ ...input, serbianFallback: serbian })).toBe(serbian);
  });
});

describe("supplier translation panel", () => {
  it("keeps one Serbian editor and shows only the selected translation fields", () => {
    expect(panelSource.match(/value=\{sourceMessage\}/g)).toHaveLength(1);
    expect(panelSource).toContain('summary>{text.prepareSection}');
    expect(panelSource).toContain('summary>{text.translationSection}');
    expect(panelSource).toContain("supplier-translation-fields");
    expect(panelSource).toContain("inquiryTranslationFields");
    expect(panelSource).toContain("inquiryMessageForSending");
    expect(panelSource).toContain("onChange={(event) => setTargetLanguage(event.target.value as MessageLanguage)}");
    const translationSection = panelSource.slice(
      panelSource.indexOf("{text.translationSection}"),
      panelSource.indexOf("{text.sendSection}"),
    );
    expect(translationSection).not.toContain("{text.original}");
    expect(translationSection).not.toContain("value={sourceMessage}");
    expect(translationSection).toContain("{text.languageEn}");
    expect(translationSection).toContain("{text.languageZh}");
    expect(translationSection).toContain('action: "translateInquiry"');
    expect(routeSource).toContain("Prevod nije završen jer je isteklo vreme. Pokušajte ponovo.");
    expect(routeSource).toContain("Prevod nije uspeo. Pokušajte ponovo.");
    expect(panelSource).toContain('action: "translateInquiry"');
  });
});
