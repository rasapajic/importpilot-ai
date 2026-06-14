"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function ResponsiveOfferDetails({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setOpen(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <details
      className="offer-card-details"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary>{summary}</summary>
      <div className="offer-card-details-content">{children}</div>
    </details>
  );
}
