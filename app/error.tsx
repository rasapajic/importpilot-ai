"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="dashboard-card empty-state">
        <p className="eyebrow">Nešto nije uspelo</p>
        <h2>Nismo mogli da prikažemo ovu stranicu.</h2>
        <p>Vaši podaci nisu promenjeni. Pokušajte ponovo za nekoliko trenutaka.</p>
        <button onClick={reset} type="button">Pokušaj ponovo</button>
      </section>
    </main>
  );
}
