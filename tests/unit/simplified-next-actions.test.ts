import { describe, expect, it } from "vitest";

import { getSimplifiedNextActions } from "../../modules/decisions/application/simplified-next-actions";

describe("simplified next actions", () => {
  it("does not surface 2.0 purchase actions after BUY", () => {
    expect(getSimplifiedNextActions("READY_TO_BUY")).toEqual([]);
  });

  it("does not surface the 2.0 negotiation assistant after NEGOTIATE", () => {
    expect(getSimplifiedNextActions("NEGOTIATE_FIRST")).toEqual([]);
  });

  it("keeps final SKIP free of recovery-panel actions", () => {
    expect(getSimplifiedNextActions("DO_NOT_BUY")).toEqual([]);
  });

  it("keeps WATCH focused on finding better offers", () => {
    expect(getSimplifiedNextActions("NEED_MORE_OFFERS")).toEqual(["Pronađi bolje ponude"]);
  });
});
