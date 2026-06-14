import Link from "next/link";

import { CreateProjectFromUrlForm } from "@/components/projects/create-project-from-url-form";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import { translateText } from "@/modules/i18n/translations";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireSession();
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const mode = (await searchParams).mode === "url" ? "url" : "search";

  return (
    <main className="dashboard-shell">
      <p><Link href="/dashboard">{t("Back to projects")}</Link></p>
      <h1>{mode === "url" ? t("Ubaci link proizvoda") : t("Nova pretraga")}</h1>
      <p className="muted-text">
        {mode === "url"
          ? t("U sledećem koraku automatski otvaramo polje za link proizvoda.")
          : t("Krenite od naziva proizvoda, količine i ciljne zemlje.")}
      </p>
      <section className="dashboard-card">
        {mode === "url" ? <CreateProjectFromUrlForm /> : <CreateProjectForm mode={mode} />}
      </section>
    </main>
  );
}
