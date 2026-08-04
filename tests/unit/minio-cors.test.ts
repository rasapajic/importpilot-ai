import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const corsXml = readFileSync(
  join(process.cwd(), "docker/minio-cors.xml"),
  "utf8",
);

describe("local MinIO CORS", () => {
  it("allows browser uploads from supported local app ports", () => {
    for (const origin of [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
    ]) {
      expect(corsXml).toContain(`<AllowedOrigin>${origin}</AllowedOrigin>`);
    }
  });

  it("allows the direct upload methods and headers", () => {
    expect(corsXml).toContain("<AllowedMethod>PUT</AllowedMethod>");
    expect(corsXml).toContain("<AllowedMethod>HEAD</AllowedMethod>");
    expect(corsXml).toContain("<AllowedHeader>*</AllowedHeader>");
  });
});
