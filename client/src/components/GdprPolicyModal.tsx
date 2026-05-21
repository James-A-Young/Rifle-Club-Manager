import { useMemo } from 'react';

function normalizeOrigin(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'https://shootingmatch.app';
  return trimmed.replace(/\/+$/, '');
}

function originHost(origin: string): string {
  try {
    const parsed = new URL(origin);
    return parsed.host;
  } catch {
    return origin.replace(/^https?:\/\//, '');
  }
}

interface GdprPolicyModalProps {
  open: boolean;
  onClose: () => void;
  clientOrigin: string;
}

export default function GdprPolicyModal({ open, onClose, clientOrigin }: GdprPolicyModalProps) {
  const effectiveDate = useMemo(
    () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    [],
  );

  const appOrigin = useMemo(() => normalizeOrigin(clientOrigin), [clientOrigin]);
  const appHost = useMemo(() => originHost(appOrigin), [appOrigin]);

  if (!open) return null;

  return (
    <div className="policy-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="policy-modal"
        role="dialog"
        aria-modal="true"
        aria-label="GDPR Privacy Policy"
        onClick={e => e.stopPropagation()}
      >
        <div className="policy-modal-header">
          <h2>GDPR Privacy Policy</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="policy-modal-content">
          <h3>1. Privacy Policy for {appHost}</h3>
          <p>This policy should be linked in the application footer and on the registration page.</p>
          <p><strong>Effective Date:</strong> {effectiveDate}</p>

          <h3>1. Introduction</h3>
          <p>
            Welcome to Rifle Club Manager, hosted at {appHost} ("we", "us", or "our"). We provide
            management software for rifle and shooting clubs. We take your privacy and the security of
            your data seriously. This Privacy Policy outlines how we collect, use, and protect your
            personal information in compliance with the UK General Data Protection Regulation (UK GDPR)
            and the Data Protection Act 2018.
          </p>

          <h3>2. Our Role in Data Processing</h3>
          <p><strong>As a Data Controller:</strong> We act as a Data Controller for the personal data of the Club Administrators who register an account directly with us (for example, your email address and login credentials).</p>
          <p><strong>As a Data Processor:</strong> For all other data, such as club members' personal details, scores, attendance, and firearm certificate details, the respective Rifle Club is the Data Controller. We only process this data on their behalf to provide our service.</p>

          <h3>3. Information We Collect</h3>
          <p>Through the use of our service, the following data may be collected:</p>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, and encrypted passwords of club administrators.</li>
            <li><strong>Club Member Data:</strong> Names, contact details, dates of birth, probationary statuses, and membership IDs.</li>
            <li><strong>Sensitive Licensing Data:</strong> Details regarding Firearm Certificates (FAC) and Shotgun Certificates (SGC), including certificate numbers and expiry dates.</li>
            <li><strong>Activity Data:</strong> Competition scores, electronic sign-in and sign-out times for club visits, and records of ammunition purchases.</li>
            <li><strong>Technical Data:</strong> IP addresses, browser types, and usage data required for security and anti-spam measures (for example, Cloudflare Turnstile).</li>
          </ul>

          <h3>4. How We Use Your Data</h3>
          <p>We use the data exclusively to:</p>
          <ul>
            <li>Provide, operate, and maintain the {appHost} platform.</li>
            <li>Allow clubs to comply with local firearms legislation (for example, tracking attendance and ammunition sales).</li>
            <li>Generate digital membership passes via Google Wallet integration.</li>
            <li>Provide technical support and secure automated backups (via Google Drive integration).</li>
          </ul>

          <h3>5. Third-Party Services and Sub-Processors</h3>
          <p>We do not sell or rent your personal data. We use trusted third-party services to ensure the app functions securely:</p>
          <ul>
            <li><strong>Google Drive API:</strong> Used specifically when a club opts to export or backup data to their own Google Workspace.</li>
            <li><strong>Google Wallet API:</strong> Used to issue digital membership cards.</li>
            <li><strong>Cloudflare Turnstile:</strong> Used to prevent spam and abuse on login and public-facing forms.</li>
            <li><strong>Email Providers:</strong> Used for sending password resets and system notifications.</li>
          </ul>

          <h3>6. Data Security and Backups</h3>
          <p>
            We implement strict security measures to prevent unauthorized access, alteration, or disclosure
            of data. All data is encrypted in transit (via HTTPS or SSL). Passwords are cryptographically
            hashed. We provide tools for clubs to securely export and backup their own databases.
          </p>

          <h3>7. Data Retention</h3>
          <p><strong>Administrator Data:</strong> Retained for as long as your club account is active.</p>
          <p>
            <strong>Member Data:</strong> Controlled by the Club. If a club terminates their account with {appHost},
            all associated member data will be permanently deleted from our primary servers within 30 days.
            UK Firearms law may require clubs to keep attendance records for 6 years, but this remains the
            club's responsibility to export.
          </p>

          <h3>8. Your Rights</h3>
          <p>Under the UK GDPR, you have the right to access, rectify, or erase your personal data.</p>
          <p>
            If you are a Club Administrator, contact us directly at the support email listed by your
            deployment administrator for {appOrigin}.
          </p>
          <p>
            If you are a Club Member, submit data requests (Subject Access Requests) directly to your
            Club Match Secretary or Data Protection Officer, who has the tools within the platform to
            fulfill your request.
          </p>

          <h3>2. Data Processing Addendum (For Club Admins)</h3>
          <p>When a club signs up to use the app, they should agree to Terms of Service that include this clause.</p>

          <h3>Data Processing Agreement (Summary)</h3>
          <p>
            By using {appHost} to manage your rifle club, you acknowledge that your Club is the Data
            Controller under the UK GDPR, and {appHost} is the Data Processor.
          </p>
          <ul>
            <li><strong>Lawful Basis:</strong> The Club guarantees it has a lawful basis (such as Legitimate Interest or Legal Obligation under the Firearms Act) to collect and store member sensitive data, including FAC and SGC details, attendances, and ammunition purchases.</li>
            <li><strong>Processor Obligations:</strong> We process member data only to provide software features documented for the platform. We do not mine, sell, or independently use members' data.</li>
            <li><strong>Security Incidents:</strong> In the event of a data breach affecting club data, we notify the registered Club Administrator within 48 hours of discovering the breach.</li>
            <li><strong>Compliance Assistance:</strong> We provide export tools (such as Competition Results, Sales Ledger, and Sign-in History exports) to assist Clubs in fulfilling legal obligations and responding to member Subject Access Requests.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
