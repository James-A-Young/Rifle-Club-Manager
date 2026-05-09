import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-orb landing-orb-a" aria-hidden="true" />
        <div className="landing-orb landing-orb-b" aria-hidden="true" />

        <p className="landing-kicker">Built for clubs that take safety seriously</p>
        <h1>Run Your Range Like a Modern Operations Team</h1>
        <p className="landing-subtitle">
            Digital membership cards, QR-based check-ins, invite approvals, firearm usage tracking,
            and searchable attendance history in one clean command center.
        </p>

        <div className="landing-cta-row">
          <Link className="btn landing-btn-primary" to="/register">
            Start Free
          </Link>
          <Link className="btn landing-btn-ghost" to="/login">
            Sign In
          </Link>
        </div>

        <div className="landing-stats" role="list" aria-label="Platform highlights">
          <div className="landing-stat" role="listitem">
              <strong>Google Wallet passes</strong>
              <span>Members add club cards to their phone with live visit counts</span>
          </div>
          <div className="landing-stat" role="listitem">
              <strong>QR-based kiosk sign-in</strong>
              <span>Members scan their card on a tablet—no PIN or paperwork needed</span>
          </div>
          <div className="landing-stat" role="listitem">
              <strong>Club-branded experience</strong>
              <span>Custom colors, logos, and toggle controls for pass issuing and QR scanning</span>
          </div>
        </div>
      </section>

      <section className="landing-strip">
        <article>
          <h3>For Club Admins</h3>
            <p>Configure club branding, control pass issuing, enable QR kiosk sign-in, and audit all attendance records.</p>
        </article>
        <article>
          <h3>For Members</h3>
            <p>Generate a digital membership card, add it to Google Wallet, and sign in with a single QR scan.</p>
        </article>
        <article>
          <h3>For Front Desk</h3>
            <p>Tablet-based kiosk with QR scanner, active-visitor tracking, and instant sign-out controls.</p>
        </article>
      </section>
    </div>
  );
}