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
          Member check-ins, invite approvals, secure kiosk sign-ins, firearm usage tracking, and
          searchable attendance history in one clean command center.
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
            <strong>Invite-driven access</strong>
            <span>Controlled onboarding with role-aware approvals</span>
          </div>
          <div className="landing-stat" role="listitem">
            <strong>Kiosk + QR ready</strong>
            <span>Fast check-ins with secure indirect sign-out references</span>
          </div>
          <div className="landing-stat" role="listitem">
            <strong>Auditable history</strong>
            <span>Search, summaries, and CSV export for admin reporting</span>
          </div>
        </div>
      </section>

      <section className="landing-strip">
        <article>
          <h3>For Club Admins</h3>
          <p>Approve pending members, send role-fixed invites, and manage attendance with confidence.</p>
        </article>
        <article>
          <h3>For Members</h3>
          <p>Simple profile and sign-in flows that keep compliance details up to date.</p>
        </article>
        <article>
          <h3>For Front Desk</h3>
          <p>Dedicated kiosk mode with clear active-visitor visibility and instant sign-out controls.</p>
        </article>
      </section>
    </div>
  );
}