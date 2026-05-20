import './setup';

import request from 'supertest';
import { createHmac } from 'crypto';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';

const app = createApp();

const WEBHOOK_SECRET = 'test-webhook-secret-integration';

function buildWebhookSignature(timestamp: number, body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.`)
    .update(Buffer.from(body))
    .digest('hex');
}

async function createUser() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  return prisma.user.create({
    data: {
      name: 'Test Member',
      email: `member-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash,
      gdprConsentDate: new Date(),
      address: '1 Test Street',
      placeOfBirth: 'London',
      dateOfBirth: new Date('1990-01-01'),
    },
  });
}

async function createClubWithAdmin() {
  const admin = await createUser();
  const club = await prisma.club.create({
    data: { name: 'Webhook Test Club', ownerId: admin.id },
  });
  await prisma.clubMembership.create({
    data: {
      userId: admin.id,
      clubId: club.id,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });
  return { admin, club };
}

beforeEach(() => {
  process.env.GOOGLE_WALLET_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.GOOGLE_WALLET_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe('POST /api/webhooks/google-wallet', () => {
  it('returns 400 for invalid JSON payload', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"bad":true}'; // missing eventType
    const sig = buildWebhookSignature(timestamp, body);

    const res = await request(app)
      .post('/api/webhooks/google-wallet')
      .set('Content-Type', 'application/json')
      .set('X-Google-Wallet-Signature', sig)
      .set('X-Google-Wallet-Timestamp', String(timestamp))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid webhook payload/i);
  });

  it('returns 401 when signature is missing', async () => {
    const body = JSON.stringify({ eventType: 'resourceSave', objectId: 'test.obj' });
    const res = await request(app)
      .post('/api/webhooks/google-wallet')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('returns 401 for tampered body', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ eventType: 'resourceSave', objectId: 'test.obj' });
    const sig = buildWebhookSignature(timestamp, body + ' '); // signed different body

    const res = await request(app)
      .post('/api/webhooks/google-wallet')
      .set('Content-Type', 'application/json')
      .set('X-Google-Wallet-Signature', sig)
      .set('X-Google-Wallet-Timestamp', String(timestamp))
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature mismatch/i);
  });

  it('returns 200 and records a resourceSave event', async () => {
    const { club } = await createClubWithAdmin();
    const member = await createUser();
    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    // Pre-create pass metadata so webhook can resolve owner
    const passObjectId = `test-issuer.${club.id}-${member.id}`;
    await prisma.googleWalletPassMetadata.create({
      data: {
        userId: member.id,
        clubId: club.id,
        passObjectId,
        lastIssuedAt: new Date(),
        lastDataFingerprint: 'abc123',
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      eventType: 'resourceSave',
      objectId: passObjectId,
      eventId: `evt-${Date.now()}`,
    });
    const sig = buildWebhookSignature(timestamp, payload);

    const res = await request(app)
      .post('/api/webhooks/google-wallet')
      .set('Content-Type', 'application/json')
      .set('X-Google-Wallet-Signature', sig)
      .set('X-Google-Wallet-Timestamp', String(timestamp))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify webhook event was persisted
    const event = await prisma.googleWalletWebhookEvent.findFirst({
      where: { passObjectId, eventType: 'resourceSave' },
    });
    expect(event).not.toBeNull();
    expect(event?.processedAt).not.toBeNull();

    // Verify lastInstalledAt was updated on metadata
    const meta = await prisma.googleWalletPassMetadata.findUnique({
      where: { userId_clubId: { userId: member.id, clubId: club.id } },
    });
    expect(meta?.lastInstalledAt).not.toBeNull();
  });

  it('returns 200 and marks pass as deleted on resourceDelete event', async () => {
    const { club } = await createClubWithAdmin();
    const member = await createUser();
    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    const passObjectId = `test-issuer.del-${club.id}-${member.id}`;
    await prisma.googleWalletPassMetadata.create({
      data: {
        userId: member.id,
        clubId: club.id,
        passObjectId,
        lastIssuedAt: new Date(),
        lastDataFingerprint: 'def456',
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      eventType: 'resourceDelete',
      objectId: passObjectId,
      eventId: `del-evt-${Date.now()}`,
    });
    const sig = buildWebhookSignature(timestamp, payload);

    const res = await request(app)
      .post('/api/webhooks/google-wallet')
      .set('Content-Type', 'application/json')
      .set('X-Google-Wallet-Signature', sig)
      .set('X-Google-Wallet-Timestamp', String(timestamp))
      .send(payload);

    expect(res.status).toBe(200);

    const meta = await prisma.googleWalletPassMetadata.findUnique({
      where: { userId_clubId: { userId: member.id, clubId: club.id } },
    });
    expect(meta?.lastDeletedAt).not.toBeNull();
  });

  it('deduplicates webhook events with the same eventId', async () => {
    const eventId = `dedup-evt-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      eventType: 'resourceSave',
      objectId: 'some.pass.id',
      eventId,
    });
    const sig = buildWebhookSignature(timestamp, payload);

    const headers = {
      'Content-Type': 'application/json',
      'X-Google-Wallet-Signature': sig,
      'X-Google-Wallet-Timestamp': String(timestamp),
    };

    const res1 = await request(app)
      .post('/api/webhooks/google-wallet')
      .set(headers)
      .send(payload);
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/webhooks/google-wallet')
      .set(headers)
      .send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.deduplicated).toBe(true);

    // Only one event record should exist
    const count = await prisma.googleWalletWebhookEvent.count({ where: { externalEventId: eventId } });
    expect(count).toBe(1);
  });
});
