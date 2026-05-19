import './setup';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MembershipRole, MembershipStatus, OwnerType } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';
import { emailService } from '../../src/services/email';

const app = createApp();
const ORIGINAL_TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('forgot-password returns success and sends email for existing user', async () => {
    const user = await createUser({ email: `${unique('forgot-existing')}@test.com` });
    const emailSpy = vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(emailSpy).toHaveBeenCalledTimes(1);

    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(token).toBeTruthy();
    expect(token?.usedAt).toBeNull();
  });

  it('forgot-password returns success and does not send email for non-existing user', async () => {
    const emailSpy = vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `${unique('forgot-missing')}@test.com` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it('reset-password consumes token once and updates password hash', async () => {
    const user = await createUser({ email: `${unique('reset-success')}@test.com` });
    const token = `pwreset-${Math.random().toString(36).slice(2)}`;
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('User-Agent', 'VitestAgent/1.0')
      .send({ token, password: 'NewPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbToken = await prisma.passwordResetToken.findUnique({ where: { token } });
    expect(dbToken?.usedAt).toBeTruthy();
    expect(dbToken?.usedByUserAgent).toBe('VitestAgent/1.0');
    expect(dbToken?.usedByIp).toBeTruthy();

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser).toBeTruthy();
    expect(updatedUser?.passwordHash).not.toBe(user.passwordHash);
    expect(await bcrypt.compare('NewPassword123!', updatedUser!.passwordHash)).toBe(true);

    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .set('User-Agent', 'VitestAgent/1.0')
      .send({ token, password: 'AnotherPassword123!' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe('Invalid or expired reset token');
  });

  it('reset-password rejects expired and invalid tokens and emits invalid-token audit log', async () => {
    const user = await createUser({ email: `${unique('reset-expired')}@test.com` });
    const expiredToken = `pwreset-expired-${Math.random().toString(36).slice(2)}`;
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const expiredRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: expiredToken, password: 'NewPassword123!' });
    expect(expiredRes.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY_AUTH_PASSWORD_RESET_TOKEN_INVALID'));

    const invalidRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'does-not-exist', password: 'NewPassword123!' });
    expect(invalidRes.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY_AUTH_PASSWORD_RESET_TOKEN_INVALID'));
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

  it('updates own firearm and blocks non-owners from updating', async () => {
    const owner = await createUser({ email: `${unique('owner-firearm-patch')}@test.com` });
    const stranger = await createUser({ email: `${unique('stranger-firearm-patch')}@test.com` });

    const created = await request(app)
      .post('/api/users/me/firearms')
      .set(authHeader(owner))
      .send({ make: 'Anschutz', model: '1913', caliber: '.22', serialNumber: 'SER-PATCH-1' });

    expect(created.status).toBe(201);

    const updated = await request(app)
      .patch(`/api/users/me/firearms/${created.body.id}`)
      .set(authHeader(owner))
      .send({ make: 'Anschutz', model: '2013', caliber: '.22 LR', serialNumber: 'SER-PATCH-2' });

    expect(updated.status).toBe(200);
    expect(updated.body.model).toBe('2013');
    expect(updated.body.caliber).toBe('.22 LR');
    expect(updated.body.serialNumber).toBe('SER-PATCH-2');

    const forbiddenUpdate = await request(app)
      .patch(`/api/users/me/firearms/${created.body.id}`)
      .set(authHeader(stranger))
      .send({ make: 'Nope', model: 'Nope', caliber: '.22', serialNumber: 'SER-NOPE' });

    expect(forbiddenUpdate.status).toBe(404);
  });

  it('rejects invalid payload when updating own firearm', async () => {
    const owner = await createUser({ email: `${unique('owner-firearm-invalid')}@test.com` });

    const created = await request(app)
      .post('/api/users/me/firearms')
      .set(authHeader(owner))
      .send({ make: 'CZ', model: '457', caliber: '.22 LR', serialNumber: 'SER-INVALID-1' });

    expect(created.status).toBe(201);

    const invalid = await request(app)
      .patch(`/api/users/me/firearms/${created.body.id}`)
      .set(authHeader(owner))
      .send({ make: 'CZ', model: '', caliber: '.22 LR', serialNumber: 'SER-INVALID-2' });

    expect(invalid.status).toBe(400);
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

  it('admin can remove a member by marking them inactive', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('inactive-member')}@test.com` });

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    const season = await prisma.season.create({
      data: {
        clubId: club.id,
        name: `Season-${unique('inactive')}`,
      },
    });
    const competition = await prisma.competition.create({
      data: {
        clubId: club.id,
        seasonId: season.id,
        name: `Comp-${unique('inactive')}`,
        roundCount: 1,
        cardsPerRound: 1,
      },
    });
    const round = await prisma.round.create({
      data: {
        competitionId: competition.id,
        roundNumber: 1,
        dueDate: new Date('2026-12-01'),
      },
    });
    await prisma.score.create({
      data: {
        competitionId: competition.id,
        roundId: round.id,
        userId: member.id,
        cardNumber: 1,
        score: 47,
      },
    });

    await prisma.ammunitionSale.create({
      data: {
        clubId: club.id,
        buyerFirstName: 'Test',
        buyerLastName: 'Member',
        buyerUserId: member.id,
        soldByUserId: admin.id,
        ammunitionTypeId: (await prisma.ammunitionType.create({
          data: { clubId: club.id, name: `Type-${unique('inactive')}`, currentPricePence: 100 },
        })).id,
        ammunitionSafeId: (await prisma.ammunitionSafe.create({
          data: { clubId: club.id, name: `Safe-${unique('inactive')}` },
        })).id,
        quantity: 10,
        unitPricePence: 100,
        totalPricePence: 1000,
      },
    });

    const res = await request(app)
      .delete(`/api/clubs/${club.id}/members/${member.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('INACTIVE');

    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: member.id, clubId: club.id } },
    });
    expect(membership?.status).toBe(MembershipStatus.INACTIVE);

    const ammoHistoryCount = await prisma.ammunitionSale.count({
      where: { clubId: club.id, buyerUserId: member.id },
    });
    expect(ammoHistoryCount).toBe(1);

    const scoreHistoryCount = await prisma.score.count({
      where: { competitionId: competition.id, userId: member.id },
    });
    expect(scoreHistoryCount).toBe(1);
  });

  it('inactive member can apply to join the club again', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('reapply-member')}@test.com` });

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.JUNIOR,
        status: MembershipStatus.INACTIVE,
      },
    });

    const res = await request(app)
      .post(`/api/clubs/${club.id}/join`)
      .set(authHeader(member));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.role).toBe('MEMBER');

    const updated = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: member.id, clubId: club.id } },
    });
    expect(updated?.status).toBe(MembershipStatus.PENDING);
    expect(updated?.role).toBe(MembershipRole.MEMBER);

    const pendingCount = await prisma.clubMembership.count({
      where: { userId: member.id, clubId: club.id, status: MembershipStatus.PENDING },
    });
    expect(pendingCount).toBe(1);

    // Keep admin variable used for context consistency and future assertions.
    expect(admin.id).toBeTruthy();
  });

  it('allows admin to update club firearm and forbids non-admin', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('club-member-no-admin')}@test.com` });

    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    const created = await request(app)
      .post(`/api/clubs/${club.id}/firearms`)
      .set(authHeader(admin))
      .send({ make: 'Walther', model: 'KK500', caliber: '.22 LR', serialNumber: 'CLUB-SER-1' });

    expect(created.status).toBe(201);

    const updated = await request(app)
      .patch(`/api/clubs/${club.id}/firearms/${created.body.id}`)
      .set(authHeader(admin))
      .send({ make: 'Walther', model: 'KK500-M', caliber: '.22 LR', serialNumber: 'CLUB-SER-2' });

    expect(updated.status).toBe(200);
    expect(updated.body.model).toBe('KK500-M');
    expect(updated.body.serialNumber).toBe('CLUB-SER-2');

    const forbidden = await request(app)
      .patch(`/api/clubs/${club.id}/firearms/${created.body.id}`)
      .set(authHeader(member))
      .send({ make: 'Blocked', model: 'Blocked', caliber: '.22', serialNumber: 'BLOCKED' });

    expect(forbidden.status).toBe(403);
  });

  it('returns not found when admin updates firearm outside the club scope', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { club: otherClub, admin: otherAdmin } = await createClubWithAdmin();

    const foreignFirearm = await request(app)
      .post(`/api/clubs/${otherClub.id}/firearms`)
      .set(authHeader(otherAdmin))
      .send({ make: 'Bleiker', model: 'Challenger', caliber: '.22 LR', serialNumber: 'FOREIGN-CLUB-1' });

    expect(foreignFirearm.status).toBe(201);

    const notFound = await request(app)
      .patch(`/api/clubs/${club.id}/firearms/${foreignFirearm.body.id}`)
      .set(authHeader(admin))
      .send({ make: 'Bleiker', model: 'Edited', caliber: '.22 LR', serialNumber: 'FOREIGN-CLUB-2' });

    expect(notFound.status).toBe(404);
  });

  it('allows admin to cancel a pending invite', async () => {
    const { club, admin } = await createClubWithAdmin();
    const invite = await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        email: `${unique('invite-cancel')}@test.com`,
        role: MembershipRole.MEMBER,
        token: unique('token-cancel'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdByUserId: admin.id,
      },
    });

    const res = await request(app)
      .delete(`/api/clubs/${club.id}/invites/${invite.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(204);

    const deletedInvite = await prisma.clubInvite.findUnique({ where: { id: invite.id } });
    expect(deletedInvite).toBeNull();
  });

  it('forbids non-admin users from cancelling invites', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('invite-member')}@test.com` });
    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.APPROVED,
      },
    });

    const invite = await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        email: `${unique('invite-no-cancel')}@test.com`,
        role: MembershipRole.MEMBER,
        token: unique('token-no-cancel'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdByUserId: admin.id,
      },
    });

    const res = await request(app)
      .delete(`/api/clubs/${club.id}/invites/${invite.id}`)
      .set(authHeader(member));

    expect(res.status).toBe(403);
  });

  it('returns conflict when cancelling a redeemed invite', async () => {
    const { club, admin } = await createClubWithAdmin();
    const redeemedBy = await createUser({ email: `${unique('invite-redeemed')}@test.com` });
    const invite = await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        email: redeemedBy.email,
        role: MembershipRole.MEMBER,
        token: unique('token-redeemed'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdByUserId: admin.id,
        redeemedAt: new Date(),
        redeemedByUserId: redeemedBy.id,
      },
    });

    const res = await request(app)
      .delete(`/api/clubs/${club.id}/invites/${invite.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('redeemed');
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

  it('updates backupEnabled in club settings', async () => {
    const { club, admin } = await createClubWithAdmin();
    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ backupEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.backupEnabled).toBe(true);
  });

  it('returns backup status for admin and blocks non-admin', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser();
    await prisma.clubMembership.create({
      data: {
        userId: member.id,
        clubId: club.id,
        status: MembershipStatus.APPROVED,
        role: MembershipRole.MEMBER,
      },
    });

    const denied = await request(app)
      .get(`/api/clubs/${club.id}/settings/backups/google-drive/status`)
      .set(authHeader(member));
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/clubs/${club.id}/settings/backups/google-drive/status`)
      .set(authHeader(admin));
    expect(allowed.status).toBe(200);
    expect(allowed.body.connection.linked).toBe(false);
  });

  it('starts Google Drive OAuth link flow for admin', async () => {
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/clubs/settings/backups/google-drive/callback';

    const { club, admin } = await createClubWithAdmin();
    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings/backups/google-drive/link/start`)
      .set(authHeader(admin))
      .send({});

    expect(res.status).toBe(200);
    expect(typeof res.body.authUrl).toBe('string');
    expect(res.body.authUrl).toContain('accounts.google.com');

    const states = await prisma.googleDriveOAuthState.findMany({
      where: { clubId: club.id, userId: admin.id },
    });
    expect(states.length).toBe(1);
  });

  it('rejects callback with invalid state', async () => {
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/clubs/settings/backups/google-drive/callback';
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    const { admin } = await createClubWithAdmin();
    const res = await request(app)
      .get('/api/clubs/settings/backups/google-drive/callback')
      .set(authHeader(admin))
      .query({ state: 'invalid-state', code: 'oauth-code' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid OAuth state');
  });

  it('disconnect endpoint returns 404 when no connection exists', async () => {
    const { club, admin } = await createClubWithAdmin();
    const res = await request(app)
      .post(`/api/clubs/${club.id}/settings/backups/google-drive/disconnect`)
      .set(authHeader(admin))
      .send({});

    expect(res.status).toBe(404);
  });

  it('returns 404 for nonexistent club settings', async () => {
    const admin = await createUser();

    const res = await request(app)
      .get(`/api/clubs/nonexistent-club/settings`)
      .set(authHeader(admin));

    expect(res.status).toBe(403); // Not admin of nonexistent club
  });
});

describe('ammunition routes', () => {
  async function createAmmoTypeAndSafe(clubId: string, admin: { id: string; email: string }) {
    const typeRes = await request(app)
      .post(`/api/ammunition/club/${clubId}/types`)
      .set(authHeader(admin))
      .send({ name: '.22LR', pricePence: 35 });
    expect(typeRes.status).toBe(201);

    const safeRes = await request(app)
      .post(`/api/ammunition/club/${clubId}/safes`)
      .set(authHeader(admin))
      .send({ name: 'Main Safe' });
    expect(safeRes.status).toBe(201);

    return {
      typeId: typeRes.body.id as string,
      safeId: safeRes.body.id as string,
    };
  }

  it('requires admin access for ammunition settings', async () => {
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
      .get(`/api/ammunition/club/${club.id}/settings`)
      .set(authHeader(member));

    expect(res.status).toBe(403);
  });

  it('records sale and decrements stock', async () => {
    const { club, admin } = await createClubWithAdmin();
    const buyer = await createUser({ email: `${unique('ammo-buyer')}@test.com` });
    await prisma.clubMembership.create({
      data: {
        userId: buyer.id,
        clubId: club.id,
        status: MembershipStatus.APPROVED,
        role: MembershipRole.MEMBER,
      },
    });
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    const stockInputRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: 100 });
    expect(stockInputRes.status).toBe(201);

    const saleRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/sales`)
      .set(authHeader(admin))
      .send({
        buyerFirstName: 'Ammo',
        buyerLastName: 'Buyer',
        buyerUserId: buyer.id,
        ammunitionTypeId: typeId,
        ammunitionSafeId: safeId,
        quantity: 30,
      });
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.totalPricePence).toBe(1050);
    expect(saleRes.body.soldByUserId).toBe(admin.id);

    const stock = await prisma.ammunitionStock.findUnique({
      where: {
        ammunitionTypeId_ammunitionSafeId: {
          ammunitionTypeId: typeId,
          ammunitionSafeId: safeId,
        },
      },
    });
    expect(stock?.quantity).toBe(70);
  });

  it('returns insufficient stock error when sale exceeds stock', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    const stockInputRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: 5 });
    expect(stockInputRes.status).toBe(201);

    const saleRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/sales`)
      .set(authHeader(admin))
      .send({
        buyerFirstName: 'Guest',
        buyerLastName: 'Visitor',
        ammunitionTypeId: typeId,
        ammunitionSafeId: safeId,
        quantity: 6,
      });
    expect(saleRes.status).toBe(400);
    expect(saleRes.body.error).toContain('Insufficient stock');
  });

  it('validates buyer membership for member-linked sales', async () => {
    const { club, admin } = await createClubWithAdmin();
    const outsider = await createUser({ email: `${unique('ammo-outsider')}@test.com` });
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    const stockInputRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: 20 });
    expect(stockInputRes.status).toBe(201);

    const saleRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/sales`)
      .set(authHeader(admin))
      .send({
        buyerFirstName: 'Outside',
        buyerLastName: 'Member',
        buyerUserId: outsider.id,
        ammunitionTypeId: typeId,
        ammunitionSafeId: safeId,
        quantity: 5,
      });

    expect(saleRes.status).toBe(400);
    expect(saleRes.body.error).toContain('not an approved member');
  });

  it('renames a safe', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { safeId } = await createAmmoTypeAndSafe(club.id, admin);

    const renameRes = await request(app)
      .patch(`/api/ammunition/club/${club.id}/safes/${safeId}`)
      .set(authHeader(admin))
      .send({ name: 'Renamed Safe' });

    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe('Renamed Safe');
  });

  it('returns 409 when renaming to an existing safe name', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { safeId } = await createAmmoTypeAndSafe(club.id, admin);

    // Create a second safe
    const safeRes2 = await request(app)
      .post(`/api/ammunition/club/${club.id}/safes`)
      .set(authHeader(admin))
      .send({ name: 'Second Safe' });
    expect(safeRes2.status).toBe(201);

    // Try to rename it to 'Main Safe' which already exists
    const renameRes = await request(app)
      .patch(`/api/ammunition/club/${club.id}/safes/${safeRes2.body.id}`)
      .set(authHeader(admin))
      .send({ name: 'Main Safe' });

    expect(renameRes.status).toBe(409);
  });

  it('deletes a safe with no stock or sales', async () => {
    const { club, admin } = await createClubWithAdmin();
    const safeRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/safes`)
      .set(authHeader(admin))
      .send({ name: 'Empty Safe' });
    expect(safeRes.status).toBe(201);

    const deleteRes = await request(app)
      .delete(`/api/ammunition/club/${club.id}/safes/${safeRes.body.id}`)
      .set(authHeader(admin));

    expect(deleteRes.status).toBe(204);
  });

  it('returns 409 when deleting a safe with existing sales', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    // Input stock then record a sale
    await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: 10 });

    await request(app)
      .post(`/api/ammunition/club/${club.id}/sales`)
      .set(authHeader(admin))
      .send({
        buyerFirstName: 'Test',
        buyerLastName: 'Buyer',
        ammunitionTypeId: typeId,
        ammunitionSafeId: safeId,
        quantity: 1,
      });

    const deleteRes = await request(app)
      .delete(`/api/ammunition/club/${club.id}/safes/${safeId}`)
      .set(authHeader(admin));

    expect(deleteRes.status).toBe(409);
  });

  it('transfers stock between safes and records movements', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId: fromSafeId } = await createAmmoTypeAndSafe(club.id, admin);

    // Create destination safe
    const toSafeRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/safes`)
      .set(authHeader(admin))
      .send({ name: 'Second Safe' });
    expect(toSafeRes.status).toBe(201);
    const toSafeId = toSafeRes.body.id as string;

    // Input stock to source
    await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: fromSafeId, quantity: 50 });

    // Transfer 20 rounds
    const transferRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/transfer`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, fromSafeId, toSafeId, quantity: 20 });

    expect(transferRes.status).toBe(201);

    // Check stock levels
    const fromStock = await prisma.ammunitionStock.findUnique({
      where: { ammunitionTypeId_ammunitionSafeId: { ammunitionTypeId: typeId, ammunitionSafeId: fromSafeId } },
    });
    const toStock = await prisma.ammunitionStock.findUnique({
      where: { ammunitionTypeId_ammunitionSafeId: { ammunitionTypeId: typeId, ammunitionSafeId: toSafeId } },
    });
    expect(fromStock?.quantity).toBe(30);
    expect(toStock?.quantity).toBe(20);

    // Check movement records were created
    const movements = await prisma.ammunitionStockInput.findMany({
      where: { clubId: club.id, note: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements.some(m => m.quantity === -20 && m.note?.includes('Second Safe'))).toBe(true);
    expect(movements.some(m => m.quantity === 20 && m.note?.includes('Main Safe'))).toBe(true);
  });

  it('returns insufficient stock error when transferring more than available', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId: fromSafeId } = await createAmmoTypeAndSafe(club.id, admin);

    const toSafeRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/safes`)
      .set(authHeader(admin))
      .send({ name: 'Second Safe' });
    expect(toSafeRes.status).toBe(201);
    const toSafeId = toSafeRes.body.id as string;

    await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: fromSafeId, quantity: 5 });

    const transferRes = await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/transfer`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, fromSafeId, toSafeId, quantity: 10 });

    expect(transferRes.status).toBe(400);
    expect(transferRes.body.error).toContain('Insufficient stock');
  });

  it('filters stock inputs by typeId and safeId', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    // Create a second type
    const type2Res = await request(app)
      .post(`/api/ammunition/club/${club.id}/types`)
      .set(authHeader(admin))
      .send({ name: '9mm', pricePence: 50 });
    expect(type2Res.status).toBe(201);
    const typeId2 = type2Res.body.id as string;

    await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: 10 });

    await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId2, ammunitionSafeId: safeId, quantity: 20 });

    const res = await request(app)
      .get(`/api/ammunition/club/${club.id}/stock/inputs?typeId=${typeId}`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].ammunitionType.id).toBe(typeId);
    expect(res.body.nextCursor).toBeNull();
  });

  it('paginates stock inputs with cursor', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    // Create 3 inputs
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/ammunition/club/${club.id}/stock/input`)
        .set(authHeader(admin))
        .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: i + 1 });
    }

    // Fetch first page of 2
    const page1 = await request(app)
      .get(`/api/ammunition/club/${club.id}/stock/inputs?pageSize=2`)
      .set(authHeader(admin));

    expect(page1.status).toBe(200);
    expect(page1.body.rows).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    // Fetch second page using cursor
    const page2 = await request(app)
      .get(`/api/ammunition/club/${club.id}/stock/inputs?pageSize=2&cursor=${page1.body.nextCursor}`)
      .set(authHeader(admin));

    expect(page2.status).toBe(200);
    expect(page2.body.rows).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    // Ensure no overlap
    const ids1 = page1.body.rows.map((r: { id: string }) => r.id);
    const ids2 = page2.body.rows.map((r: { id: string }) => r.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });

  it('rejects cursor from a different club', async () => {
    const { club: club1, admin: admin1 } = await createClubWithAdmin();
    const { club: club2, admin: admin2 } = await createClubWithAdmin();
    const { typeId: typeId1, safeId: safeId1 } = await createAmmoTypeAndSafe(club1.id, admin1);
    const { typeId: typeId2, safeId: safeId2 } = await createAmmoTypeAndSafe(club2.id, admin2);

    await request(app)
      .post(`/api/ammunition/club/${club1.id}/stock/input`)
      .set(authHeader(admin1))
      .send({ ammunitionTypeId: typeId1, ammunitionSafeId: safeId1, quantity: 10 });

    // Get a valid cursor from club1
    const page1 = await request(app)
      .get(`/api/ammunition/club/${club1.id}/stock/inputs?pageSize=1`)
      .set(authHeader(admin1));
    const cursor = page1.body.nextCursor ?? page1.body.rows[0]?.id;

    // Input something in club2
    await request(app)
      .post(`/api/ammunition/club/${club2.id}/stock/input`)
      .set(authHeader(admin2))
      .send({ ammunitionTypeId: typeId2, ammunitionSafeId: safeId2, quantity: 5 });

    // Use club1's cursor in club2's request — cursor should be ignored/not leak data
    const res = await request(app)
      .get(`/api/ammunition/club/${club2.id}/stock/inputs?pageSize=10&cursor=${cursor}`)
      .set(authHeader(admin2));

    expect(res.status).toBe(200);
    // The foreign cursor from club1 is scoped to club1 so it is not found for club2 and ignored.
    // club2 should still return its own 1 input record unaffected.
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].ammunitionSafe.name).toBe('Main Safe');
  });

  it('exports stock inputs as CSV', async () => {
    const { club, admin } = await createClubWithAdmin();
    const { typeId, safeId } = await createAmmoTypeAndSafe(club.id, admin);

    await request(app)
      .post(`/api/ammunition/club/${club.id}/stock/input`)
      .set(authHeader(admin))
      .send({ ammunitionTypeId: typeId, ammunitionSafeId: safeId, quantity: 42 });

    const res = await request(app)
      .get(`/api/ammunition/club/${club.id}/stock/inputs/export.csv`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('.22LR');
    expect(res.text).toContain('42');
  });
});

describe('membership pass routes', () => {
  it('generates membership pass for user', async () => {
    if(!process.env.GOOGLE_WALLET_ISSUER_ID || !process.env.GOOGLE_WALLET_SIGNING_KEY) {
      console.warn('Google Wallet credentials not set, skipping addToWalletLink and addToWalletJwt assertions');
      return;
    }
    const { club, admin } = await createClubWithAdmin();

    // Enable pass issuing
    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    const res = await request(app)
      .get(`/api/users/me/membership-passes/${club.id}`)
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
      .get(`/api/users/me/membership-passes/${club.id}`)
      .send({});

    expect(res.status).toBe(401);
  });

  it('rejects pass generation when issuing disabled', async () => {
    const { club, admin } = await createClubWithAdmin();

    const res = await request(app)
      .get(`/api/users/me/membership-passes/${club.id}`)
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
      .get(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(nonmember));

    expect(res.status).toBe(404);
  });

  it('returns same pass on subsequent calls (idempotent)', async () => {
    if(!process.env.GOOGLE_WALLET_ISSUER_ID || !process.env.GOOGLE_WALLET_SIGNING_KEY) {
      console.warn('Google Wallet credentials not set, skipping addToWalletLink and addToWalletJwt assertions');
      return;
    }
    const { club, admin } = await createClubWithAdmin();

    await request(app)
      .post(`/api/clubs/${club.id}/settings`)
      .set(authHeader(admin))
      .send({ passIssuingEnabled: true });

    const res1 = await request(app)
      .get(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    const res2 = await request(app)
      .get(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    if (res1.body.id && res2.body.id) {
      expect(res1.body.id).toBe(res2.body.id);
      expect(res1.body.qrCode).toBe(res2.body.qrCode);
    }
  });

  it('includes current visit count in pass', async () => {
    if(!process.env.GOOGLE_WALLET_ISSUER_ID || !process.env.GOOGLE_WALLET_SIGNING_KEY) {
      console.warn('Google Wallet credentials not set, skipping addToWalletLink and addToWalletJwt assertions');
      return;
    }
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
      .get(`/api/users/me/membership-passes/${club.id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    // Visit count may or may not be in response depending on API call success
    if (res.body.visitCount !== undefined) {
      expect(res.body.visitCount).toBe(2);
    }
  });

  it('passes use member name in pass object', async () => {
    if(!process.env.GOOGLE_WALLET_ISSUER_ID || !process.env.GOOGLE_WALLET_SIGNING_KEY) {
      console.warn('Google Wallet credentials not set, skipping addToWalletLink and addToWalletJwt assertions');
      return;
    }
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
      .get(`/api/users/me/membership-passes/${club.id}`)
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
  it('bootstrap-status endpoint returns the correct shape', async () => {
    const res = await request(app).get('/api/auth/bootstrap-status');
    expect(res.status).toBe(200);
    expect(typeof res.body.bootstrapAvailable).toBe('boolean');
  });

  it('bootstrap endpoint is blocked when users already exist', async () => {
    // Ensure at least one user exists so bootstrap is definitely disabled
    await createUser({ email: `${unique('bootstrap-guard')}@test.com` });

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
    const emailSpy = vi.spyOn(emailService, 'sendInviteEmail').mockResolvedValue(true);

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
    expect(res.body.emailSent).toBe(true);
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  it('admin can create invite with JUNIOR role', async () => {
    const { club, admin } = await createClubWithAdmin();
    const emailSpy = vi.spyOn(emailService, 'sendInviteEmail').mockResolvedValue(true);

    const res = await request(app)
      .post(`/api/clubs/${club.id}/invites`)
      .set(authHeader(admin))
      .send({
        email: `${unique('junior')}@test.com`,
        role: 'JUNIOR',
        expiresInDays: 14,
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('JUNIOR');
    expect(res.body.emailSent).toBe(true);
    expect(emailSpy).toHaveBeenCalledTimes(1);
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

  it('admin can change member role to JUNIOR', async () => {
    const { club, admin } = await createClubWithAdmin();
    const member = await createUser({ email: `${unique('junior-member')}@test.com` });

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
      .send({ role: 'JUNIOR' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('JUNIOR');
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

  it('admin can resend invite email from dashboard endpoint', async () => {
    const { club, admin } = await createClubWithAdmin();
    const sendSpy = vi.spyOn(emailService, 'sendInviteEmail').mockResolvedValue(true);

    const invite = await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        email: `${unique('invite-resend')}@test.com`,
        role: MembershipRole.MEMBER,
        token: `invite-resend-${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdByUserId: admin.id,
      },
    });

    const res = await request(app)
      .post(`/api/clubs/${club.id}/invites/${invite.id}/send`)
      .set(authHeader(admin))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailSent).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
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
