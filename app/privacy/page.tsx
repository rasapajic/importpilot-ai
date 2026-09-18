import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | JAKOV360 ImportPilot",
  description: "Privacy Policy for JAKOV360 ImportPilot, including Google Sign-In data use.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <p className="eyebrow">JAKOV360 · ImportPilot AI</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: September 18, 2026</p>

        <p>
          JAKOV360 operates ImportPilot at <Link href="/">jakov360.com</Link>. This policy explains what
          information ImportPilot processes, why it is used, and the choices available to you. For privacy
          questions or requests, contact <a href="mailto:privacy@jakov360.com">privacy@jakov360.com</a>.
        </p>

        <h2>1. Information we process</h2>
        <ul>
          <li><strong>Account information:</strong> name, email address, organization name, and account/session records.</li>
          <li><strong>Email/password accounts:</strong> passwords are stored only as password hashes, not as readable passwords.</li>
          <li>
            <strong>Google Sign-In:</strong> ImportPilot requests only the OpenID Connect scopes
            <code> openid email profile</code>. We receive your Google account identifier, verified email
            address, and name. The Google access token is used transiently to retrieve this identity and is
            not stored in the ImportPilot database.
          </li>
          <li>
            <strong>Sourcing and business data:</strong> product searches, quantities, destinations, supplier
            links and evidence, selected offers, commercial terms you confirm, landed-cost inputs and
            calculations, and decision history.
          </li>
          <li>
            <strong>Technical and security data:</strong> essential session cookies, short-lived OAuth
            state/PKCE cookies, timestamps, request/error information, and operational logs needed to run,
            secure, and troubleshoot the service.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <p>We use information only to:</p>
        <ul>
          <li>create, authenticate, and secure your account;</li>
          <li>link Google Sign-In to an existing ImportPilot account when the verified email matches;</li>
          <li>perform supplier search, offer comparison, landed-cost calculations, and decision support;</li>
          <li>save the projects and results you choose to keep;</li>
          <li>operate, troubleshoot, protect, and improve ImportPilot.</li>
        </ul>

        <h2>3. Google user data</h2>
        <p>
          Google user data is used only for sign-in and account linking. ImportPilot does not request access
          to Gmail, Google Drive, Google Calendar, contacts, or other Google content. Google profile data is
          not used for advertising, is not sold, and is not shared except with service providers strictly
          necessary to operate and secure ImportPilot.
        </p>

        <h2>4. Service providers and external sources</h2>
        <p>
          ImportPilot uses infrastructure and service providers to host the application and database, perform
          authentication, run supplier-search and supplier-page enrichment, and maintain recovery/security
          capabilities. Supplier and marketplace links may lead to third-party websites with their own privacy
          practices. We do not sell personal information.
        </p>

        <h2>5. Cookies and sessions</h2>
        <p>
          ImportPilot 1.0 uses cookies that are necessary for authentication and security, including the
          application session and short-lived Google OAuth state/PKCE cookies. ImportPilot 1.0 does not use
          advertising cookies for Google Sign-In data.
        </p>

        <h2>6. Retention and deletion</h2>
        <p>
          Account and project data is retained while needed to provide the service, meet security and recovery
          needs, or comply with applicable obligations. Operational backups and logs may remain for a limited
          recovery or security period. You can request access, correction, or deletion by emailing
          <a href="mailto:privacy@jakov360.com"> privacy@jakov360.com</a>.
        </p>

        <h2>7. Security</h2>
        <p>
          We use HTTPS, access controls, secure session handling, OAuth PKCE/state protections, database
          access controls, and backup/recovery procedures. No online service can guarantee absolute security.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Depending on applicable law, you may have rights to access, correct, delete, restrict, object to, or
          receive a copy of personal data associated with your account. Send requests to
          <a href="mailto:privacy@jakov360.com"> privacy@jakov360.com</a>.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy when ImportPilot or its data practices change. The current version and
          effective date will remain published at this URL.
        </p>

        <p className="legal-return"><Link href="/">Return to JAKOV360 ImportPilot</Link></p>
      </article>
    </main>
  );
}
