import { describe, expect, it } from "vitest";

import {
  isStagingSupplierMailRecipient,
  supplierMailApprovalHash,
} from "../../modules/negotiation/domain/supplier-mail-approval";

const draft = {
  organizationId: "org-a",
  confirmationId: "confirmation-abc",
  mailboxConnectionId: "mailbox-abc",
  from: "Buyer@Example.com",
  to: "supplier@example.cn",
  subject: "TEST Zlin 2025",
  body: "1,000 pieces\nModel Zlin 2025",
};

describe("reviewed supplier mail approval", () => {
  it("locks approval to all important fields, including the tenant", () => {
    const first = supplierMailApprovalHash(draft);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(supplierMailApprovalHash({ ...draft, from: "buyer@example.com" })).toBe(first);
    for (const change of [
      { body: draft.body + "\nPlease pay extra" },
      { subject: "Different subject" },
      { to: "elsewhere@example.cn" },
      { mailboxConnectionId: "another-mailbox" },
      { confirmationId: "another-confirmation" },
      { organizationId: "other-tenant" },
    ]) {
      expect(supplierMailApprovalHash({ ...draft, ...change })).not.toBe(first);
    }
  });

  it("limits actual staging Gmail mail to explicitly configured test recipients", () => {
    const env = {
      JAKOV360_GMAIL_TEST_RECIPIENTS: "other@example.test, test-recipient@example.test",
    } as NodeJS.ProcessEnv;
    expect(isStagingSupplierMailRecipient("TEST-RECIPIENT@EXAMPLE.TEST", env)).toBe(true);
    expect(isStagingSupplierMailRecipient("supplier@example.cn", env)).toBe(false);
    expect(isStagingSupplierMailRecipient("a@example.test\nBcc: other@example.cn", env)).toBe(false);
    expect(isStagingSupplierMailRecipient("test-recipient@example.test", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});
