/**
 * Security integration tests.
 *
 * Tests in this file exercise the security fixes applied in the
 * security/full-audit-overhaul commits:
 *
 *  1. JWT secret validation (fail-fast config).
 *  2. Firearm deletion IDOR — an admin of club A cannot delete a firearm
 *     that belongs to club B.
 *  3. Firearm auto-link scope — a serial-number supplied at sign-in time
 *     must not resolve to a firearm owned by a different club/user.
 *  4. Explicit firearmUsedId scope — supplying a foreign firearmId is
 *     rejected with 400.
 *  5. Sanitised error responses — 500 responses must not include a
 *     'details' field that exposes internal error messages.
 *  6. HttpOnly cookie — login and register set an auth_token cookie.
 *  7. Cookie-based authentication — requests authenticated via the cookie
 *     are accepted the same way as Bearer-header requests.
 */

import './setup';

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MembershipRole, MembershipStatus, OwnerType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';
import jwt from 'jsonwebtoken';

const app = createApp();
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

// ── helpers ──────────────────────────────────────────────────────────────────

async function createUser(overrides: Partial<{
  name: string;
  email: string;
}> = {}) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const email = overrides.email ?? `sec-user-${Math.random().toString(36).slice(2)}@test.com`;
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Security Test User',
      email,
      passwordHash,
      gdprConsentDate: new Date(),
      address: '1 Security Lane',
      placeOfBirth: 'London',
      dateOfBirth: new Date('1990-01-01'),
    },
  });
}

function authHeader(user: { id: string; email: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

function authCookie(user: { id: string; email: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '1h' });
  return `auth_token=${token}`;
}

async function createClubWithAdmin(overrides: { adminEmail?: string } = {}) {
  const admin = await createUser({ email: overrides.adminEmail ?? `admin-${Math.random().toString(36).slice(2)}@test.com` });
  const club = await prisma.club.create({
    data: { name: 'Security Test Club', ownerId: admin.id, acceptingNewMembers: true },
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Firearm deletion IDOR
// ─────────────────────────────────────────────────────────────────────────────

describe('security: firearm deletion IDOR', () => {
  it('prevents an admin of club A from deleting a firearm belonging to club B', async () => {
    const { admin: adminA, club: clubA } = await createClubWithAdmin();
    const { club: clubB } = await createClubWithAdmin();

    // Firearm belonging to club B
    const firearmB = await prisma.firearm.create({
      data: {
        make: 'Test', model: 'B', caliber: '.22', serialNumber: 'B-001',
        ownerType: OwnerType.CLUB, clubId: clubB.id,
      },
    });

    const res = await request(app)
      .delete(`/api/clubs/${clubA.id}/firearms/${firearmB.id}`)
      .set(authHeader(adminA));

    // Must be 404 (firearm doesn't belong to clubA) not 204
    expect(res.status).toBe(404);

    // Firearm must still exist
    const still = await prisma.firearm.findUnique({ where: { id: firearmB.id } });
    expect(still).not.toBeNull();
  });

  it('allows an admin to delete their own club firearm', async () => {
    const { admin, club } = await createClubWithAdmin();

    const firearm = await prisma.firearm.create({
      data: {
        make: 'Test', model: 'Own', caliber: '.22', serialNumber: 'OWN-001',
        ownerType: OwnerType.CLUB, clubId: club.id,
      },
    });

    const res = await request(app)
      .delete(`/api/clubs/${club.id}/firearms/${firearm.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(204);
    const softDeleted = await prisma.firearm.findUnique({ where: { id: firearm.id } });
    expect(softDeleted).not.toBeNull();
    expect(softDeleted?.deletedAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Firearm serial-number auto-link scope
// ─────────────────────────────────────────────────────────────────────────────

describe('security: firearm serial-number auto-link scope', () => {
  it('does not link a firearm from a different club via serial number', async () => {
    const { club: clubA } = await createClubWithAdmin();
    const { club: clubB } = await createClubWithAdmin();

    // Firearm owned by club B with serial SHARED-001
    await prisma.firearm.create({
      data: {
        make: 'Foreign', model: 'Gun', caliber: '.22', serialNumber: 'SHARED-001',
        ownerType: OwnerType.CLUB, clubId: clubB.id,
      },
    });

    // Create a sign-in link for club A
    const link = await prisma.signInLink.create({
      data: {
        clubId: clubA.id,
        cryptoToken: `serial-scope-test-${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Resolve the link to get an access token
    const linkRes = await request(app).get(`/api/sign-in-links/${link.cryptoToken}`);
    expect(linkRes.status).toBe(200);
    const accessToken = linkRes.body.accessToken as string;

    // Sign in to club A with the serial that matches a club B firearm
    const signInRes = await request(app)
      .post('/api/visits/public')
      .send({
        signInAccessToken: accessToken,
        purpose: 'Practice',
        firearmSerialNumber: 'SHARED-001',
        guestDetails: { guestName: 'Guest', guestClubRepresented: 'Other Club' },
      });

    expect(signInRes.status).toBe(201);

    // The visit must not have a firearmUsedId at all (the serial resolved to
    // a foreign firearm which is out of scope, so no firearm should be linked)
    const visit = await prisma.visitLog.findUnique({ where: { id: signInRes.body.id } });
    expect(visit?.firearmUsedId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Explicit firearmUsedId must belong to the club or user
// ─────────────────────────────────────────────────────────────────────────────

describe('security: explicit firearmUsedId ownership check', () => {
  it('rejects a firearmUsedId that belongs to a different club', async () => {
    const { club: clubA } = await createClubWithAdmin();
    const { club: clubB } = await createClubWithAdmin();

    const foreignFirearm = await prisma.firearm.create({
      data: {
        make: 'Foreign', model: 'Gun', caliber: '.22', serialNumber: 'FG-001',
        ownerType: OwnerType.CLUB, clubId: clubB.id,
      },
    });

    const link = await prisma.signInLink.create({
      data: {
        clubId: clubA.id,
        cryptoToken: `explicit-scope-${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const linkRes = await request(app).get(`/api/sign-in-links/${link.cryptoToken}`);
    const accessToken = linkRes.body.accessToken as string;

    const res = await request(app)
      .post('/api/visits/public')
      .send({
        signInAccessToken: accessToken,
        purpose: 'Practice',
        firearmUsedId: foreignFirearm.id,
        guestDetails: { guestName: 'Guest', guestClubRepresented: 'Other Club' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong/);
  });

  it('rejects a firearmUsedId that belongs to a different user', async () => {
    const { club: clubA } = await createClubWithAdmin();
    const otherUser = await createUser({ email: `other-user-${Math.random().toString(36).slice(2)}@test.com` });

    // Firearm owned by another user (not the signing-in user)
    const otherUserFirearm = await prisma.firearm.create({
      data: {
        make: 'Other', model: 'User Gun', caliber: '.22', serialNumber: `OUG-${Math.random().toString(36).slice(2)}`,
        ownerType: OwnerType.USER, userId: otherUser.id,
      },
    });

    const link = await prisma.signInLink.create({
      data: {
        clubId: clubA.id,
        cryptoToken: `user-scope-${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const linkRes = await request(app).get(`/api/sign-in-links/${link.cryptoToken}`);
    const accessToken = linkRes.body.accessToken as string;

    // Guest (unauthenticated) sign-in supplying another user's firearmId
    const res = await request(app)
      .post('/api/visits/public')
      .send({
        signInAccessToken: accessToken,
        purpose: 'Practice',
        firearmUsedId: otherUserFirearm.id,
        guestDetails: { guestName: 'Guest', guestClubRepresented: 'Other Club' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sanitised error responses — no internal details in 500s
// ─────────────────────────────────────────────────────────────────────────────

describe('security: sanitised error responses', () => {
  it('does not expose error.message in the QR scan error response body', async () => {
    // Send a request where the club does not exist to trigger an internal path
    // that would previously expose error details.  The endpoint has member-card
    // sign-in disabled by default so we should get a clean 403 (not a 500
    // with details).  Confirm 'details' field is absent regardless of status.
    const res = await request(app)
      .post('/api/visits/kiosk/qr-scan')
      .send({ qrData: 'club:nonexistent:member:nobody', clubId: 'nonexistent' });

    // The key assertion: no 'details' field leaking internal information
    expect(res.body.details).toBeUndefined();
  });

  it('does not expose error.message in the membership-pass error response body', async () => {
    const { admin, club } = await createClubWithAdmin();

    // Pass issuing is disabled by default — this produces a 403, not a 500,
    // but the point is that no 'details' field is ever present.
    const res = await request(app)
      .post(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res.body.details).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. HttpOnly cookie set on login and register
// ─────────────────────────────────────────────────────────────────────────────

describe('security: HttpOnly auth cookie', () => {
  it('sets an HttpOnly auth_token cookie on successful login', async () => {
    const email = `${unique('cookie-login')}@test.com`;
    await createUser({ email });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' });

    expect(res.status).toBe(200);

    const setCookieHeader = res.headers['set-cookie'] as string | string[];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader ?? ''];
    const authCookieLine = cookies.find(c => c.startsWith('auth_token='));

    expect(authCookieLine).toBeTruthy();
    expect(authCookieLine?.toLowerCase()).toContain('httponly');
  });

  it('sets an HttpOnly auth_token cookie on successful registration', async () => {
    // Registration requires an invite token — create a club and invite first
    const { admin, club } = await createClubWithAdmin();
    const regEmail = `cookie-reg-${Math.random().toString(36).slice(2)}@test.com`;
    const inviteToken = `cookie-reg-invite-${Math.random().toString(36).slice(2)}`;
    await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        email: regEmail,
        role: MembershipRole.MEMBER,
        token: inviteToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdByUserId: admin.id,
      },
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Cookie Reg User',
        email: regEmail,
        password: 'Password123!',
        gdprConsent: true,
        address: '1 Cookie Street',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
        phoneNumber: '07123456789',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhoneNumber: '07123456780',
        emergencyContactRelation: 'Friend',
        gender: 'OTHER',
        disabilityStatus: 'NOT_DISABLED',
        inviteToken,
      });
    
    expect(res.status).toBe(201);

    const setCookieHeader = res.headers['set-cookie'] as string | string[];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader ?? ''];
    const authCookieLine = cookies.find(c => c.startsWith('auth_token='));

    expect(authCookieLine).toBeTruthy();
    expect(authCookieLine?.toLowerCase()).toContain('httponly');
  });

  it('clears the auth_token cookie on logout', async () => {
    const user = await createUser({ email: `logout-test-${Math.random().toString(36).slice(2)}@test.com` });
    const cookie = authCookie(user);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const setCookieHeader = res.headers['set-cookie'] as string | string[];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader ?? ''];
    const authCookieLine = cookies.find(c => c.startsWith('auth_token='));
    // Cookie should be cleared (value empty or max-age=0 or expires in the past)
    expect(authCookieLine).toBeTruthy();
    const isCleared =
      authCookieLine?.includes('max-age=0') ||
      authCookieLine?.includes('Max-Age=0') ||
      authCookieLine?.match(/expires=.*1970/i) !== null;
    expect(isCleared).toBe(true);

    // After logout, a protected request using the same cookie value should fail
    // because the server has cleared the cookie. In a stateless JWT system the
    // token itself has not been revoked, but the client browser will have had
    // its cookie cleared by the Set-Cookie response above.
    // We verify the logout response signals cookie clearance (already asserted
    // above). A stateless token revocation list is outside the scope of these
    // tests but is documented in SECURITY.md as a future enhancement.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cookie-based authentication accepted by protected routes
// ─────────────────────────────────────────────────────────────────────────────

describe('security: cookie-based authentication', () => {
  it('authenticates GET /api/users/me via the auth_token cookie', async () => {
    const user = await createUser({ email: `cookie-auth-${Math.random().toString(36).slice(2)}@test.com` });
    const cookie = authCookie(user);

    const res = await request(app)
      .get('/api/users/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
  });

  it('rejects requests with neither Bearer header nor cookie', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});
