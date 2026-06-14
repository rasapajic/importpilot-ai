import { describe, expect, it } from "vitest";

import { translateBusinessText } from "../../modules/i18n/translations";

describe("step 20 localization", () => {
  it("localizes MOQ and supplier risk labels in EN/DE/SR", () => {
    expect(translateBusinessText("MOQ nije zadovoljen", "en")).toBe("MOQ not satisfied");
    expect(translateBusinessText("MOQ zadovoljen", "de")).toBe("MOQ erfüllt");
    expect(translateBusinessText("MOQ nije naveden", "sr")).toBe("MOQ nije naveden");
    expect(translateBusinessText("Visok rizik", "en")).toBe("High risk");
    expect(translateBusinessText("Rizik dobavljača", "de")).toBe("Lieferantenrisiko");
  });

  it("localizes dynamic MOQ warning text", () => {
    expect(translateBusinessText("Tražite 100 kom, dobavljač traži minimum 3000 kom.", "en"))
      .toBe("You need 100 units, the supplier requires a minimum of 3000 units.");
    expect(translateBusinessText("Tražite 100 kom, dobavljač traži minimum 3000 kom.", "de"))
      .toBe("Sie suchen 100 Stk., der Lieferant verlangt mindestens 3000 Stk.");
  });
});
