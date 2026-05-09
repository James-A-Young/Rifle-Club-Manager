import { QRCodeSVG } from 'qrcode.react';

interface Props {
  url: string;
  clubName: string;
}

export default function QRCodeDisplay({ url, clubName }: Props) {
  return (
    <div className="qr-container">
      <h3>Sign-In QR Code for {clubName}</h3>
      <QRCodeSVG value={url} size={200} />
      <p className="link-text">{url}</p>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => navigator.clipboard.writeText(url)}
      >
        Copy Link
      </button>
    </div>
  );
}
