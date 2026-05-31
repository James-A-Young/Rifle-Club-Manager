import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { ClubPublicPageData } from '../types/club';
import { normalizeDisciplines } from '../shared/clubUtils';

function upsertMeta(name: string, content: string): void {
  let node = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('name', name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function upsertCanonical(url: string): void {
  let node = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }
  node.setAttribute('href', url);
}

export default function ClubPublicProfile() {
  const { id, vanity } = useParams<{ id?: string; vanity?: string }>();
  const location = useLocation();
  const [club, setClub] = useState<ClubPublicPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');

    const path = vanity
      ? `/api/clubs/public/by-vanity/${encodeURIComponent(vanity)}`
      : id
        ? `/api/clubs/profile/${encodeURIComponent(id)}`
        : '/api/clubs/public/by-domain';

    api.get<ClubPublicPageData>(path)
      .then(data => {
        setClub(data);
        document.title = `${data.name} | ShootingMatch.app`;
        upsertMeta('description', data.publicSite.heroSubtitle ?? data.description ?? `${data.name} rifle club profile`);
        upsertCanonical(data.publicSite.canonicalUrl);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load club profile'))
      .finally(() => setLoading(false));
  }, [id, vanity]);

  const disciplinesLabel = useMemo(() => normalizeDisciplines(club?.disciplinesOffered).join(', '), [club]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  const blogBasePath = club?.publicSite.resolvedBy === 'vanity' && club.publicSite.vanitySlug
    ? `/clubpage/${club.publicSite.vanitySlug}/blog`
    : club?.publicSite.resolvedBy === 'id' && club.id
      ? `/clubs/profile/${club.id}/blog`
      : '/blog';

  return (
    <article className="public-site-page">
      {error && <div className="alert alert-error">{error}</div>}
      {club && (
        <>
          <header className="public-hero" style={{ backgroundImage: club.publicSite.headerImageUrl ? `linear-gradient(rgba(26,39,68,.65), rgba(26,39,68,.65)), url(${club.publicSite.headerImageUrl})` : undefined }}>
            <div>
              <h1>{club.publicSite.heroTitle || club.name}</h1>
              <p>{club.publicSite.heroSubtitle || club.description || 'Welcome to our club profile.'}</p>
              {location.pathname.startsWith('/clubpage/') || location.pathname.startsWith('/clubs/profile/') || location.pathname.startsWith('/blog/')
                ? <Link to="/" className="btn btn-secondary btn-sm">Home</Link>
                : null}
            </div>
          </header>

          {club.publicSite.announcements.length > 0 && (
            <section aria-label="Announcements">
              <h2>Announcements</h2>
              <div className="public-announcements">
                {club.publicSite.announcements.map(item => (
                  <div key={item.id} className={`public-banner public-banner-${item.variant.toLowerCase()}`}>
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Club overview">
            <h2>About {club.name}</h2>
            <dl className="public-overview-grid">
              <dt>Address</dt><dd>{club.address ?? 'N/A'}</dd>
              <dt>Disciplines</dt><dd>{disciplinesLabel || 'N/A'}</dd>
              <dt>Accepting New Members</dt><dd>{club.acceptingNewMembers ? 'Yes' : 'No'}</dd>
              <dt>Opening Times</dt><dd>{club.openingTimes ?? 'N/A'}</dd>
              <dt>Members</dt><dd>{club._count.memberships}</dd>
            </dl>
          </section>

          <section aria-label="Session schedule">
            <h2>Session Types & Times</h2>
            {club.publicSite.sessions.length === 0 ? (
              <p>No sessions published yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Day</th><th>Session</th><th>Time</th><th>Notes</th></tr></thead>
                  <tbody>
                    {club.publicSite.sessions.map(session => (
                      <tr key={session.id}>
                        <td>{session.dayLabel}</td>
                        <td>{session.sessionType}</td>
                        <td>{session.startsAt} - {session.endsAt}</td>
                        <td>{session.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Blog posts">
            <h2>Club Blog</h2>
            {club.publicSite.blogPosts.length === 0 ? (
              <p>No published articles yet.</p>
            ) : (
              <div className="public-blog-list">
                {club.publicSite.blogPosts.map(post => (
                  <article key={post.id} className="public-blog-card">
                    <h3><Link to={`${blogBasePath}/${post.slug}`}>{post.title}</Link></h3>
                    <p>{post.excerpt || 'Read the latest club update.'}</p>
                    <small>{new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </article>
  );
}
