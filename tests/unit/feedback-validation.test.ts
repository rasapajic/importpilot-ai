import { describe, expect, it } from "vitest";

import {
  projectCompletionSchema,
  projectOutcomeSchema,
  recommendationFeedbackSchema,
} from "../../modules/feedback/domain/validation";

describe("feedback validation", () => {
  it("requires final price and currency together", () => {
    expect(projectOutcomeSchema.safeParse({ outcome: "BOUGHT", finalPrice: 10 }).success).toBe(false);
    expect(projectOutcomeSchema.safeParse({ outcome: "BOUGHT", finalPrice: 10, finalCurrency: "eur" }).success).toBe(true);
  });

  it("accepts append-only feedback and completion values", () => {
    expect(recommendationFeedbackSchema.safeParse({ vote: "HELPFUL", comment: "Useful" }).success).toBe(true);
    expect(projectCompletionSchema.safeParse({ status: "ARCHIVED" }).success).toBe(true);
  });

  it("rejects unknown outcome and feedback values", () => {
    expect(projectOutcomeSchema.safeParse({ outcome: "UNKNOWN" }).success).toBe(false);
    expect(recommendationFeedbackSchema.safeParse({ vote: "MAYBE" }).success).toBe(false);
  });
});
