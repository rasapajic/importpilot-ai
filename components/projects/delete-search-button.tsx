"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";

type Copy = {
  deleteLabel: string;
  confirmTitle: string;
  confirmText: (name: string) => string;
  cancel: string;
  confirm: string;
  deleting: string;
  error: string;
};

const copy: Record<Locale, Copy> = {
  sr: {
    deleteLabel: "Obriši pretragu",
    confirmTitle: "Obrisati ovu pretragu?",
    confirmText: (name) =>
      `„${name}“ će biti trajno obrisana zajedno sa sačuvanim ponudama, kalkulacijama i povezanim podacima.`,
    cancel: "Otkaži",
    confirm: "Obriši",
    deleting: "Brisanje...",
    error: "Pretraga nije obrisana. Pokušajte ponovo.",
  },
  de: {
    deleteLabel: "Suche löschen",
    confirmTitle: "Diese Suche löschen?",
    confirmText: (name) =>
      `„${name}“ wird dauerhaft zusammen mit gespeicherten Angeboten, Berechnungen und verknüpften Daten gelöscht.`,
    cancel: "Abbrechen",
    confirm: "Löschen",
    deleting: "Wird gelöscht...",
    error: "Die Suche konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  },
  en: {
    deleteLabel: "Delete search",
    confirmTitle: "Delete this search?",
    confirmText: (name) =>
      `“${name}” will be permanently deleted together with saved offers, calculations and related data.`,
    cancel: "Cancel",
    confirm: "Delete",
    deleting: "Deleting...",
    error: "The search was not deleted. Please try again.",
  },
};

export function DeleteSearchButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}?mode=search`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || text.error);
      dialogRef.current?.close();
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error && deleteError.message ? deleteError.message : text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        aria-label={`${text.deleteLabel}: ${projectName}`}
        className="project-delete-icon"
        onClick={() => dialogRef.current?.showModal()}
        title={text.deleteLabel}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
      <dialog className="project-delete-dialog" ref={dialogRef}>
        <form method="dialog">
          <h2>{text.confirmTitle}</h2>
          <p>{text.confirmText(projectName)}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="project-delete-dialog-actions">
            <button className="secondary-button" disabled={pending} type="submit">
              {text.cancel}
            </button>
            <button className="project-delete-confirm-button" disabled={pending} onClick={remove} type="button">
              {pending ? text.deleting : text.confirm}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
