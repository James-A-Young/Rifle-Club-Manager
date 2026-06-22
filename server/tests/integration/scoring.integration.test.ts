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

  it('returns 409 on duplicate season name within same club', async () => {
    const { admin, club } = await createClubWithAdmin();
    await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Same Name' });

    const dupRes = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Same Name' });

    expect(dupRes.status).toBe(409);
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
        rounds: [{ dueDate: '2024-11-01' }], // only 1, not 3
      });

    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate competition name within same season', async () => {
    const { admin, club } = await createClubWithAdmin();
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Dup Season' });

    const payload = {
      seasonId: season.id,
      name: 'Same Comp',
      roundCount: 1,
      cardsPerRound: 1,
      rounds: [{ dueDate: '2024-11-01' }],
    };

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send(payload);

    const dupRes = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send(payload);

    expect(dupRes.status).toBe(409);
  });

  it('admin can edit competition name, rounds, cards, and due dates', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Editable Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Editable Comp',
        organiser: 'Club',
        roundCount: 2,
        cardsPerRound: 2,
        rounds: [{ dueDate: '2025-01-01' }, { dueDate: '2025-02-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const patchRes = await request(app)
      .patch(`/api/clubs/${club.id}/scoring/competitions/${comp.id}`)
      .set(authHeader(admin))
      .send({
        name: 'Editable Comp Updated',
        roundCount: 3,
        cardsPerRound: 3,
        rounds: [
          { roundNumber: 1, dueDate: '2025-03-01' },
          { roundNumber: 2, dueDate: '2025-04-01' },
          { roundNumber: 3, dueDate: '2025-05-01' },
        ],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe('Editable Comp Updated');
    expect(patchRes.body.roundCount).toBe(3);
    expect(patchRes.body.cardsPerRound).toBe(3);
    expect(patchRes.body.rounds).toHaveLength(3);
    expect(String(patchRes.body.rounds[2].dueDate)).toContain('2025-05-01');

    // Existing enrolled member should now have 3 rounds x 3 cards = 9 stubs
    const scoreCount = await prisma.score.count({ where: { competitionId: comp.id, userId: member.id } });
    expect(scoreCount).toBe(9);
  });

  it('blocks reducing roundCount when removed rounds contain scores', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Round Guard Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Round Guard Comp',
        roundCount: 3,
        cardsPerRound: 2,
        rounds: [{ dueDate: '2025-01-01' }, { dueDate: '2025-02-01' }, { dueDate: '2025-03-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const roundThreeScore = await prisma.score.findFirst({
      where: {
        competitionId: comp.id,
        userId: member.id,
        round: { roundNumber: 3 },
      },
      orderBy: { cardNumber: 'asc' },
    });

    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${roundThreeScore!.id}`)
      .set(authHeader(admin))
      .send({ score: 49 });

    const patchRes = await request(app)
      .patch(`/api/clubs/${club.id}/scoring/competitions/${comp.id}`)
      .set(authHeader(admin))
      .send({ roundCount: 2, rounds: [{ roundNumber: 1, dueDate: '2025-01-01' }, { roundNumber: 2, dueDate: '2025-02-01' }] });

    expect(patchRes.status).toBe(409);
    expect(String(patchRes.body.error)).toContain('Cannot reduce round count');
  });

  it('blocks reducing cardsPerRound when removed cards contain scores', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Card Guard Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Card Guard Comp',
        roundCount: 2,
        cardsPerRound: 3,
        rounds: [{ dueDate: '2025-01-01' }, { dueDate: '2025-02-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const thirdCardScore = await prisma.score.findFirst({
      where: { competitionId: comp.id, userId: member.id, cardNumber: 3 },
      orderBy: { id: 'asc' },
    });

    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${thirdCardScore!.id}`)
      .set(authHeader(admin))
      .send({ score: 50 });

    const patchRes = await request(app)
      .patch(`/api/clubs/${club.id}/scoring/competitions/${comp.id}`)
      .set(authHeader(admin))
      .send({ cardsPerRound: 2, rounds: [{ roundNumber: 1, dueDate: '2025-01-01' }, { roundNumber: 2, dueDate: '2025-02-01' }] });

    expect(patchRes.status).toBe(409);
    expect(String(patchRes.body.error)).toContain('Cannot reduce cards per round');
  });

  it('blocks deleting a final round when it contains scores', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Delete Guard Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Delete Guard Comp',
        roundCount: 2,
        cardsPerRound: 1,
        rounds: [{ dueDate: '2025-01-01' }, { dueDate: '2025-02-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const finalRoundScore = await prisma.score.findFirst({
      where: {
        competitionId: comp.id,
        userId: member.id,
        round: { roundNumber: 2 },
      },
    });

    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${finalRoundScore!.id}`)
      .set(authHeader(admin))
      .send({ score: 45 });

    const delRes = await request(app)
      .delete(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/rounds/2`)
      .set(authHeader(admin));

    expect(delRes.status).toBe(409);
    expect(String(delRes.body.error)).toContain('Cannot delete round with scores');
  });

  it('deletes a final round when it has no scores', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);
    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Delete Round Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Delete Round Comp',
        roundCount: 2,
        cardsPerRound: 1,
        rounds: [{ dueDate: '2025-01-01' }, { dueDate: '2025-02-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const delRes = await request(app)
      .delete(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/rounds/2`)
      .set(authHeader(admin));

    expect(delRes.status).toBe(204);

    const updatedComp = await prisma.competition.findUnique({ where: { id: comp.id } });
    const rounds = await prisma.round.findMany({ where: { competitionId: comp.id } });
    const scores = await prisma.score.findMany({ where: { competitionId: comp.id } });

    expect(updatedComp?.roundCount).toBe(1);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].roundNumber).toBe(1);
    expect(scores).toHaveLength(1);
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

  it('exports raw season scores as CSV', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Raw Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Raw Comp',
        roundCount: 1,
        cardsPerRound: 2,
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

    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${stubs[0].id}`)
      .set(authHeader(admin))
      .send({ score: 46 });

    const csvRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/report?format=raw-csv&seasonId=${season.id}`)
      .set(authHeader(admin));

    expect(csvRes.status).toBe(200);
    expect(String(csvRes.headers['content-type'])).toContain('text/csv');
    expect(String(csvRes.headers['content-disposition'])).toContain('raw-scores-raw-season.csv');
    expect(csvRes.text).toContain('"Season","Competition","Round","Due Date","Card Number","Member Name","Member Email","Score","Updated At"');
    expect(csvRes.text).toContain('"Raw Season","Raw Comp","1"');
    expect(csvRes.text).toContain('"46"');
  });

  it('rejects raw CSV export without seasonId', async () => {
    const { admin, club } = await createClubWithAdmin();

    const res = await request(app)
      .get(`/api/clubs/${club.id}/scoring/report?format=raw-csv`)
      .set(authHeader(admin));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('seasonId is required');
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

  it('excludes cards due more than 30 days in the future', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Far Future Season' });

    // Due 14 days from now — outside the +30d upper bound
    const farFutureDue = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Far Future Comp',
        roundCount: 1,
        cardsPerRound: 1,
        rounds: [{ dueDate: farFutureDue }],
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

  it('includes practice cards and supports discipline filtering', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const { body: season } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/seasons`)
      .set(authHeader(admin))
      .send({ name: 'Practice Avg Season' });

    const { body: comp } = await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions`)
      .set(authHeader(admin))
      .send({
        seasonId: season.id,
        name: 'Practice Avg Comp',
        roundCount: 1,
        cardsPerRound: 1,
        rounds: [{ dueDate: '2024-11-01' }],
      });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/competitions/${comp.id}/members`)
      .set(authHeader(admin))
      .send({ userIds: [member.id] });

    const compStub = await prisma.score.findFirst({ where: { competitionId: comp.id, userId: member.id } });
    await request(app)
      .patch(`/api/clubs/${club.id}/scoring/scores/${compStub!.id}`)
      .set(authHeader(admin))
      .send({ score: 40 });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/practice-cards`)
      .set(authHeader(admin))
      .send({ userId: member.id, discipline: 'Air Rifle', score: 50 });

    await request(app)
      .post(`/api/clubs/${club.id}/scoring/practice-cards`)
      .set(authHeader(admin))
      .send({ userId: member.id, discipline: 'Air Rifle', score: 60 });

    const blendedRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/mine/averages`)
      .set(authHeader(member));

    expect(blendedRes.status).toBe(200);
    expect(blendedRes.body.totalCardsShot).toBe(3);
    expect(blendedRes.body.allTimeAverage).toBe(50);
    expect(blendedRes.body.competitionCardsShot).toBe(1);
    expect(blendedRes.body.practiceCardsShot).toBe(2);

    const disciplineRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/mine/averages?discipline=Air Rifle`)
      .set(authHeader(member));

    expect(disciplineRes.status).toBe(200);
    expect(disciplineRes.body.totalCardsShot).toBe(2);
    expect(disciplineRes.body.allTimeAverage).toBe(55);
    expect(disciplineRes.body.competitionCardsShot).toBe(0);
    expect(disciplineRes.body.practiceCardsShot).toBe(2);
    expect(disciplineRes.body.byDiscipline).toHaveLength(1);
    expect(disciplineRes.body.byDiscipline[0].discipline).toBe('Air Rifle');
  });
});

describe('practice cards', () => {
  it('admin can log and list recent practice cards', async () => {
    const { admin, club } = await createClubWithAdmin();
    const member = await addApprovedMember(club.id);

    const createRes = await request(app)
      .post(`/api/clubs/${club.id}/scoring/practice-cards`)
      .set(authHeader(admin))
      .send({ userId: member.id, discipline: 'Benchrest', score: 57 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.userId).toBe(member.id);
    expect(createRes.body.discipline).toBe('Benchrest');
    expect(createRes.body.score).toBe(57);

    const listRes = await request(app)
      .get(`/api/clubs/${club.id}/scoring/practice-cards/recent?discipline=Benchrest`)
      .set(authHeader(admin));

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].discipline).toBe('Benchrest');
  });
});
