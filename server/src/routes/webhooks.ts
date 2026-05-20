import { Router, Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { markPassInstalled, markPassDeleted } from '../services/googleWalletPassMetadata';

const router = Router();

// ---------------------------------------------------------------------------
// Signature validation middleware
// ---------------------------------------------------------------------------

/**
 * Google Wallet webhook HMAC-SHA256 signature validation.
 *
 * Google includes an X-Google-Wallet-Signature header computed as:
 *   HMAC-SHA256(secret, timestamp + "." + body)
 *
 * The secret is the value of GOOGLE_WALLET_WEBHOOK_SECRET env var.
 * The timestamp is carried in the X-Google-Wallet-Timestamp header.
 *
 * Requests more than 5 minutes old are rejected to prevent replay attacks.
 */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

function validateWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.GOOGLE_WALLET_WEBHOOK_SECRET;

  if (!secret) {
    // If no secret is configured, skip validation (useful for initial setup /
    // testing, but log a warning so operators are aware).
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'WALLET_WEBHOOK_NO_SECRET',
        warn: 'GOOGLE_WALLET_WEBHOOK_SECRET is not set; skipping signature validation',
      })
    );
    next();
    return;
  }

  const signature = req.headers['x-google-wallet-signature'];
  const timestampHeader = req.headers['x-google-wallet-timestamp'];

  if (typeof signature !== 'string' || typeof timestampHeader !== 'string') {
    res.status(401).json({ error: 'Missing webhook signature headers' });
    return;
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    res.status(401).json({ error: 'Invalid webhook timestamp' });
    return;
  }

  const age = Date.now() - timestamp * 1000;
  if (age < 0 || age > MAX_TIMESTAMP_AGE_MS) {
    res.status(401).json({ error: 'Webhook timestamp is too old or in the future' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: 'Raw body not available for signature verification' });
    return;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(rawBody)
    .digest('hex');

  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(signature, 'hex');
    expBuf = Buffer.from(expected, 'hex');
  } catch {
    res.status(401).json({ error: 'Malformed webhook signature' });
    return;
  }

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    res.status(401).json({ error: 'Webhook signature mismatch' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Payload schema
// ---------------------------------------------------------------------------

const walletWebhookPayloadSchema = z.object({
  // Google Wallet uses a unique event ID for idempotency
  eventId: z.string().min(1).optional(),
  objectId: z.string().optional(),
  expTimeMillis: z.number().optional(),
  // resourceSave | resourceDelete | resourceExpiration
  eventType: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function extractPassObjectId(objectId: string | undefined): string | null {
  if (!objectId) return null;
  return objectId;
}

/**
 * Derive userId and clubId from the passObjectId stored in GoogleWalletPassMetadata.
 */
async function resolvePassOwner(
  passObjectId: string
): Promise<{ userId: string; clubId: string } | null> {
  const meta = await prisma.googleWalletPassMetadata.findUnique({
    where: { passObjectId },
    select: { userId: true, clubId: true },
  });
  return meta ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/google-wallet
// ---------------------------------------------------------------------------

router.post(
  '/google-wallet',
  validateWebhookSignature,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = walletWebhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    const { eventType, objectId, eventId } = parsed.data;
    const passObjectId = extractPassObjectId(objectId);

    // Use eventId from payload if present; otherwise derive one from objectId + eventType + time
    const externalEventId =
      eventId ??
      `${passObjectId ?? 'unknown'}:${eventType}:${Date.now()}`;

    // Idempotency check — silently accept duplicates
    const existing = await prisma.googleWalletWebhookEvent.findUnique({
      where: { externalEventId },
      select: { id: true },
    });
    if (existing) {
      res.status(200).json({ ok: true, deduplicated: true });
      return;
    }

    // Resolve pass owner from metadata (best-effort; may not exist yet)
    const owner = passObjectId ? await resolvePassOwner(passObjectId) : null;

    // Persist the raw event
    await prisma.googleWalletWebhookEvent.create({
      data: {
        externalEventId,
        passObjectId,
        clubId: owner?.clubId ?? null,
        userId: owner?.userId ?? null,
        eventType,
        rawPayload: req.body as object,
      },
    });

    // Handle each event type
    if (passObjectId) {
      switch (eventType) {
        case 'resourceSave':
          await markPassInstalled(passObjectId);
          break;

        case 'resourceDelete':
          await markPassDeleted(passObjectId);
          break;

        case 'resourceExpiration':
          // Mark as deleted so the pass is re-issued when membership renews.
          await markPassDeleted(passObjectId);
          break;

        default:
          // Unknown event type — logged via the event record; no action needed.
          break;
      }
    }

    // Mark event as processed
    await prisma.googleWalletWebhookEvent.update({
      where: { externalEventId },
      data: { processedAt: new Date() },
    });

    res.status(200).json({ ok: true });
  }
);

export default router;
