export const MILESTONE_B_COST_WRITE_REASON = "MILESTONE_B_DOES_NOT_WRITE_COST";

/**
 * Milestone B never writes supplier-parsed amounts into monetary calculations.
 * A later milestone may apply only human-accepted, non-conflicting fields.
 */
export function costEngineWritePlan(): { write: false; reason: typeof MILESTONE_B_COST_WRITE_REASON } {
  return { write: false, reason: MILESTONE_B_COST_WRITE_REASON };
}

export function incotermSupplierClaim(term: string, namedPlace: string | null) {
  return {
    term,
    namedPlace,
    supplierClaim: true,
    officialDutyRate: null,
    zeroesDutyLine: false,
    verified: false,
  };
}
