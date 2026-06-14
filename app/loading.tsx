export default function Loading() {
  return (
    <main>
      <section className="dashboard-card loading-state" aria-live="polite">
        <div className="loading-indicator" />
        <h2>Učitavanje ImportPilot podataka...</h2>
        <p>Pripremamo najnovije informacije za vaš projekat.</p>
      </section>
    </main>
  );
}
