import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | JAKOV360 ImportPilot",
  description: "Terms of Service for JAKOV360 ImportPilot.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <p className="eyebrow">JAKOV360 · ImportPilot AI</p>
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: September 18, 2026</p>

        <p>
          These Terms govern use of ImportPilot at <Link href="/">jakov360.com</Link>. By using the service,
          you agree to these Terms. Questions can be sent to
          <a href="mailto:privacy@jakov360.com"> privacy@jakov360.com</a>.
        </p>

        <h2>1. What ImportPilot provides</h2>
        <p>
          ImportPilot is decision-support software for international sourcing. It helps users search for
          supplier offers, compare available evidence, estimate landed cost and profitability, and organize a
          BUY / NEGOTIATE / WATCH / SKIP decision.
        </p>

        <h2>2. Estimates and third-party information</h2>
        <p>
          Supplier information, marketplace pages, prices, MOQ, Incoterms, delivery information, exchange
          rates, taxes, customs assumptions, and other external data can change or be incomplete. ImportPilot
          distinguishes verified, user-confirmed, estimated, and unavailable information where the 1.0 product
          supports that distinction, but it cannot guarantee that third-party information is complete or current.
        </p>

        <h2>3. Your responsibility before purchasing</h2>
        <p>
          ImportPilot does not purchase goods for you and does not replace legal, customs, tax, accounting, or
          professional inspection advice. Before placing an order, you are responsible for verifying the
          supplier, product specification, commercial terms, applicable import rules, duties/taxes, payment
          terms, and any required certifications or permits.
        </p>

        <h2>4. Accounts and security</h2>
        <p>
          You are responsible for keeping your account credentials secure and for activity performed through
          your account. Do not attempt to access another organization&apos;s projects or data, bypass service
          security, interfere with providers, or use ImportPilot for unlawful activity.
        </p>

        <h2>5. Google Sign-In</h2>
        <p>
          Google Sign-In is an authentication option. When used, ImportPilot processes only the Google identity
          data described in our <Link href="/privacy">Privacy Policy</Link>. Your use of Google services also
          remains subject to Google&apos;s applicable terms and policies.
        </p>

        <h2>6. Third-party services and links</h2>
        <p>
          ImportPilot relies on hosting, authentication, supplier-search, enrichment, exchange-rate, marketplace,
          and other third-party services. Their availability and content are outside ImportPilot&apos;s control.
          Third-party websites and transactions are governed by their own terms.
        </p>

        <h2>7. Availability and changes</h2>
        <p>
          We may maintain, update, suspend, or change parts of ImportPilot to improve security, reliability, or
          functionality. We do not promise uninterrupted availability.
        </p>

        <h2>8. Disclaimer and limitation</h2>
        <p>
          ImportPilot is provided as decision-support software. To the extent permitted by applicable law,
          JAKOV360 is not responsible for losses caused by a supplier&apos;s conduct, inaccurate third-party
          information, customs decisions, exchange-rate movement, shipment problems, or a user&apos;s purchasing
          decision. Nothing in these Terms excludes rights or liability that cannot legally be excluded.
        </p>

        <h2>9. Termination</h2>
        <p>
          You may stop using ImportPilot at any time. We may restrict or terminate access where reasonably
          necessary for security, abuse prevention, legal compliance, or material breach of these Terms.
        </p>

        <h2>10. Changes to these Terms</h2>
        <p>
          We may update these Terms as the product changes. The current version and effective date will remain
          published at this URL.
        </p>

        <p className="legal-return"><Link href="/">Return to JAKOV360 ImportPilot</Link></p>
      </article>
    </main>
  );
}
