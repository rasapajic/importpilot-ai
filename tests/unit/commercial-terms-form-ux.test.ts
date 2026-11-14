import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = readFileSync(join(root, "components/offers/commercial-terms-form.tsx"), "utf8");
const style = readFileSync(join(root, "app/commercial-terms-form.css"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

describe("JAKOV360 confirmed commercial terms UI only", () => {
  it("leaves an unknown currency empty instead of visually suggesting EUR", () => {
    expect(source).toContain('defaultValue={currency ?? ""}');
    expect(source).toContain("placeholder={text.currencyPlaceholder}");
    expect(source).not.toContain('placeholder="EUR"');
    expect(source).toContain("currencyHint");
    expect(source).toContain("ISO kod (USD, EUR...)");
    expect(source).toContain("ISO-Code (USD, EUR...)");
    expect(source).toContain("ISO code (USD, EUR...)");
  });

  it("preserves explicit confirmation and the existing API contract", () => {
    expect(source).toContain('defaultValue={unitPrice ?? ""}');
    expect(source).toContain('name="unitPrice"');
    expect(source).toContain('name="currency"');
    expect(source).toContain('name="incoterm"');
    expect(source).toContain('name="deliveryTimeDays"');
    expect(source).toContain('pattern="[A-Za-z]{3}"');
    expect(source).toContain('type="submit"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('unitPrice: form.get("unitPrice")');
    expect(source).toContain('currency: form.get("currency")');
    expect(source).toContain('incoterm: form.get("incoterm")');
    expect(source).toContain('deliveryTimeDays: form.get("deliveryTimeDays")');
    expect(source).not.toContain("onChange={(event) => submit");
  });

  it("uses a scoped desktop grid and a single-column 390px mobile layout", () => {
    expect(source).toContain('className="offer-form commercial-terms-form"');
    expect(source).toContain('className="commercial-terms-wide"');
    expect(layout).toContain('import "./commercial-terms-form.css";');
    expect(style).toContain(".commercial-terms-form {");
    expect(style).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(style).toContain(".commercial-terms-form > label > input");
    expect(style).toContain("box-sizing: border-box;");
    expect(style).toContain("min-width: 0;");
    expect(style).toContain("width: 100%;");
    expect(style).toContain("@media (max-width: 760px)");
    expect(style).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(style).not.toContain("body {");
  });

  it("keeps form errors and the confirmation button on full-width rows", () => {
    expect(source).toContain('className="form-error commercial-terms-wide"');
    expect(source).toContain('className="commercial-terms-wide" disabled={pending}');
    expect(style).toContain("grid-column: 1 / -1;");
    expect(style).toContain("justify-self: stretch;");
  });
});
