import { describe, expect, it } from "vitest";

import {
  readApiJson,
  UnexpectedApiResponseError,
} from "../../lib/http/api-response";

describe("readApiJson", () => {
  it("parses a normal JSON API response", async () => {
    const response = new Response(JSON.stringify({ projectId: "project-1" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    await expect(readApiJson<{ projectId: string }>(response, "fallback"))
      .resolves.toEqual({ projectId: "project-1" });
  });

  it("replaces an HTML error page with the localized fallback message", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Error</body></html>", {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    await expect(readApiJson(response, "Pretraga nije kreirana. Pokušajte ponovo."))
      .rejects.toMatchObject({
        name: "UnexpectedApiResponseError",
        message: "Pretraga nije kreirana. Pokušajte ponovo.",
        status: 500,
        contentType: "text/html; charset=utf-8",
      });
  });

  it("rejects an empty API response without exposing a parser exception", async () => {
    const response = new Response("", { status: 502 });

    await expect(readApiJson(response, "Server nije odgovorio."))
      .rejects.toBeInstanceOf(UnexpectedApiResponseError);
  });
});
