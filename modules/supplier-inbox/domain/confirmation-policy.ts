const BLOCKING_FLAGS = new Set(["MISSING", "CONTRADICTION", "SPEC_MISMATCH", "LOW_CONFIDENCE"]);

export function quoteConfirmationDecision(input: {
  fields: Array<{ fieldKey: string; flag: string; reviewStatus: string }>;
  senderTrust: "ALIGNED" | "UNVERIFIED" | null;
  unverifiedSenderAcknowledged: boolean;
}): { allowed: boolean; reason: string | null } {
  if (input.fields.length === 0) {
    return { allowed: false, reason: "There is no parsed quote to review." };
  }
  if (input.fields.some((field) => BLOCKING_FLAGS.has(field.flag))) {
    return {
      allowed: false,
      reason: "Conflicting, missing, or low-confidence fields need clarification before the written quote can be confirmed.",
    };
  }
  const instruction = input.fields.find((field) => field.fieldKey === "untrusted_instruction");
  if (instruction && instruction.reviewStatus !== "REJECTED") {
    return { allowed: false, reason: "Instructions inside the supplier message must be rejected before confirmation." };
  }
  if (input.fields.some((field) => field.fieldKey !== "untrusted_instruction" && field.reviewStatus !== "ACCEPTED")) {
    return { allowed: false, reason: "Every parsed field stays unreviewed until a person accepts it." };
  }
  if (input.senderTrust === "UNVERIFIED" && !input.unverifiedSenderAcknowledged) {
    return { allowed: false, reason: "The sender is unverified. Confirm stays unavailable until a person acknowledges that sender." };
  }
  return { allowed: true, reason: null };
}
