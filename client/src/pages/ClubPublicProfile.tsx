import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { ClubPublicBlogPostListResponse, ClubPublicPageData } from '../types/club';
import { normalizeDisciplines } from '../shared/clubUtils';

const BLOG_PAGE_SIZE = 5;

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
  const [blogList, setBlogList] = useState<ClubPublicBlogPostListResponse | null>(null);
  const [blogPageLoading, setBlogPageLoading] = useState(false);
  const [blogError, setBlogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const profilePath = useMemo(() => {
    if (vanity) {
      return `/api/clubs/public/by-vanity/${encodeURIComponent(vanity)}`;
    }
    if (id) {
      return `/api/clubs/profile/${encodeURIComponent(id)}`;
    }
    return '/api/clubs/public/by-domain';
  }, [id, vanity]);

  const blogListBasePath = useMemo(() => {
    if (vanity) {
      return `/api/clubs/public/by-vanity/${encodeURIComponent(vanity)}/blog`;
    }
    if (id) {
      return `/api/clubs/profile/${encodeURIComponent(id)}/blog`;
    }
    return '/api/clubs/public/by-domain/blog';
  }, [id, vanity]);

  const loadBlogPage = (page: number, signal?: AbortSignal) => {
    setBlogPageLoading(true);
    setBlogError('');
    return api.get<ClubPublicBlogPostListResponse>(`${blogListBasePath}?page=${page}&pageSize=${BLOG_PAGE_SIZE}`, signal)
      .then(data => setBlogList(data))
      .catch(e => {
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
        setBlogError(e instanceof Error ? e.message : 'Could not load blog posts');
      })
      .finally(() => setBlogPageLoading(false));
  };

  useEffect(() => {
    const abortController = new AbortController();

    setLoading(true);
    setError('');
    setBlogError('');
    setBlogList(null);

    api.get<ClubPublicPageData>(profilePath, abortController.signal)
      .then(data => {
        setClub(data);
        document.title = `${data.name} | ShootingMatch.app`;
        upsertMeta('description', data.publicSite.heroSubtitle ?? data.description ?? `${data.name} rifle club profile`);
        upsertCanonical(data.publicSite.canonicalUrl);

        return loadBlogPage(1, abortController.signal);
      })
      .catch(e => {
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load club profile');
      })
      .finally(() => setLoading(false));

    return () => abortController.abort();
  }, [profilePath, blogListBasePath]);

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
            {blogPageLoading && !blogList ? (
              <p>Loading published articles…</p>
            ) : blogError ? (
              <div className="alert alert-error">{blogError}</div>
            ) : !blogList || blogList.posts.length === 0 ? (
              <p>No published articles yet.</p>
            ) : (
              <>
                <div className="public-blog-list">
                  {blogList.posts.map(post => (
                    <article key={post.id} className="public-blog-card">
                      <h3><Link to={`${blogBasePath}/${post.slug}`}>{post.title}</Link></h3>
                      <p>{post.excerpt || 'Read the latest club update.'}</p>
                      <small>{new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</small>
                    </article>
                  ))}
                </div>
                {blogList.totalPages > 1 && (
                  <div className="public-blog-pagination" aria-label="Blog pagination controls">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!blogList.hasPrevPage || blogPageLoading}
                      onClick={() => loadBlogPage(blogList.page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {blogList.page} of {blogList.totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!blogList.hasNextPage || blogPageLoading}
                      onClick={() => loadBlogPage(blogList.page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </article>
  );
}
