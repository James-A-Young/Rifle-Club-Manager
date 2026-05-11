import { SignInLink } from '../../types/club';

interface Props {
  links: SignInLink[];
  onGenerate: () => void;
  onRevoke: (linkId: string) => void;
}

export default function KioskLinksSection({ links, onGenerate, onRevoke }: Props) {
  const kioskLinks = links.filter(l => l.mode === 'KIOSK');

  return (
    <section>
      <div className="page-header">
        <h2>Kiosk Links</h2>
        <div className="actions">
          <button className="btn btn-primary btn-sm" onClick={onGenerate}>
            Create Kiosk Link
          </button>
        </div>
      </div>
      <table style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Link</th>
            <th>Expires</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {kioskLinks.map(l => {
            const path = `/kiosk/${l.cryptoToken}`;
            const fullUrl = `${window.location.origin}${path}`;
            return (
              <tr key={l.id}>
                <td><span className="badge badge-member">KIOSK</span></td>
                <td style={{ maxWidth: 360, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <a href={path} target="_blank" rel="noreferrer">{fullUrl}</a>
                </td>
                <td>{new Date(l.expiresAt).toLocaleString()}</td>
                <td>
                  <div className="actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigator.clipboard.writeText(fullUrl)}
                    >
                      Copy
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => onRevoke(l.id)}>
                      Revoke
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {kioskLinks.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                No active kiosk links
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
