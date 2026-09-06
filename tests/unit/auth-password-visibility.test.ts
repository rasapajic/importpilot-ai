import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const authFormSource = readFileSync(
  join(process.cwd(), "components/auth/auth-form.tsx"),
  "utf8",
);
const layoutSource = readFileSync(
  join(process.cwd(), "app/layout.tsx"),
  "utf8",
);

describe("auth password visibility", () => {
  it("lets users toggle between masked and visible password text", () => {
    expect(authFormSource).toContain("const [showPassword, setShowPassword] = useState(false)");
    expect(authFormSource).toContain('type={showPassword ? "text" : "password"}');
    expect(authFormSource).toContain("setShowPassword((current) => !current)");
    expect(authFormSource).toContain('type="button"');
  });

  it("provides localized accessible show and hide labels", () => {
    expect(authFormSource).toContain('showPassword: "Prikaži lozinku"');
    expect(authFormSource).toContain('hidePassword: "Sakrij lozinku"');
    expect(authFormSource).toContain('showPassword: "Passwort anzeigen"');
    expect(authFormSource).toContain('showPassword: "Show password"');
    expect(authFormSource).toContain("aria-pressed={showPassword}");
    expect(authFormSource).toContain("aria-label={showPassword ? copy.hidePassword : copy.showPassword}");
  });

  it("loads the dedicated password control styles", () => {
    expect(layoutSource).toContain('import "./auth-password.css"');
  });
});
