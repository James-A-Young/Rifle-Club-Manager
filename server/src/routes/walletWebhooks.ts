import { Router, Request, Response } from 'express';
import { MembershipStatus } from '../generated/client.js';
import { prisma } from '../prisma.js';
import { getGoogleWalletService } from '../services/googleWallet.js';

const router = Router();

type WalletEventType = 'save' | 'del';

interface WalletSignedEnvelope {
  protocolVersion?: string;
  signature?: string;
  intermediateSigningKey?: {
    signatures?: string[];
    signedKey?: string;
  };
  signedMessage?: string;
}

interface WalletCallbackMessage {
  classId: string;
  objectId: string;
  expTimeMillis: string | number;
  eventType: WalletEventType;
  nonce: string;
}

function isPlausibleGoogleEnvelope(body: unknown): body is WalletSignedEnvelope {
  if (!body || typeof body !== 'object') return false;
  const envelope = body as WalletSignedEnvelope;
  return Boolean(
    envelope.protocolVersion &&
    envelope.signature &&
    envelope.signedMessage &&
    envelope.intermediateSigningKey?.signedKey,
  );
}

function parseSignedMessage(body: unknown): WalletCallbackMessage | null {
  if (!isPlausibleGoogleEnvelope(body)) return null;
  try {
    const parsed = JSON.parse(body.signedMessage as string) as Partial<WalletCallbackMessage>;
    if (!parsed || typeof parsed !== 'object') return null;

    const eventType = parsed.eventType;
    if (eventType !== 'save' && eventType !== 'del') return null;

    if (!parsed.objectId || !parsed.classId || !parsed.expTimeMillis || !parsed.nonce) {
      return null;
    }

    return {
      classId: parsed.classId,
      objectId: parsed.objectId,
      expTimeMillis: parsed.expTimeMillis,
      eventType,
      nonce: parsed.nonce,
    };
  } catch {
    return null;
  }
}

function isExpired(expTimeMillis: string | number): boolean {
  const value = Number(expTimeMillis);
  if (!Number.isFinite(value)) return true;
  return Date.now() > value;
}

router.post('/google-wallet', async (req: Request, res: Response) => {
  const callbackMessage = parseSignedMessage(req.body);
  if (!callbackMessage) {
    res.status(400).json({ error: 'Invalid callback payload' });
    return;
  }

  if (isExpired(callbackMessage.expTimeMillis)) {
    res.status(400).json({ error: 'Expired callback payload' });
    return;
  }

  const objectId = callbackMessage.objectId;

  if (callbackMessage.eventType === 'del') {
    await prisma.clubMembership.updateMany({
      where: { installedPassId: objectId },
      data: { installedPassId: null },
    });

    res.status(200).json({ ok: true });
    return;
  }

  const existing = await prisma.clubMembership.findFirst({
    where: { installedPassId: objectId },
    select: { id: true },
  });

  if (existing) {
    res.status(200).json({ ok: true });
    return;
  }

  const walletService = getGoogleWalletService();
  const approvedMemberships = await prisma.clubMembership.findMany({
    where: { status: MembershipStatus.APPROVED },
    select: { id: true, userId: true, clubId: true },
  });

  const matchedMembership = approvedMemberships.find((membership) => {
    const expectedObjectId = walletService.buildMembershipObjectId(membership.clubId, membership.userId);
    return expectedObjectId === objectId;
  });

  if (!matchedMembership) {
    res.status(200).json({ ok: true });
    return;
  }

  await prisma.clubMembership.update({
    where: { id: matchedMembership.id },
    data: { installedPassId: objectId },
  });

  res.status(200).json({ ok: true });
});

export default router;
