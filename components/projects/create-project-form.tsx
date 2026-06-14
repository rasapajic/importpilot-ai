"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getProjectCreationDestination } from "@/modules/projects/application/project-creation-destination";

export function CreateProjectForm({ mode = "search" }: { mode?: "search" | "url" }) {
  const { t } = useI18n();
  const router = useRouter();
  const productNameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode === "search") productNameRef.current?.focus();
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !body.id) {
      setError(body.error ?? "Projekat nije kreiran.");
      setPending(false);
      return;
    }
    router.push(getProjectCreationDestination(body.id, mode));
    router.refresh();
  }

  return (
    <form className="project-form" data-entry-mode={mode} onSubmit={submit}>
      {mode === "url" && (
        <div className="form-intro">
          <h2>{t("Uvezite proizvod iz linka")}</h2>
          <p>{t("Prvo upišite osnovne podatke o kupovini. Zatim ćemo odmah otvoriti polje za link proizvoda.")}</p>
        </div>
      )}
      <label>{t("Naziv proizvoda")}<input name="name" ref={productNameRef} required minLength={2} maxLength={160} placeholder={t("npr. PTZ kamera 3MP")} /></label>
      <label>Ciljna zemlja<input name="targetCountry" required minLength={2} maxLength={2} placeholder="DE" /></label>
      <label>Količina<input name="quantity" type="number" required min={1} step={1} /></label>
      <label>{t("Ciljna marža (%)")}<input name="targetMargin" type="number" required min={0} max={100} step="0.01" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={pending} type="submit">
        {pending
          ? t("Kreiranje...")
          : mode === "url"
            ? t("Nastavi na unos linka")
            : t("Kreiraj projekat")}
      </button>
    </form>
  );
}
