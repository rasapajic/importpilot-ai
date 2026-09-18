"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const labels = {
  en: "Install app",
  de: "App installieren",
  sr: "Instaliraj aplikaciju",
} as const;

function currentLabel() {
  if (typeof document === "undefined") return labels.en;
  const lang = document.documentElement.lang.toLowerCase();
  if (lang.startsWith("de")) return labels.de;
  if (lang.startsWith("sr")) return labels.sr;
  return labels.en;
}

export function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [label, setLabel] = useState(labels.en);

  useEffect(() => {
    setLabel(currentLabel());

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
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
  }

  return (
    <button className="pwa-install-button" onClick={install} type="button">
      {label}
    </button>
  );
}
