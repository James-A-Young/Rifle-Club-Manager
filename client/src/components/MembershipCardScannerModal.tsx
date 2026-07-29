import { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { api } from '../api';
import { SimpleFirearm } from '../types/club';

export interface MemberCardPreviewResponse {
  member: {
    id: string;
    name: string;
    email: string;
  };
  userFirearms: SimpleFirearm[];
  memberCardSignInToken: string;
}

interface Props {
  open: boolean;
  signInAccessToken?: string;
  onClose: () => void;
  onPreview: (preview: MemberCardPreviewResponse) => void;
  onDuplicateSignIn: () => void;
}

export default function MembershipCardScannerModal({
  open,
  signInAccessToken,
  onClose,
  onPreview,
  onDuplicateSignIn,
}: Props) {
  const [scanError, setScanError] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const detectingRef = useRef(false);
  const onPreviewRef = useRef(onPreview);
  const onDuplicateSignInRef = useRef(onDuplicateSignIn);

  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  useEffect(() => {
    onDuplicateSignInRef.current = onDuplicateSignIn;
  }, [onDuplicateSignIn]);

  function isRecoverableStartError(message: string) {
    return /(interrupted by a new load request|AbortError|play\(\) request|NotReadableError)/i.test(message);
  }

  function stopScanner() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    if (videoRef.current) {
      const activeStream = videoRef.current.srcObject;
      if (activeStream instanceof MediaStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    detectingRef.current = false;
    setScanLoading(false);
  }

  useEffect(() => {
    if (!open || !signInAccessToken) {
      return;
    }

    let cancelled = false;

    async function startScan() {
      if (!videoRef.current) {
        return;
      }

      stopScanner();
      setScanError('');
      setScanLoading(true);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const scanner = new QrScanner(
            videoRef.current,
            async (result: QrScanner.ScanResult) => {
              if (cancelled || detectingRef.current) {
                return;
              }

              detectingRef.current = true;
              const qrData = result.data.trim();

              try {
                const preview = await api.post<MemberCardPreviewResponse>('/api/visits/kiosk/qr-preview', {
                  qrData,
                  signInAccessToken,
                });

                if (!cancelled) {
                  onPreviewRef.current(preview);
                }
                return;
              } catch (e) {
                const message = e instanceof Error ? e.message : 'Card scan failed';
                if (/already signed in/i.test(message)) {
                  if (!cancelled) {
                    onDuplicateSignInRef.current();
                  }
                  return;
                }
                if (!cancelled) {
                  setScanError(message);
                }
              } finally {
                detectingRef.current = false;
              }
            },
            {
              preferredCamera: 'user',
              highlightScanRegion: true,
              returnDetailedScanResult: true,
            }
          );

          scannerRef.current = scanner;
          await scanner.start();
          setScanLoading(false);
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Camera access failed';
          stopScanner();

          if (attempt === 0 && isRecoverableStartError(message)) {
            continue;
          }

          if (!cancelled) {
            setScanError(message);
          }
          return;
        }
      }

      if (!cancelled) {
        setScanLoading(false);
      }
    }

    startScan();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, signInAccessToken, restartKey]);

  if (!open) {
    return null;
  }

  return (
    <div className="policy-modal-backdrop" onClick={onClose}>
      <div
        className="policy-modal"
        style={{ width: 'min(560px, 100%)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Scan Membership Card"
        onClick={e => e.stopPropagation()}
      >
        <div className="policy-modal-header">
          <h2>Scan Membership Card</h2>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="policy-modal-content">
          <p style={{ marginTop: 0, marginBottom: '1rem' }}>
            Hold the membership QR card in front of the camera.
          </p>
          {scanError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{scanError}</div>}
          <div style={{ border: '1px solid var(--gray-300)', borderRadius: '8px', overflow: 'hidden', background: 'black' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', maxHeight: '360px', objectFit: 'cover', display: 'block' }}
            />
          </div>
          {scanLoading && (
            <p style={{ marginTop: '0.75rem', color: 'var(--gray-600)' }}>
              Starting camera...
            </p>
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRestartKey(prev => prev + 1)}
              disabled={scanLoading}
            >
              Restart Camera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
