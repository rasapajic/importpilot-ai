"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Odjava trenutno nije uspela.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Veza sa serverom nije dostupna.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className={compact ? "header-secondary-action" : "secondary-button"} disabled={pending} onClick={logout} type="button">
        {pending ? t("Signing out...") : t("Sign out")}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
