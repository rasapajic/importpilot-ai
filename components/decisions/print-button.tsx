"use client";

export function PrintButton() {
  return <button className="no-print" onClick={() => window.print()} type="button">Štampaj / Sačuvaj PDF</button>;
}

