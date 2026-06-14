"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";

export function DeleteDemoProjectButton({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(t("Obrisati demo projekat i sve povezane podatke?"))) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error && deleteError.message
        ? deleteError.message
        : t("Demo projekat nije obrisan. Pokušajte ponovo."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="demo-project-delete">
      <button className="danger-button" disabled={pending} onClick={remove} type="button">
        {pending ? t("Brisanje...") : t("Obriši projekat")}
      </button>
      {error && <small className="form-error" role="alert">{t(error)}</small>}
    </div>
  );
}
