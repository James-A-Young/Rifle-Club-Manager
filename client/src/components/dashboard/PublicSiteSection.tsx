import {
  ClubPublicBlogPost,
  ClubPublicDomain,
  PublicAnnouncementVariant,
} from '../../types/club';

interface PublicSiteProfileForm {
  vanitySlug: string;
  heroTitle: string;
  heroSubtitle: string;
  headerImageUrl: string;
  headerImageAlt: string;
}

interface SessionDraft {
  dayLabel: string;
  sessionType: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}

interface AnnouncementDraft {
  title: string;
  message: string;
  variant: PublicAnnouncementVariant;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
}

interface BlogDraft {
  title: string;
  slug: string;
  excerpt: string;
  markdownBody: string;
  isPublished: boolean;
}

interface Props {
  profile: PublicSiteProfileForm;
  sessions: SessionDraft[];
  announcements: AnnouncementDraft[];
  blogPosts: ClubPublicBlogPost[];
  blogDraft: BlogDraft;
  domains: ClubPublicDomain[];
  newDomain: string;
  expectedCnameTarget: string;
  loading: boolean;
  onProfileChange: (partial: Partial<PublicSiteProfileForm>) => void;
  onSaveProfile: () => void;
  onSessionsChange: (sessions: SessionDraft[]) => void;
  onSaveSessions: () => void;
  onAnnouncementsChange: (announcements: AnnouncementDraft[]) => void;
  onSaveAnnouncements: () => void;
  onBlogDraftChange: (partial: Partial<BlogDraft>) => void;
  onCreateBlogPost: () => void;
  onDeleteBlogPost: (postId: string) => void;
  onTogglePublishBlogPost: (postId: string, publish: boolean) => void;
  onNewDomainChange: (value: string) => void;
  onAddDomain: () => void;
  onVerifyDomain: (domainId: string) => void;
  onToggleDomainActivation: (domainId: string, isActive: boolean) => void;
  onDeleteDomain: (domainId: string) => void;
}

function sessionRow(session: SessionDraft, onChange: (next: SessionDraft) => void, onDelete: () => void, idx: number) {
  return (
    <div key={`session-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
      <input value={session.dayLabel} onChange={e => onChange({ ...session, dayLabel: e.target.value })} placeholder="Day" />
      <input value={session.sessionType} onChange={e => onChange({ ...session, sessionType: e.target.value })} placeholder="Session type" />
      <input value={session.startsAt} onChange={e => onChange({ ...session, startsAt: e.target.value })} placeholder="09:00" />
      <input value={session.endsAt} onChange={e => onChange({ ...session, endsAt: e.target.value })} placeholder="12:00" />
      <input value={session.notes} onChange={e => onChange({ ...session, notes: e.target.value })} placeholder="Notes" />
      <button type="button" className="btn btn-secondary btn-sm" onClick={onDelete}>Remove</button>
    </div>
  );
}

export default function PublicSiteSection({
  profile,
  sessions,
  announcements,
  blogPosts,
  blogDraft,
  domains,
  newDomain,
  expectedCnameTarget,
  loading,
  onProfileChange,
  onSaveProfile,
  onSessionsChange,
  onSaveSessions,
  onAnnouncementsChange,
  onSaveAnnouncements,
  onBlogDraftChange,
  onCreateBlogPost,
  onDeleteBlogPost,
  onTogglePublishBlogPost,
  onNewDomainChange,
  onAddDomain,
  onVerifyDomain,
  onToggleDomainActivation,
  onDeleteDomain,
}: Props) {
  return (
    <section>
      <div className="page-header"><h2>Public Site</h2></div>

      <h3>Branding & Vanity URL</h3>
      <div className="form-group"><label>Vanity slug</label><input value={profile.vanitySlug} onChange={e => onProfileChange({ vanitySlug: e.target.value })} placeholder="my-club" /></div>
      <div className="form-group"><label>Hero title</label><input value={profile.heroTitle} onChange={e => onProfileChange({ heroTitle: e.target.value })} /></div>
      <div className="form-group"><label>Hero subtitle</label><textarea rows={2} value={profile.heroSubtitle} onChange={e => onProfileChange({ heroSubtitle: e.target.value })} /></div>
      <div className="form-group"><label>Header image URL</label><input value={profile.headerImageUrl} onChange={e => onProfileChange({ headerImageUrl: e.target.value })} /></div>
      <div className="form-group"><label>Header image alt text</label><input value={profile.headerImageAlt} onChange={e => onProfileChange({ headerImageAlt: e.target.value })} /></div>
      <button type="button" className="btn btn-primary" onClick={onSaveProfile} disabled={loading}>Save Public Profile</button>

      <hr style={{ margin: '1rem 0' }} />
      <h3>Session Schedule</h3>
      {sessions.map((session, idx) => sessionRow(
        session,
        next => onSessionsChange(sessions.map((item, i) => i === idx ? next : item)),
        () => onSessionsChange(sessions.filter((_, i) => i !== idx)),
        idx,
      ))}
      <div className="actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onSessionsChange([...sessions, { dayLabel: '', sessionType: '', startsAt: '', endsAt: '', notes: '' }])}
        >
          Add Session
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSaveSessions} disabled={loading}>Save Sessions</button>
      </div>

      <hr style={{ margin: '1rem 0' }} />
      <h3>Announcements</h3>
      {announcements.map((item, idx) => (
        <div key={`announcement-${idx}`} style={{ border: '1px solid var(--gray-200)', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.5rem' }}>
          <div className="form-group"><input value={item.title} onChange={e => onAnnouncementsChange(announcements.map((a, i) => i === idx ? { ...a, title: e.target.value } : a))} placeholder="Title" /></div>
          <div className="form-group"><textarea rows={2} value={item.message} onChange={e => onAnnouncementsChange(announcements.map((a, i) => i === idx ? { ...a, message: e.target.value } : a))} placeholder="Message" /></div>
          <div className="actions" style={{ alignItems: 'center' }}>
            <select value={item.variant} onChange={e => onAnnouncementsChange(announcements.map((a, i) => i === idx ? { ...a, variant: e.target.value as PublicAnnouncementVariant } : a))}>
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="SUCCESS">Success</option>
            </select>
            <input type="datetime-local" value={item.startsAt} onChange={e => onAnnouncementsChange(announcements.map((a, i) => i === idx ? { ...a, startsAt: e.target.value } : a))} />
            <input type="datetime-local" value={item.endsAt} onChange={e => onAnnouncementsChange(announcements.map((a, i) => i === idx ? { ...a, endsAt: e.target.value } : a))} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><input type="checkbox" checked={item.isEnabled} onChange={e => onAnnouncementsChange(announcements.map((a, i) => i === idx ? { ...a, isEnabled: e.target.checked } : a))} /> Enabled</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAnnouncementsChange(announcements.filter((_, i) => i !== idx))}>Remove</button>
          </div>
        </div>
      ))}
      <div className="actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAnnouncementsChange([...announcements, { title: '', message: '', variant: 'INFO', startsAt: '', endsAt: '', isEnabled: true }])}>Add Announcement</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSaveAnnouncements} disabled={loading}>Save Announcements</button>
      </div>

      <hr style={{ margin: '1rem 0' }} />
      <h3>Blog</h3>
      <div className="form-group"><input value={blogDraft.title} onChange={e => onBlogDraftChange({ title: e.target.value })} placeholder="Post title" /></div>
      <div className="form-group"><input value={blogDraft.slug} onChange={e => onBlogDraftChange({ slug: e.target.value })} placeholder="post-slug (optional)" /></div>
      <div className="form-group"><textarea rows={2} value={blogDraft.excerpt} onChange={e => onBlogDraftChange({ excerpt: e.target.value })} placeholder="Excerpt" /></div>
      <div className="form-group"><textarea rows={8} value={blogDraft.markdownBody} onChange={e => onBlogDraftChange({ markdownBody: e.target.value })} placeholder="Markdown body" /></div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={blogDraft.isPublished} onChange={e => onBlogDraftChange({ isPublished: e.target.checked })} /> Publish now</label>
      <div><button type="button" className="btn btn-primary btn-sm" onClick={onCreateBlogPost} disabled={loading}>Create Post</button></div>

      <div style={{ marginTop: '0.75rem' }}>
        {blogPosts.map(post => (
          <div key={post.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', borderBottom: '1px solid var(--gray-200)', padding: '0.5rem 0' }}>
            <div>
              <strong>{post.title}</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>/{post.slug} {post.isPublished ? '• Published' : '• Draft'}</div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTogglePublishBlogPost(post.id, !post.isPublished)}>
                {post.isPublished ? 'Unpublish' : 'Publish'}
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onDeleteBlogPost(post.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <hr style={{ margin: '1rem 0' }} />
      <h3>Custom Domains</h3>
      <p style={{ color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Set CNAME to <code>{expectedCnameTarget}</code></p>
      <div className="actions" style={{ marginBottom: '0.75rem' }}>
        <input value={newDomain} onChange={e => onNewDomainChange(e.target.value)} placeholder="www.exampleclub.org" />
        <button type="button" className="btn btn-primary btn-sm" onClick={onAddDomain} disabled={loading}>Add Domain</button>
      </div>
      {domains.map(domain => (
        <div key={domain.id} style={{ borderBottom: '1px solid var(--gray-200)', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <div>
              <strong>{domain.domain}</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>{domain.status} {domain.isActive ? '• Active' : ''}</div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onVerifyDomain(domain.id)}>Check DNS</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={domain.status !== 'VERIFIED'} onClick={() => onToggleDomainActivation(domain.id, !domain.isActive)}>
                {domain.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onDeleteDomain(domain.id)}>Delete</button>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>Verification token: {domain.verificationToken}</div>
        </div>
      ))}
    </section>
  );
}
