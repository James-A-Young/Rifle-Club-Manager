import './setup';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MembershipRole, MembershipStatus, OwnerType, Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';

const app = createApp();

async function createUser(overrides: Partial<{
  name: string;
  email: string;
  role: Role;
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
      role: overrides.role ?? Role.MEMBER,
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

function authHeader(user: { id: string; email: string; role: Role }) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET ?? 'test-secret',
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

async function createClubWithAdmin() {
  const admin = await createUser({ role: Role.OWNER, email: 'admin@test.com' });
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

describe('auth routes', () => {
  it('registers a user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reg User',
        email: 'register@test.com',
        password: 'Password123!',
        gdprConsent: true,
        address: '123 Test Road',
        placeOfBirth: 'Leeds',
        dateOfBirth: '1990-01-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('register@test.com');
  });

  it('rejects invalid credentials on login', async () => {
    await createUser({ email: 'login@test.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('users routes', () => {
  it('requires auth for /api/users/me', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('updates certificate fields for authenticated user', async () => {
    const user = await createUser({ email: 'profile@test.com' });

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
    const owner = await createUser({ email: 'owner-firearm@test.com' });
    const stranger = await createUser({ email: 'stranger-firearm@test.com' });

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
    const member = await createUser({ email: 'member@test.com' });

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
      email: 'member-cert@test.com',
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
    const user = await createUser({ email: 'firearms-route@test.com' });
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
        cryptoToken: 'public-signin-token',
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
});
