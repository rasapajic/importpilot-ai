"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const labels = {
  en: "Install app",
  de: "App installieren",
  sr: "Instaliraj aplikaciju",
} as const;

export function PwaInstallButton() {
  const { locale } = useI18n();
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  async function install() {
    const event = promptEvent;
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => null);
    setPromptEvent(null);
  }

  return (
    <button className="pwa-install-button" onClick={install} type="button">
      {labels[locale]}
    </button>
  );
}
