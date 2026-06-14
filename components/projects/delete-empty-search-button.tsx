"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";

export function DeleteEmptySearchButton({
  projectId,
  className = "danger-button",
}: {
  projectId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}?mode=empty-search`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      dialogRef.current?.close();
      router.push("/dashboard");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error && deleteError.message
        ? deleteError.message
        : t("Pretraga nije obrisana. Pokušajte ponovo."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className={className} onClick={() => dialogRef.current?.showModal()} type="button">
        {t("Obriši pretragu")}
      </button>
      <dialog className="confirm-dialog" ref={dialogRef}>
        <form method="dialog">
          <h2>{t("Obrisati pretragu?")}</h2>
          <p>{t("Ova pretraga nema korisne podatke i biće trajno obrisana.")}</p>
          {error && <p className="form-error" role="alert">{t(error)}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={pending} type="submit">
              {t("Otkaži")}
            </button>
            <button className="danger-button" disabled={pending} onClick={remove} type="button">
              {pending ? t("Brisanje...") : t("Obriši")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
