import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const stagingBlueprint = readFileSync(
  join(process.cwd(), "render.staging.yaml"),
  "utf8",
);

describe("Render staging exact-page enrichment wiring", () => {
  it("reuses the deployed URL import provider for finalist enrichment", () => {
    expect(stagingBlueprint).toContain("key: URL_IMPORT_PROVIDER_URL");
    expect(stagingBlueprint).toContain(
      "value: https://importpilot-url-import-provider.onrender.com/preview",
    );
    expect(stagingBlueprint).toContain("key: URL_IMPORT_PROVIDER_TOKEN");
    expect(stagingBlueprint).toContain("name: importpilot-url-import-provider");
    expect(stagingBlueprint).toContain("envVarKey: URL_IMPORT_PROVIDER_TOKEN");
  });
});
