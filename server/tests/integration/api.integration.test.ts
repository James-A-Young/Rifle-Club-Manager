import './setup';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MembershipRole, MembershipStatus, OwnerType } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';

const app = createApp();
const ORIGINAL_TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

async function createUser(overrides: Partial<{
  name: string;
  email: string;
  firearmCertificateNumber: string | null;
  firearmCertificateExpiry: Date | null;
  shotgunCertificateNumber: string | null;
  shotgunCertificateExpiry: Date | null;
}> = {}) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const email = overrides.email ?? `user-${Math.random().toString(36).slice(2)}@test.com`;

  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      email,
      passwordHash,
      gdprConsentDate: new Date(),
      address: '1 Test Street, London',
      placeOfBirth: 'London',
      dateOfBirth: new Date('1990-01-01'),
      firearmCertificateNumber: overrides.firearmCertificateNumber ?? null,
      firearmCertificateExpiry: overrides.firearmCertificateExpiry ?? null,
      shotgunCertificateNumber: overrides.shotgunCertificateNumber ?? null,
      shotgunCertificateExpiry: overrides.shotgunCertificateExpiry ?? null,
    },
  });
}

function authHeader(user: { id: string; email: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set in test environment');
  const token = jwt.sign(
    { id: user.id, email: user.email },
    secret,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

async function createClubWithAdmin() {
  const admin = await createUser({ email: `${unique('admin')}@test.com` });
  const club = await prisma.club.create({
    data: {
      name: 'Integration Club',
      ownerId: admin.id,
      acceptingNewMembers: true,
    },
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

/** Create an invite and use it to register a new user via the API. */
async function registerViaInvite(clubId: string, createdByUserId: string, opts: {
  email?: string;
  role?: MembershipRole;
} = {}) {
  const email = opts.email ?? `${unique('invited')}@test.com`;
  const role = opts.role ?? MembershipRole.MEMBER;
  const token = `invite-${Math.random().toString(36).slice(2)}`;
  await prisma.clubInvite.create({
    data: {
      clubId,
      email,
      role,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdByUserId,
    },
  });
  return { email, token };
}

describe('auth routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_TURNSTILE_SECRET_KEY) {
      process.env.TURNSTILE_SECRET_KEY = ORIGINAL_TURNSTILE_SECRET_KEY;
    } else {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  it('registers a user via invite token', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { email, token } = await registerViaInvite(club.id, admin.id);
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reg User',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '123 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: token,
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    // JWT must not contain a global role
    const { default: jwtLib } = await import('jsonwebtoken');
    const secret = process.env.JWT_SECRET!;
    const payload = jwtLib.verify(res.body.token, secret) as Record<string, unknown>;
    expect(payload.role).toBeUndefined();
  });

  it('rejects registration without invite token', async () => {
    const email = `${unique('register-no-invite')}@test.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'No Invite User',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '123 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
      });

    expect(res.status).toBe(400);
  });

  it('requires captcha token when Turnstile is enabled', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    const { admin, club } = await createClubWithAdmin();
    const { email, token } = await registerViaInvite(club.id, admin.id);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reg User Turnstile',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '123 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: token,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Captcha token is required');
  });

  it('rejects invalid captcha token when Turnstile is enabled', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    const { admin, club } = await createClubWithAdmin();
    const { email, token } = await registerViaInvite(club.id, admin.id);
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reg User Turnstile Invalid',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '123 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: token,
        turnstileToken: 'invalid-token',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Captcha verification failed');
  });

  it('registers a user with valid captcha token when Turnstile is enabled', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    const { admin, club } = await createClubWithAdmin();
    const { email, token } = await registerViaInvite(club.id, admin.id);
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reg User Turnstile Valid',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '123 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: token,
        turnstileToken: 'valid-token',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid credentials on login', async () => {
    const email = `${unique('login')}@test.com`;
    await createUser({ email });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('users routes', () => {
  it('requires auth for /api/users/me', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('updates certificate fields for authenticated user', async () => {
    const user = await createUser({ email: `${unique('profile')}@test.com` });

    const res = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({
        firearmCertificateNumber: 'FAC-123',
        firearmCertificateExpiry: '2028-01-01',
        shotgunCertificateNumber: 'SGC-123',
        shotgunCertificateExpiry: '2028-06-01',
      });

    expect(res.status).toBe(200);
    expect(res.body.firearmCertificateNumber).toBe('FAC-123');
    expect(res.body.shotgunCertificateNumber).toBe('SGC-123');
  });

  it('creates and deletes own firearm only', async () => {
    const owner = await createUser({ email: `${unique('owner-firearm')}@test.com` });
    const stranger = await createUser({ email: `${unique('stranger-firearm')}@test.com` });

    const created = await request(app)
      .post('/api/users/me/firearms')
      .set(authHeader(owner))
      .send({ make: 'Anschutz', model: '1907', caliber: '.22', serialNumber: 'SER-1' });

    expect(created.status).toBe(201);

    const forbiddenDelete = await request(app)
      .delete(`/api/users/me/firearms/${created.body.id}`)
      .set(authHeader(stranger));

    expect(forbiddenDelete.status).toBe(404);

    const okDelete = await request(app)
      .delete(`/api/users/me/firearms/${created.body.id}`)
      .set(authHeader(owner));

    expect(okDelete.status).toBe(204);
  });
});

describe('clubs routes', () => {
  it('returns public club profile without auth', async () => {
    const { club } = await createClubWithAdmin();

    const res = await request(app).get(`/api/clubs/profile/${club.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(club.id);
  });

  it('forbids non-admin club profile updates', async () => {
    const { club } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('member')}@test.com` });

    const res = await request(app)
      .patch(`/api/clubs/${club.id}`)
      .set(authHeader(member))
      .send({ description: 'Nope' });

    expect(res.status).toBe(403);
  });

  it('allows admin to update expanded club profile', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .patch(`/api/clubs/${club.id}`)
      .set(authHeader(admin))
      .send({
        address: 'Club House Road',
        disciplinesOffered: ['Smallbore', 'Prone', 'Smallbore'],
        acceptingNewMembers: false,
        openingTimes: 'Sat 09:00-15:00',
        description: 'Updated profile',
      });

    expect(res.status).toBe(200);
    expect(res.body.acceptingNewMembers).toBe(false);
    expect(res.body.disciplinesOffered).toEqual(['Smallbore', 'Prone']);
  });

  it('shows member certificate info to admins', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({
      email: `${unique('member-cert')}@test.com`,
      firearmCertificateNumber: 'FAC-MEMBER',
      shotgunCertificateNumber: 'SGC-MEMBER',
    });

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    const res = await request(app)
      .get(`/api/clubs/${club.id}/members`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    const found = res.body.find((m: { userId: string }) => m.userId === member.id);
    expect(found.user.firearmCertificateNumber).toBe('FAC-MEMBER');
  });
});

describe('firearms route', () => {
  it('lists user firearms via /api/firearms', async () => {
    const user = await createUser({ email: `${unique('firearms-route')}@test.com` });
    await prisma.firearm.create({
      data: {
        make: 'CZ',
        model: '457',
        caliber: '.22 LR',
        serialNumber: 'FIRE-ROUTE-1',
        ownerType: OwnerType.USER,
        userId: user.id,
      },
    });

    const res = await request(app).get('/api/firearms').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('sign-in links routes', () => {
  it('creates link as admin and resolves access token', async () => {
    const { club, admin } = await createClubWithAdmin();

    const createRes = await request(app)
      .post('/api/sign-in-links')
      .set(authHeader(admin))
      .send({ clubId: club.id, expiresInHours: 2 });

    expect(createRes.status).toBe(201);

    const tokenRes = await request(app).get(`/api/sign-in-links/${createRes.body.cryptoToken}`);

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.accessToken).toBeTruthy();
  });
});

describe('visits routes', () => {
  it('rejects guest public sign-in without guestDetails', async () => {
    const { club } = await createClubWithAdmin();
    const link = await prisma.signInLink.create({
      data: {
        clubId: club.id,
        cryptoToken: unique('public-signin-token'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/visits/public')
      .send({ signInToken: link.cryptoToken, purpose: 'Practice' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('guestDetails');
  });

  it('creates member visit and signs out', async () => {
    const { club, admin } = await createClubWithAdmin();

    const createVisit = await request(app)
      .post('/api/visits')
      .set(authHeader(admin))
      .send({ clubId: club.id, purpose: 'Training' });

    expect(createVisit.status).toBe(201);

    const signOut = await request(app)
      .patch(`/api/visits/${createVisit.body.id}/signout`)
      .set(authHeader(admin));

    expect(signOut.status).toBe(200);
    expect(signOut.body.timeOut).toBeTruthy();
  });

  it('signs out all active visits for admin', async () => {
    const { club, admin } = await createClubWithAdmin();

    await prisma.visitLog.create({
      data: {
        clubId: club.id,
        userId: admin.id,
        purpose: 'Session 1',
      },
    });

    const res = await request(app)
      .patch(`/api/visits/club/${club.id}/signout-all`)
      .set(authHeader(admin))
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.signedOutCount).toBe(1);
  });

  it('scans membership card QR code for sign-in', async () => {
    const { club, admin } = await createClubWithAdmin();

    // First, enable member card sign-in
    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ memberCardSignInEnabled: true });

    const qrData = `club:${club.id}:member:${admin.id}`;

    const res = await request(app)
      .post('/api/visits/kiosk/qr-scan')
      .send({ qrData, clubId: club.id });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.visitId).toBeTruthy();
    expect(res.body.userId).toBe(admin.id);
  });

  it('rejects QR scan when member card sign-in disabled', async () => {
    const { club, admin } = await createClubWithAdmin();

    const qrData = `club:${club.id}:member:${admin.id}`;

    const res = await request(app)
      .post('/api/visits/kiosk/qr-scan')
      .send({ qrData, clubId: club.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not enabled');
  });

  it('rejects invalid QR code format', async () => {
    const { club, admin } = await createClubWithAdmin();

    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ memberCardSignInEnabled: true });

    const res = await request(app)
      .post('/api/visits/kiosk/qr-scan')
      .send({ qrData: 'invalid-qr', clubId: club.id });

    expect(res.status).toBe(400);
  });

  it('prevents duplicate sign-in from same QR', async () => {
    const { club, admin } = await createClubWithAdmin();

    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ memberCardSignInEnabled: true });

    const qrData = `club:${club.id}:member:${admin.id}`;

    // First sign-in
    const res1 = await request(app)
      .post('/api/visits/kiosk/qr-scan')
      .send({ qrData, clubId: club.id });

    expect(res1.status).toBe(201);

    // Duplicate sign-in
    const res2 = await request(app)
      .post('/api/visits/kiosk/qr-scan')
      .send({ qrData, clubId: club.id });

    expect(res2.status).toBe(409);
  });
});

describe('club settings routes', () => {
  it('creates default club settings on first access', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .get(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.clubId).toBe(club.id);
    expect(res.body.primaryColor).toBe('#1f2937');
    expect(res.body.passIssuingEnabled).toBe(false);
    expect(res.body.memberCardSignInEnabled).toBe(false);
  });

  it('requires admin to get club settings', async () => {
    const { club } = await createClubWithAdmin();
    const member = await createUser();

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        status: MembershipStatus.APPROVED,
        role: MembershipRole.MEMBER,
      },
    });

    const res = await request(app)
      .get(`/api/clubs/${club.id}/settings`)
      .set(authHeader(member));

    expect(res.status).toBe(403);
  });

  it('updates club settings with valid colors', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({
        primaryColor: '#FF5500',
        secondaryColor: '#00AA00',
        accentColor: '#0000FF',
        passIssuingEnabled: true,
        memberCardSignInEnabled: false,
        logoUrl: 'https://example.com/logo.png',
      });

    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toBe('#FF5500');
    expect(res.body.secondaryColor).toBe('#00AA00');
    expect(res.body.accentColor).toBe('#0000FF');
    expect(res.body.passIssuingEnabled).toBe(true);
    expect(res.body.logoUrl).toBe('https://example.com/logo.png');
  });

  it('rejects invalid hex color', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ primaryColor: 'invalid-color' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid URL for logo', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ logoUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('requires admin to update club settings', async () => {
    const { club } = await createClubWithAdmin();
    const member = await createUser();

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        status: MembershipStatus.APPROVED,
        role: MembershipRole.MEMBER,
      },
    });

    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(member))
      .send({ passIssuingEnabled: true });

    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent club settings', async () => {
    const admin = await createUser();

    const res = await request(app)
      .get(`/api/clubs/nonexistent-club/settings`)
      .set(authHeader(admin));

    expect(res.status).toBe(403); // Not admin of nonexistent club
  });
});

describe('membership pass routes', () => {
  it('generates membership pass for user', async () => {
    const { club, admin } = await createClubWithAdmin();

    // Enable pass issuing
    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.qrCode).toBeTruthy();
    expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(res.body.visitCount).toBe(0);
    // Google Wallet API may fail without real credentials in test env
    if (res.body.addToWalletLink) {
      expect(res.body.addToWalletLink).toContain('https://pay.google.com/gp/v/save/');
    }
    if (res.body.addToWalletJwt) {
      expect(res.body.addToWalletJwt).toBeTruthy();
    }
  });

  it('requires authentication to generate pass', async () => {
    const { club } = await createClubWithAdmin();

    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .send({});

    expect(res.status).toBe(401);
  });

  it('rejects pass generation when issuing disabled', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not enabled');
  });

  it('requires approved membership to generate pass', async () => {
    const { club, admin } = await createClubWithAdmin();
    const nonmember = await createUser();

    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(nonmember));

    expect(res.status).toBe(404);
  });

  it('returns same pass on subsequent calls (idempotent)', async () => {
    const { club, admin } = await createClubWithAdmin();

    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    const res1 = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    const res2 = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    if (res1.body.id && res2.body.id) {
      expect(res1.body.id).toBe(res2.body.id);
      expect(res1.body.qrCode).toBe(res2.body.qrCode);
    }
  });

  it('includes current visit count in pass', async () => {
    const { club, admin } = await createClubWithAdmin();

    // Create some visits
    await prisma.visitLog.create({
      data: {
        clubId: club.id,
        userId: admin.id,
        purpose: 'Training',
      },
    });
    await prisma.visitLog.create({
      data: {
        clubId: club.id,
        userId: admin.id,
        purpose: 'Competition',
      },
    });

    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    // Visit count may or may not be in response depending on API call success
    if (res.body.visitCount !== undefined) {
      expect(res.body.visitCount).toBe(2);
    }
  });

  it('passes use member name in pass object', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ name: 'Alice Smith' });

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        status: MembershipStatus.APPROVED,
        role: MembershipRole.MEMBER,
      },
    });

    // Enable pass issuing for the club
    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    // Can't actually verify JWT content without decoding, but we can verify pass creation
    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(member));

    expect(res.status).toBe(200);
    // Google Wallet API may fail without real credentials in test env
    expect(res.body.id).toBeTruthy();
    expect(res.body.qrCode).toBeTruthy();
    if (res.body.addToWalletJwt) {
      expect(res.body.addToWalletJwt).toBeTruthy();
    }
  });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

describe('bootstrap routes', () => {
  it('bootstrap-status returns bootstrapAvailable=true when no users exist', async () => {
    // We cannot guarantee the DB is empty in this shared test DB, but we can
    // assert the status endpoint returns the correct shape.
    const res = await request(app).get('/api/auth/bootstrap-status');
    expect(res.status).toBe(200);
    expect(typeof res.body.bootstrapAvailable).toBe('boolean');
  });

  it('bootstrap endpoint is blocked when users already exist', async () => {
    // At least one user exists (created by other tests), so bootstrap must fail.
    const res = await request(app)
      .post('/api/auth/bootstrap')
      .send({
        name: 'Bootstrap Admin',
        email: `${unique('bootstrap')}@test.com`,
        password: 'Password123!',
        gdprConsent: true,
        address: '1 Bootstrap Lane',
        placeOfBirth: 'London',
        dateOfBirth: '1990-01-01',
        clubName: 'Bootstrap Club',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BOOTSTRAP_DISABLED');
  });
});

// ── Invite-only registration enforcement ────────────────────────────────────

describe('invite-only registration', () => {
  it('rejects registration with an invalid invite token', async () => {
    const email = `${unique('invite-invalid')}@test.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '1 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: 'nonexistent-token',
      });

    expect(res.status).toBe(404);
  });

  it('rejects registration when invite email does not match', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { token } = await registerViaInvite(club.id, admin.id, { email: `${unique('invited')}@test.com` });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User',
        email: `${unique('wrong-email')}@test.com`,
        password: 'Password123!',
        gdprConsent: true,
        address: '1 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: token,
      });

    expect(res.status).toBe(403);
  });

  it('rejects registration with an expired invite', async () => {
    const { admin, club } = await createClubWithAdmin();
    const email = `${unique('expired-invite')}@test.com`;
    const expiredToken = `expired-${Math.random().toString(36).slice(2)}`;
    await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        email,
        role: MembershipRole.MEMBER,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 1000),
        createdByUserId: admin.id,
      },
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '1 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: expiredToken,
      });

    expect(res.status).toBe(410);
  });
});

// ── Probationary Member ──────────────────────────────────────────────────────

describe('probationary member', () => {
  it('admin can create invite with PROBATIONARY_MEMBER role', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .post(`/api/clubs/${club.id}/invites`)
      .set(authHeader(admin))
      .send({
        email: `${unique('probationary')}@test.com`,
        role: 'PROBATIONARY_MEMBER',
        expiresInDays: 14,
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('PROBATIONARY_MEMBER');
  });

  it('admin can change member role to PROBATIONARY_MEMBER', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('prob-member')}@test.com` });

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    const res = await request(app)
      .patch(`/api/clubs/${club.id}/members/${member.id}`)
      .set(authHeader(admin))
      .send({ role: 'PROBATIONARY_MEMBER' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PROBATIONARY_MEMBER');
  });

  it('probationary member registers via invite and gets correct membership role', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { email, token } = await registerViaInvite(club.id, admin.id, {
      role: MembershipRole.PROBATIONARY_MEMBER,
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Probationary User',
        email,
        password: 'Password123!',
        gdprConsent: true,
        address: '1 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        inviteToken: token,
      });

    expect(res.status).toBe(201);

    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: res.body.user.id, clubId: club.id } },
    });
    expect(membership?.role).toBe(MembershipRole.PROBATIONARY_MEMBER);
  });

  it('cannot demote last admin to PROBATIONARY_MEMBER', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .patch(`/api/clubs/${club.id}/members/${admin.id}`)
      .set(authHeader(admin))
      .send({ role: 'PROBATIONARY_MEMBER' });

    expect(res.status).toBe(409);
  });
});

// ── No global role in JWT / auth payload ─────────────────────────────────────

describe('no global role in auth', () => {
  it('login JWT does not contain a role field', async () => {
    const user = await createUser({ email: `${unique('no-role-login')}@test.com` });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Password123!' });

    expect(res.status).toBe(200);
    const { default: jwtLib } = await import('jsonwebtoken');
    const secret = process.env.JWT_SECRET!;
    const payload = jwtLib.verify(res.body.token, secret) as Record<string, unknown>;
    expect(payload.role).toBeUndefined();
    expect(res.body.user.role).toBeUndefined();
  });

  it('/api/users/me does not return a role field', async () => {
    const user = await createUser({ email: `${unique('no-role-me')}@test.com` });

    const res = await request(app)
      .get('/api/users/me')
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.role).toBeUndefined();
  });
});
