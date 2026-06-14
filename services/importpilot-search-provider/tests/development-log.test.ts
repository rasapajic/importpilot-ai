import { describe, expect, it } from "vitest";

import { createDevelopmentLogger } from "../src/development-log.js";

describe("development logger", () => {
  it("writes structured logs only in development", () => {
    const messages: string[] = [];
    const logger = createDevelopmentLogger("development", (message) => messages.push(message));

    logger("search_request_received", {
      productQuery: "PTZ camera",
      quantity: 100,
      targetCountry: "RS",
    });

    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0] ?? "{}")).toEqual({
      service: "importpilot-search-provider",
      event: "search_request_received",
      productQuery: "PTZ camera",
      quantity: 100,
      targetCountry: "RS",
    });
  });

  it("stays silent outside development", () => {
    const messages: string[] = [];
    const logger = createDevelopmentLogger("production", (message) => messages.push(message));

    logger("search_request_received", { token: "must-not-be-written" });

    expect(messages).toEqual([]);
  });
});
