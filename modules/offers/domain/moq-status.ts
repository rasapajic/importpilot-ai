export const MoqStatuses = {
  UNKNOWN: "UNKNOWN",
  OK: "OK",
  BLOCKING: "BLOCKING",
} as const;

export type MoqStatusValue = (typeof MoqStatuses)[keyof typeof MoqStatuses];

export function getMoqStatus(input: {
  projectQuantity: number;
  moq: number | null;
}) {
  if (input.moq === null) {
    return {
      status: MoqStatuses.UNKNOWN,
      label: "MOQ nije naveden",
      message: "Minimalna količina dobavljača nije poznata.",
    };
  }
  if (input.projectQuantity >= input.moq) {
    return {
      status: MoqStatuses.OK,
      label: "MOQ zadovoljen",
      message: `Tražite ${input.projectQuantity} kom, dobavljač traži minimum ${input.moq} kom.`,
    };
  }
  return {
    status: MoqStatuses.BLOCKING,
    label: "MOQ nije zadovoljen",
    message: `Tražite ${input.projectQuantity} kom, dobavljač traži minimum ${input.moq} kom.`,
  };
}
