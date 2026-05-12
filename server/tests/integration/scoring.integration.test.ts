import './setup';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';

const app = createApp();
const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

async function createUser(overrides: Partial<{ name: string; email: string }> = {}) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      email: overrides.email ?? `user-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash,
      gdprConsentDate: new Date(),
      address: '1 Test Street',
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

async function createClubWithAdmin() {
  const admin = await createUser({ email: `${unique('admin')}@test.com` });
  const club = await prisma.club.create({
    data: { name: 'Scoring Club', ownerId: admin.id, acceptingNewMembers: true },
  });
  await prisma.clubMembership.create({
    data: { userId: admin.id, clubId: club.id, role: MembershipRole.ADMIN, status: MembershipStatus.APPROVED },
  });
  return { admin, club };
}

async function addApprovedMember(clubId: string) {
  const member = await createUser({ email: `${unique('member')}@test.com` });
  await prisma.clubMembership.create({
    data: { userId: member.id, clubId, role: MembershipRole.MEMBER, status: MembershipStatus.APPROVED },
  });
  return member;
}

// ---------------------------------------------------------------------------
// Season tests
// ---------------------------------------------------------------------------

describe('seasons', () => {
  it('admin can create and list seasons', async () => {
    const { admin, club } = await createClubWithAdmin();

    const createRes = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: '2024/25 Season' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe('2024/25 Season');

    const listRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin));

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
  });

  it('non-admin cannot create seasons', async () => {
    const { club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const res = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(member))
      .send({ name: 'Season' });

    expect(res.status).toBe(403);
  });

  it('admin can update and archive a season', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Old Name' });

    const patchRes = await request(app)
      .patch(`/api/clubs/${club.id}/scoring/seasons/${season.id}`)
      .set(authHeader(admin))
      .send({ name: 'New Name', isArchived: true });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe('New Name');
    expect(patchRes.body.isArchived).toBe(true);
  });

  it('admin can delete an empty season', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'To Delete' });

    const deleteRes = await request(app)
      .delete(`/api/clubs/${club.id}/scoring/seasons/${season.id}`)
      .set(authHeader(admin));

    expect(deleteRes.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Competition tests
// ---------------------------------------------------------------------------

describe('competitions', () => {
  it('admin can create a competition with rounds auto-created', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Test Season' });

    const res = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'NSRA Short Metric',
        organiser: 'NSRA',
        roundCount: 3,
        cardsPerRound: 2,
        maxScorePerCard: 50,
        rounds: [
          { dueDate: '2024-11-01' },
          { dueDate: '2024-12-01' },
          { dueDate: '2025-01-01' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('NSRA Short Metric');
    expect(res.body.rounds).toHaveLength(3);
    expect(res.body.rounds[0].roundNumber).toBe(1);
    expect(res.body.rounds[2].roundNumber).toBe(3);
  });

  it('rejects if rounds array length != roundCount', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'S' });

    const res = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Bad',
        roundCount: 3,
        cardsPerRound: 2,
        maxScorePerCard: 50,
        rounds: [{ dueDate: '2024-11-01' }], // only 1, not 3
      });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Enrolment tests
// ---------------------------------------------------------------------------

describe('enrolment', () => {
  async function setupCompetition(admin: { id: string; email: string }, clubId: string) {
    const { body: season } = await request(app)
      .post(`/api/clubs/${clubId}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'E Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${clubId}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'E Comp',
        roundCount: 2,
        cardsPerRound: 2,
        maxScorePerCard: 50,
        rounds: [{ dueDate: '2024-11-01' }, { dueDate: '2024-12-01' }],
      });

    return comp;
  }

  it('enrolment creates score stubs for every round×card', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const comp = await setupCompetition(admin, club.id);

    const enrolRes = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    expect(enrolRes.status).toBe(201);
    expect(enrolRes.body.enrolled).toBe(1);

    // 2 rounds × 2 cards = 4 score stubs
    const scoreCount = await prisma.score.count({ where: { competitionId: comp.id, userId: member.id } });
    expect(scoreCount).toBe(4);
  });

  it('cannot enrol non-member', async () => {
    const { admin, club } = await createClubWithAdmin();
    const outsider = await createUser();
    const comp = await setupCompetition(admin, club.id);

    const res = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [outsider.id] });

    expect(res.status).toBe(400);
  });

  it('unenrol removes entry and score stubs when no scores entered', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const comp = await setupCompetition(admin, club.id);

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const delRes = await request(app)
      .delete(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members/${member.id}`)
      .set(authHeader(admin));

    expect(delRes.status).toBe(204);

    const scoreCount = await prisma.score.count({ where: { competitionId: comp.id, userId: member.id } });
    expect(scoreCount).toBe(0);
  });

  it('cannot unenrol member with recorded scores', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const comp = await setupCompetition(admin, club.id);

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    // Get a score stub and set a score
    const stub = await prisma.score.findFirst({ where: { competitionId: comp.id, userId: member.id } });
    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${stub!.id}`)
      .set(authHeader(admin))
      .send({ score: 48 });

    const delRes = await request(app)
      .delete(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members/${member.id}`)
      .set(authHeader(admin));

    expect(delRes.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Score autosave tests
// ---------------------------------------------------------------------------

describe('score autosave', () => {
  it('admin can update a score cell', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'S' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'C',
        roundCount: 1,
        cardsPerRound: 1,
        maxScorePerCard: 50,
        rounds: [{ dueDate: '2024-11-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const stub = await prisma.score.findFirst({ where: { competitionId: comp.id, userId: member.id } });

    const res = await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${stub!.id}`)
      .set(authHeader(admin))
      .send({ score: 47 });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(47);
  });

  it('can set score back to null', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'S2' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'C2',
        roundCount: 1,
        cardsPerRound: 1,
        maxScorePerCard: 50,
        rounds: [{ dueDate: '2024-11-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const stub = await prisma.score.findFirst({ where: { competitionId: comp.id, userId: member.id } });

    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${stub!.id}`)
      .set(authHeader(admin))
      .send({ score: 47 });

    const clearRes = await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${stub!.id}`)
      .set(authHeader(admin))
      .send({ score: null });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Averages report tests
// ---------------------------------------------------------------------------

describe('averages report', () => {
  it('returns member averages', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Avg Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Avg Comp',
        roundCount: 1,
        cardsPerRound: 2,
        maxScorePerCard: 50,
        rounds: [{ dueDate: '2024-11-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const stubs = await prisma.score.findMany({ where: { competitionId: comp.id, userId: member.id } });
    for (const stub of stubs) {
      await request(app)
        .patch(`/api/clubs/${club.id}/scoring/scores/${stub.id}`)
        .set(authHeader(admin))
        .send({ score: 48 });
    }

    const reportRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/report`)
      .set(authHeader(admin));

    expect(reportRes.status).toBe(200);
    const memberRow = reportRes.body.find((r: { userId: string }) => r.userId === member.id);
    expect(memberRow).toBeDefined();
    expect(memberRow.allTimeAverage).toBe(48);
    expect(memberRow.totalCardsShot).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Member-facing due cards tests
// ---------------------------------------------------------------------------

describe('member due cards', () => {
  it('returns due cards with null score within 7-day window', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Due Season' });

    // Round due in 7 days (within window)
    const futureDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Due Comp',
        roundCount: 1,
        cardsPerRound: 1,
        maxScorePerCard: 50,
        rounds: [{ dueDate: futureDue }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const dueRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/mine/due`)
      .set(authHeader(member));

    expect(dueRes.status).toBe(200);
    expect(dueRes.body.length).toBeGreaterThan(0);
    expect(dueRes.body[0].competitionName).toBe('Due Comp');
  });

  it('excludes cards older than 7 days', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Old Season' });

    // Due 10 days ago — outside the window
    const oldDue = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Old Comp',
        roundCount: 1,
        cardsPerRound: 1,
        maxScorePerCard: 50,
        rounds: [{ dueDate: oldDue }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const dueRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/mine/due`)
      .set(authHeader(member));

    expect(dueRes.status).toBe(200);
    expect(dueRes.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Member averages endpoint tests
// ---------------------------------------------------------------------------

describe('member averages', () => {
  it('returns correct all-time and last-10 averages', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Avg2 Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Avg2 Comp',
        roundCount: 1,
        cardsPerRound: 4,
        maxScorePerCard: 50,
        rounds: [{ dueDate: '2024-11-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const stubs = await prisma.score.findMany({
      where: { competitionId: comp.id, userId: member.id },
      orderBy: { cardNumber: 'asc' },
    });

    // Set scores 40, 42, 44, 46
    const scoreValues = [40, 42, 44, 46];
    for (let i = 0; i < stubs.length; i++) {
      await request(app)
        .patch(`/api/clubs/${club.id}/scoring/scores/${stubs[i].id}`)
        .set(authHeader(admin))
        .send({ score: scoreValues[i] });
    }

    const avgsRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/mine/averages`)
      .set(authHeader(member));

    expect(avgsRes.status).toBe(200);
    expect(avgsRes.body.totalCardsShot).toBe(4);
    expect(avgsRes.body.allTimeAverage).toBe(43); // (40+42+44+46)/4
    expect(avgsRes.body.last10Average).toBe(43);
  });
});
