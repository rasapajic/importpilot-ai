import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>Pametnije odluke za uvoz iz Kine.</h1>
        <p className="lede">
          Upravljajte ponudama dobavljača, stvarnim troškovima, rizicima i
          dokumentima na jednom mestu.
        </p>
        <div className="actions">
          <Link className="primary-link" href="/register">Započnite</Link>
          <Link href="/login">Prijavite se</Link>
        </div>
      </section>
      <section className="how-it-works">
        <p className="eyebrow">Kako ImportPilot radi</p>
        <h2>Od ponude dobavljača do jasne odluke.</h2>
        <div className="onboarding-grid">
          <article><strong>1. Dodajte projekat i ponude</strong><p>Unesite ciljnu zemlju, količinu i ponude dobavljača.</p></article>
          <article><strong>2. Izračunajte stvarni trošak</strong><p>Uporedite ukupnu nabavnu cenu, rizik, kvalitet i maržu.</p></article>
          <article><strong>3. Donesite odluku</strong><p>Dobijte preporuku, sledeće korake i poruku za pregovore.</p></article>
        </div>
      </section>
    </main>
  );
}
