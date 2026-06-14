import { describe, expect, it } from "vitest";

import { isDemoProjectName } from "../../modules/projects/domain/project-access";

describe("demo project deletion guard", () => {
  it("recognizes only explicitly prefixed demo projects", () => {
    expect(isDemoProjectName("[DEMO] Electric kettles")).toBe(true);
    expect(isDemoProjectName("Customer demo project")).toBe(false);
    expect(isDemoProjectName("Production project")).toBe(false);
  });
});
