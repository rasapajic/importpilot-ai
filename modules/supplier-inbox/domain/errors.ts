export class SupplierInboxNotFoundError extends Error {
  constructor() {
    super("Supplier inbox thread was not found.");
  }
}

export class ApprovalReuseError extends Error {
  constructor() {
    super("The original RFQ approval does not authorize this follow-up.");
  }
}

export class FollowUpNotApprovedError extends Error {
  constructor() {
    super("The follow-up needs a fresh approval of its exact content.");
  }
}

export class QuoteReviewError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AttachmentDownloadBlockedError extends Error {
  constructor() {
    super("Attachment download is blocked until a malware scan is clean.");
  }
}

export class SupplierInboxStateError extends Error {
  constructor(message: string) {
    super(message);
  }
}
