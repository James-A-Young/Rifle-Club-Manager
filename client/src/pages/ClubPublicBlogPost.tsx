import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ClubPublicBlogPost, ClubPublicPageData } from '../types/club';

interface ResponseShape {
  club: ClubPublicPageData;
  post: ClubPublicBlogPost;
}

export default function ClubPublicBlogPostPage() {
  const { id, vanity, slug } = useParams<{ id?: string; vanity?: string; slug?: string }>();
  const [data, setData] = useState<ResponseShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) {
      setError('Missing article slug');
      setLoading(false);
      return;
    }

    const path = vanity
      ? `/api/clubs/public/by-vanity/${encodeURIComponent(vanity)}/blog/${encodeURIComponent(slug)}`
      : id
        ? `/api/clubs/profile/${encodeURIComponent(id)}/blog/${encodeURIComponent(slug)}`
        : `/api/clubs/public/by-domain/blog/${encodeURIComponent(slug)}`;

    api.get<ResponseShape>(path)
      .then(response => {
        setData(response);
        document.title = `${response.post.title} | ${response.club.name}`;
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load article'))
      .finally(() => setLoading(false));
  }, [id, vanity, slug]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  const backPath = data?.club.publicSite.resolvedBy === 'vanity' && data.club.publicSite.vanitySlug
    ? `/clubpage/${data.club.publicSite.vanitySlug}`
    : data?.club.publicSite.resolvedBy === 'id'
      ? `/clubs/profile/${data.club.id}`
      : '/';

  return (
    <article>
      {error && <div className="alert alert-error">{error}</div>}
      {data && (
        <section className="public-blog-article">
          <Link to={backPath} className="btn btn-secondary btn-sm">← Back to club page</Link>
          <h1>{data.post.title}</h1>
          <p style={{ color: 'var(--gray-600)' }}>{new Date(data.post.publishedAt || data.post.createdAt).toLocaleDateString()}</p>
          <div className="markdown-content" dangerouslySetInnerHTML={{ __html: data.post.renderedHtml ?? '' }} />
        </section>
      )}
    </article>
  );
}
