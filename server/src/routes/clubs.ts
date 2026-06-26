import { Router, Response } from 'express';
import crypto from 'crypto';
import dns from 'dns/promises';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { BackupDataset, GoogleDriveConnectionStatus, MembershipStatus, MembershipRole, MembershipCardAverageMetric, OwnerType } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import {
  auditFirearmDeleteDenied,
  auditMemberStatusChange,
  auditMemberRoleChange,
} from '../middleware/auditLog';
import { emailService } from '../services/email';
import { ensureAdminForClub } from '../utils/clubAccess';
import { decryptSecret, encryptSecret } from '../services/backups/crypto';
import {
  assertGoogleDriveOAuthConfigured,
  buildGoogleDriveAuthUrl,
  exchangeGoogleOAuthCode,
  revokeGoogleToken,
} from '../services/backups/googleDriveOAuth';
import { GoogleDriveBackupClient } from '../services/backups/googleDriveClient';
import { buildMemberDemographicsCsv } from '../services/exports/memberDemographicsExport';
import { getUserProfileHistorySince } from '../services/profileHistory';
import { deriveDeclarationStatusFromDueDate } from '../services/section21Declaration';
import {
  buildVerificationToken,
  getExpectedCnameTarget,
  normalizeDomain,
  normalizeHostHeader,
  normalizeVanitySlug,
  renderMarkdownToSafeHtml,
  slugFromTitle,
} from '../utils/publicSite';

const router = Router();

const DRIVE_FOLDER_NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const driveFolderNameCache = new Map<string, { name: string; expiresAt: number }>();

function getCachedDriveFolderName(folderId: string): string | null {
  const cached = driveFolderNameCache.get(folderId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    driveFolderNameCache.delete(folderId);
    return null;
  }
  return cached.name;
}

function setCachedDriveFolderName(folderId: string, name: string): void {
  driveFolderNameCache.set(folderId, {
    name,
    expiresAt: Date.now() + DRIVE_FOLDER_NAME_CACHE_TTL_MS,
  });
}

const publicClubProfileParamsSchema = z.object({
  id: z.string().min(1),
});

const publicClubVanityParamsSchema = z.object({
  vanity: z.string().min(1),
});

const publicClubBlogParamsSchema = z.object({
  slug: z.string().min(1),
});

const PUBLIC_BLOG_DEFAULT_PAGE_SIZE = 5;
const PUBLIC_BLOG_MAX_PAGE_SIZE = 20;

const publicBlogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PUBLIC_BLOG_MAX_PAGE_SIZE).default(PUBLIC_BLOG_DEFAULT_PAGE_SIZE),
});

const invitePreviewParamsSchema = z.object({
  token: z.string().min(1),
});

function buildCanonicalUrl(clubId: string, vanitySlug: string | null | undefined, activeDomain: string | null | undefined): string {
  if (activeDomain) {
    return `https://${activeDomain}`;
  }
  if (vanitySlug) {
    return `https://shootingmatch.app/clubpage/${vanitySlug}`;
  }
  return `https://shootingmatch.app/clubs/profile/${clubId}`;
}

async function getPublicBlogPostPreviews(clubId: string, page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const where = { clubId, isPublished: true };

  const [total, posts] = await Promise.all([
    prisma.clubPublicBlogPost.count({ where }),
    prisma.clubPublicBlogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        clubId: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    posts,
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0,
  };
}

async function resolveClubIdFromVanity(vanityRaw: string): Promise<string | null> {
  const vanity = normalizeVanitySlug(vanityRaw);
  if (!vanity) {
    return null;
  }

  const profile = await prisma.clubPublicSiteProfile.findUnique({
    where: { vanitySlug: vanity },
    select: { clubId: true },
  });

  return profile?.clubId ?? null;
}

async function resolveClubIdFromHost(hostHeader: string | undefined): Promise<string | null> {
  const host = normalizeHostHeader(hostHeader);
  if (!host) {
    return null;
  }

  const domain = await prisma.clubPublicDomain.findFirst({
    where: { domain: host, isActive: true, status: 'VERIFIED' },
    select: { clubId: true },
  });

  return domain?.clubId ?? null;
}

async function getPublicSitePayload(clubId: string, mode: 'id' | 'vanity' | 'domain') {
  const now = new Date();
  const [club, profile, sessions, announcements, blogPosts, activeDomain] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        homeOfficeRef: true,
        address: true,
        disciplinesOffered: true,
        acceptingNewMembers: true,
        openingTimes: true,
        description: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
    prisma.clubPublicSiteProfile.findUnique({ where: { clubId } }),
    prisma.clubPublicSessionBlock.findMany({ where: { clubId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.clubPublicAnnouncement.findMany({
      where: {
        clubId,
        isEnabled: true,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    getPublicBlogPostPreviews(clubId, 1, PUBLIC_BLOG_DEFAULT_PAGE_SIZE),
    prisma.clubPublicDomain.findFirst({
      where: { clubId, isActive: true, status: 'VERIFIED' },
      select: { domain: true },
    }),
  ]);

  if (!club) return null;

  return {
    ...club,
    publicSite: {
      vanitySlug: profile?.vanitySlug ?? null,
      heroTitle: profile?.heroTitle ?? null,
      heroSubtitle: profile?.heroSubtitle ?? null,
      headerImageUrl: profile?.headerImageUrl ?? null,
      headerImageAlt: profile?.headerImageAlt ?? null,
      sessions,
      announcements,
      blogPosts: blogPosts.posts,
      canonicalUrl: buildCanonicalUrl(club.id, profile?.vanitySlug, activeDomain?.domain),
      resolvedBy: mode,
    },
  };
}

async function getPublicBlogPost(clubId: string, slug: string) {
  const post = await prisma.clubPublicBlogPost.findFirst({
    where: { clubId, slug, isPublished: true },
    select: {
      id: true,
      clubId: true,
      title: true,
      slug: true,
      excerpt: true,
      markdownBody: true,
      isPublished: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!post) return null;
  return {
    ...post,
    renderedHtml: renderMarkdownToSafeHtml(post.markdownBody),
  };
}

router.get('/profile/:id', async (req, res: Response) => {
  const params = publicClubProfileParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const payload = await getPublicSitePayload(params.data.id, 'id');
  if (!payload) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  res.json(payload);
});

router.get('/profile/:id/blog', async (req, res: Response) => {
  const params = publicClubProfileParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const query = publicBlogListQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: formatZodError(query.error) });
    return;
  }

  const club = await prisma.club.findUnique({
    where: { id: params.data.id },
    select: { id: true },
  });
  if (!club) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }

  const result = await getPublicBlogPostPreviews(club.id, query.data.page, query.data.pageSize);
  res.json(result);
});

router.get('/profile/:id/blog/:slug', async (req, res: Response) => {
  const profileParams = publicClubProfileParamsSchema.safeParse(req.params);
  const blogParams = publicClubBlogParamsSchema.safeParse(req.params);
  if (!profileParams.success) {
    res.status(400).json({ error: formatZodError(profileParams.error) });
    return;
  }
  if (!blogParams.success) {
    res.status(400).json({ error: formatZodError(blogParams.error) });
    return;
  }

  const [payload, post] = await Promise.all([
    getPublicSitePayload(profileParams.data.id, 'id'),
    getPublicBlogPost(profileParams.data.id, blogParams.data.slug),
  ]);
  if (!payload || !post) {
    res.status(404).json({ error: 'Blog post not found' });
    return;
  }
  res.json({ club: payload, post });
});

router.get('/public/by-vanity/:vanity', async (req, res: Response) => {
  const params = publicClubVanityParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const vanity = normalizeVanitySlug(params.data.vanity);
  if (!vanity) {
    res.status(400).json({ error: 'Invalid vanity slug' });
    return;
  }

  const profile = await prisma.clubPublicSiteProfile.findUnique({
    where: { vanitySlug: vanity },
    select: { clubId: true },
  });
  if (!profile) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  const payload = await getPublicSitePayload(profile.clubId, 'vanity');
  if (!payload) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  res.json(payload);
});

router.get('/public/by-vanity/:vanity/blog', async (req, res: Response) => {
  const params = publicClubVanityParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const query = publicBlogListQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: formatZodError(query.error) });
    return;
  }

  const clubId = await resolveClubIdFromVanity(params.data.vanity);
  if (!clubId) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }

  const result = await getPublicBlogPostPreviews(clubId, query.data.page, query.data.pageSize);
  res.json(result);
});

router.get('/public/by-vanity/:vanity/blog/:slug', async (req, res: Response) => {
  const vanityParams = publicClubVanityParamsSchema.safeParse(req.params);
  const blogParams = publicClubBlogParamsSchema.safeParse(req.params);
  if (!vanityParams.success) {
    res.status(400).json({ error: formatZodError(vanityParams.error) });
    return;
  }
  if (!blogParams.success) {
    res.status(400).json({ error: formatZodError(blogParams.error) });
    return;
  }
  const vanity = normalizeVanitySlug(vanityParams.data.vanity);
  const profile = await prisma.clubPublicSiteProfile.findUnique({
    where: { vanitySlug: vanity },
    select: { clubId: true },
  });
  if (!profile) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  const [payload, post] = await Promise.all([
    getPublicSitePayload(profile.clubId, 'vanity'),
    getPublicBlogPost(profile.clubId, blogParams.data.slug),
  ]);
  if (!payload || !post) {
    res.status(404).json({ error: 'Blog post not found' });
    return;
  }
  res.json({ club: payload, post });
});

router.get('/public/by-domain', async (req, res: Response) => {
  const host = normalizeHostHeader(req.headers.host);
  if (!host) {
    res.status(400).json({ error: 'Host header is required' });
    return;
  }

  const domain = await prisma.clubPublicDomain.findFirst({
    where: { domain: host, isActive: true, status: 'VERIFIED' },
    select: { clubId: true },
  });
  if (!domain) {
    res.status(404).json({ error: 'Club not found for this domain' });
    return;
  }

  const payload = await getPublicSitePayload(domain.clubId, 'domain');
  if (!payload) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  res.json(payload);
});

router.get('/public/by-domain/blog', async (req, res: Response) => {
  const query = publicBlogListQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: formatZodError(query.error) });
    return;
  }

  const host = normalizeHostHeader(req.headers.host);
  if (!host) {
    res.status(400).json({ error: 'Host header is required' });
    return;
  }

  const clubId = await resolveClubIdFromHost(host);
  if (!clubId) {
    res.status(404).json({ error: 'Club not found for this domain' });
    return;
  }

  const result = await getPublicBlogPostPreviews(clubId, query.data.page, query.data.pageSize);
  res.json(result);
});

router.get('/public/by-domain/blog/:slug', async (req, res: Response) => {
  const params = publicClubBlogParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  const host = normalizeHostHeader(req.headers.host);
  if (!host) {
    res.status(400).json({ error: 'Host header is required' });
    return;
  }
  const domain = await prisma.clubPublicDomain.findFirst({
    where: { domain: host, isActive: true, status: 'VERIFIED' },
    select: { clubId: true },
  });
  if (!domain) {
    res.status(404).json({ error: 'Club not found for this domain' });
    return;
  }

  const [payload, post] = await Promise.all([
    getPublicSitePayload(domain.clubId, 'domain'),
    getPublicBlogPost(domain.clubId, params.data.slug),
  ]);
  if (!payload || !post) {
    res.status(404).json({ error: 'Blog post not found' });
    return;
  }
  res.json({ club: payload, post });
});

router.get('/invite-preview/:token', async (req, res: Response) => {
  const params = invitePreviewParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const invite = await prisma.clubInvite.findUnique({
    where: { token: params.data.token },
    include: { club: { select: { id: true, name: true } } },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  if (invite.redeemedAt) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }
  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }

  res.json({
    token: invite.token,
    expiresAt: invite.expiresAt,
    club: invite.club,
  });
});

router.use(requireAuth);

const createClubSchema = z.object({
  name: z.string().min(2),
  homeOfficeRef: z.string().optional(),
  address: z.string().optional(),
  disciplinesOffered: z.array(z.string().min(1)).optional(),
  acceptingNewMembers: z.boolean().optional(),
  openingTimes: z.string().optional(),
  description: z.string().optional(),
});

const updateClubSchema = z.object({
  name: z.string().min(2).optional(),
  homeOfficeRef: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  disciplinesOffered: z.array(z.string().min(1)).optional().nullable(),
  acceptingNewMembers: z.boolean().optional(),
  openingTimes: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDisciplines(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  value.forEach(item => {
    const normalized = item.trim();
    if (normalized.length > 0) {
      deduped.add(normalized);
    }
  });

  return Array.from(deduped);
}

const publicSiteProfileSchema = z.object({
  vanitySlug: z.string().max(60).nullable().optional(),
  heroTitle: z.string().max(120).nullable().optional(),
  heroSubtitle: z.string().max(280).nullable().optional(),
  headerImageUrl: z.string().url().max(2000).nullable().optional(),
  headerImageAlt: z.string().max(160).nullable().optional(),
});

const publicSessionBlockSchema = z.object({
  dayLabel: z.string().min(1).max(40),
  sessionType: z.string().min(1).max(80),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/, 'startsAt must be HH:MM'),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/, 'endsAt must be HH:MM'),
  notes: z.string().max(200).nullable().optional(),
});

const publicAnnouncementSchema = z.object({
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(500),
  variant: z.enum(['INFO', 'WARNING', 'SUCCESS']).default('INFO'),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isEnabled: z.boolean().default(true),
});

const publicBlogPostSchema = z.object({
  title: z.string().min(3).max(160),
  slug: z.string().max(120).optional(),
  excerpt: z.string().max(260).nullable().optional(),
  markdownBody: z.string().min(1).max(50_000),
  isPublished: z.boolean().default(false),
  publishedAt: z.string().datetime().nullable().optional(),
});

const publicBlogPostUpdateSchema = publicBlogPostSchema.partial();

const publicDomainSchema = z.object({
  domain: z.string().min(3).max(255),
});

const publicDomainActivationSchema = z.object({
  isActive: z.boolean(),
});

function sanitizeNullableText(value: string | null | undefined, maxLength?: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return typeof maxLength === 'number' ? trimmed.slice(0, maxLength) : trimmed;
}

async function ensurePublicSiteProfile(clubId: string) {
  const existing = await prisma.clubPublicSiteProfile.findUnique({ where: { clubId } });
  if (existing) return existing;
  return prisma.clubPublicSiteProfile.create({ data: { clubId } });
}

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const disciplinesOffered = normalizeDisciplines(parsed.data.disciplinesOffered);

  const club = await prisma.club.create({
    data: {
      name: parsed.data.name,
      homeOfficeRef: normalizeOptionalText(parsed.data.homeOfficeRef),
      address: normalizeOptionalText(parsed.data.address),
      disciplinesOffered,
      acceptingNewMembers: parsed.data.acceptingNewMembers ?? true,
      openingTimes: normalizeOptionalText(parsed.data.openingTimes),
      description: normalizeOptionalText(parsed.data.description),
      ownerId: req.user!.id,
      memberships: {
        create: {
          userId: req.user!.id,
          status: MembershipStatus.APPROVED,
          role: MembershipRole.ADMIN,
          approvedAt: new Date(),
        },
      },
    },
  });

  res.status(201).json(club);
});

router.get('/', async (_req: AuthRequest, res: Response) => {
  const clubs = await prisma.club.findMany({
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  res.json(clubs);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { memberships: true } },
    },
  });
  if (!club) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  res.json(club);
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const updateData: {
    name?: string;
    homeOfficeRef?: string | null;
    address?: string | null;
    disciplinesOffered?: string[];
    acceptingNewMembers?: boolean;
    openingTimes?: string | null;
    description?: string | null;
  } = {};

  if ('name' in parsed.data && typeof parsed.data.name === 'string') {
    updateData.name = parsed.data.name;
  }
  if ('homeOfficeRef' in parsed.data) {
    updateData.homeOfficeRef = normalizeOptionalText(parsed.data.homeOfficeRef);
  }
  if ('address' in parsed.data) {
    updateData.address = normalizeOptionalText(parsed.data.address);
  }
  if ('disciplinesOffered' in parsed.data) {
    updateData.disciplinesOffered = normalizeDisciplines(parsed.data.disciplinesOffered);
  }
  if ('acceptingNewMembers' in parsed.data && typeof parsed.data.acceptingNewMembers === 'boolean') {
    updateData.acceptingNewMembers = parsed.data.acceptingNewMembers;
  }
  if ('openingTimes' in parsed.data) {
    updateData.openingTimes = normalizeOptionalText(parsed.data.openingTimes);
  }
  if ('description' in parsed.data) {
    updateData.description = normalizeOptionalText(parsed.data.description);
  }

  const club = await prisma.club.update({
    where: { id: clubId },
    data: updateData,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { memberships: true } },
    },
  });

  res.json(club);
});

router.get('/:id/public-site', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await ensurePublicSiteProfile(clubId);
  const payload = await getPublicSitePayload(clubId, 'id');
  if (!payload) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  const domains = await prisma.clubPublicDomain.findMany({
    where: { clubId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  const posts = await prisma.clubPublicBlogPost.findMany({
    where: { clubId },
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json({ ...payload, domains, posts });
});

router.patch('/:id/public-site', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = publicSiteProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const updateData: {
    vanitySlug?: string | null;
    heroTitle?: string | null;
    heroSubtitle?: string | null;
    headerImageUrl?: string | null;
    headerImageAlt?: string | null;
  } = {};

  if ('vanitySlug' in parsed.data) {
    const slug = sanitizeNullableText(parsed.data.vanitySlug, 60);
    updateData.vanitySlug = slug ? normalizeVanitySlug(slug) : null;
  }
  if ('heroTitle' in parsed.data) {
    updateData.heroTitle = sanitizeNullableText(parsed.data.heroTitle, 120);
  }
  if ('heroSubtitle' in parsed.data) {
    updateData.heroSubtitle = sanitizeNullableText(parsed.data.heroSubtitle, 280);
  }
  if ('headerImageUrl' in parsed.data) {
    updateData.headerImageUrl = sanitizeNullableText(parsed.data.headerImageUrl, 2000);
  }
  if ('headerImageAlt' in parsed.data) {
    updateData.headerImageAlt = sanitizeNullableText(parsed.data.headerImageAlt, 160);
  }

  await ensurePublicSiteProfile(clubId);
  try {
    const profile = await prisma.clubPublicSiteProfile.update({
      where: { clubId },
      data: updateData,
    });
    res.json(profile);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as any).code : undefined;
    if (code === 'P2002') { res.status(409).json({ error: 'Vanity slug is already in use' }); return; }
    throw error;
  }
});

router.put('/:id/public-site/sessions', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = z.object({ sessions: z.array(publicSessionBlockSchema).max(50) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const sessions = await prisma.$transaction(async tx => {
    await tx.clubPublicSessionBlock.deleteMany({ where: { clubId } });
    if (parsed.data.sessions.length === 0) {
      return [];
    }
    await tx.clubPublicSessionBlock.createMany({
      data: parsed.data.sessions.map((session, index) => ({
        clubId,
        dayLabel: session.dayLabel.trim(),
        sessionType: session.sessionType.trim(),
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        notes: sanitizeNullableText(session.notes, 200),
        sortOrder: index,
      })),
    });
    return tx.clubPublicSessionBlock.findMany({ where: { clubId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  });

  res.json({ sessions });
});

router.put('/:id/public-site/announcements', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = z.object({ announcements: z.array(publicAnnouncementSchema).max(20) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const announcements = await prisma.$transaction(async tx => {
    await tx.clubPublicAnnouncement.deleteMany({ where: { clubId } });
    if (parsed.data.announcements.length === 0) {
      return [];
    }
    await tx.clubPublicAnnouncement.createMany({
      data: parsed.data.announcements.map((item, index) => ({
        clubId,
        title: item.title.trim(),
        message: item.message.trim(),
        variant: item.variant,
        startsAt: item.startsAt ? new Date(item.startsAt) : null,
        endsAt: item.endsAt ? new Date(item.endsAt) : null,
        isEnabled: item.isEnabled,
        sortOrder: index,
      })),
    });
    return tx.clubPublicAnnouncement.findMany({ where: { clubId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  });

  res.json({ announcements });
});

router.get('/:id/public-site/blog-posts', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const posts = await prisma.clubPublicBlogPost.findMany({
    where: { clubId },
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json(posts);
});

router.post('/:id/public-site/blog-posts', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = publicBlogPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const generatedSlugBase = sanitizeNullableText(parsed.data.slug, 120) || slugFromTitle(parsed.data.title);
  const slug = normalizeVanitySlug(generatedSlugBase);
  if (!slug) {
    res.status(400).json({ error: 'A valid post slug is required' });
    return;
  }

  try {
    const post = await prisma.clubPublicBlogPost.create({
      data: {
        clubId,
        title: parsed.data.title.trim(),
        slug,
        excerpt: sanitizeNullableText(parsed.data.excerpt, 260),
        markdownBody: parsed.data.markdownBody,
        isPublished: parsed.data.isPublished,
        publishedAt: parsed.data.isPublished
          ? (parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : new Date())
          : null,
      },
    });
    res.status(201).json(post);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Post slug must be unique per club' });
      return;
    }
    throw error;
  }
});

router.patch('/:id/public-site/blog-posts/:postId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const postId = req.params.postId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = publicBlogPostUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const updateData: {
    title?: string;
    slug?: string;
    excerpt?: string | null;
    markdownBody?: string;
    isPublished?: boolean;
    publishedAt?: Date | null;
  } = {};
  if ('title' in parsed.data && parsed.data.title) updateData.title = parsed.data.title.trim();
  if ('slug' in parsed.data && parsed.data.slug) {
    const normalizedSlug = normalizeVanitySlug(parsed.data.slug);
    if (!normalizedSlug) {
      res.status(400).json({ error: 'Invalid slug' });
      return;
    }
    updateData.slug = normalizedSlug;
  }
  if ('excerpt' in parsed.data) updateData.excerpt = sanitizeNullableText(parsed.data.excerpt, 260);
  if ('markdownBody' in parsed.data && parsed.data.markdownBody) updateData.markdownBody = parsed.data.markdownBody;
  if ('isPublished' in parsed.data && typeof parsed.data.isPublished === 'boolean') {
    updateData.isPublished = parsed.data.isPublished;
    updateData.publishedAt = parsed.data.isPublished
      ? (parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : new Date())
      : null;
  } else if ('publishedAt' in parsed.data) {
    updateData.publishedAt = parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null;
  }

  try {
    const post = await prisma.clubPublicBlogPost.updateMany({
      where: { id: postId, clubId },
      data: updateData,
    });
    if (post.count !== 1) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const refreshed = await prisma.clubPublicBlogPost.findUnique({ where: { id: postId } });
    res.json(refreshed);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Post slug must be unique per club' });
      return;
    }
    throw error;
  }
});

router.delete('/:id/public-site/blog-posts/:postId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const postId = req.params.postId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const removed = await prisma.clubPublicBlogPost.deleteMany({ where: { id: postId, clubId } });
  if (removed.count !== 1) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  res.status(204).send();
});

router.get('/:id/public-site/domains', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const domains = await prisma.clubPublicDomain.findMany({
    where: { clubId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  res.json({ expectedCnameTarget: getExpectedCnameTarget(), domains });
});

router.post('/:id/public-site/domains', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = publicDomainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const normalized = normalizeDomain(parsed.data.domain);
  if (!normalized) {
    res.status(400).json({ error: 'Invalid domain' });
    return;
  }

  try {
    const domain = await prisma.clubPublicDomain.create({
      data: {
        clubId,
        domain: normalized,
        verificationToken: buildVerificationToken(normalized),
        expectedCnameTarget: getExpectedCnameTarget(),
      },
    });
    res.status(201).json(domain);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Domain is already in use' });
      return;
    }
    throw error;
  }
});

router.post('/:id/public-site/domains/:domainId/check-verification', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const domainId = req.params.domainId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const record = await prisma.clubPublicDomain.findFirst({
    where: { id: domainId, clubId },
  });
  if (!record) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }

  let resolvedCnames: string[] = [];
  try {
    resolvedCnames = await dns.resolveCname(record.domain);
  } catch {
    resolvedCnames = [];
  }
  const expected = record.expectedCnameTarget.toLowerCase();
  const verified = resolvedCnames.some(item => item.toLowerCase().replace(/\.$/, '') === expected.replace(/\.$/, ''));
  const updated = await prisma.clubPublicDomain.update({
    where: { id: domainId },
    data: {
      status: verified ? 'VERIFIED' : 'PENDING',
      verifiedAt: verified ? new Date() : null,
      lastCheckedAt: new Date(),
      isActive: verified ? record.isActive : false,
    },
  });

  res.json({ verified, resolvedCnames, domain: updated });
});

router.patch('/:id/public-site/domains/:domainId/activation', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const domainId = req.params.domainId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = publicDomainActivationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const domain = await prisma.clubPublicDomain.findFirst({ where: { id: domainId, clubId } });
  if (!domain) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  if (parsed.data.isActive && domain.status !== 'VERIFIED') {
    res.status(409).json({ error: 'Domain must be verified before activation' });
    return;
  }

  if (parsed.data.isActive) {
    await prisma.$transaction([
      prisma.clubPublicDomain.updateMany({
        where: { clubId, id: { not: domainId } },
        data: { isActive: false },
      }),
      prisma.clubPublicDomain.update({
        where: { id: domainId },
        data: { isActive: true },
      }),
    ]);
  } else {
    await prisma.clubPublicDomain.update({
      where: { id: domainId },
      data: { isActive: false },
    });
  }

  const domains = await prisma.clubPublicDomain.findMany({
    where: { clubId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  res.json({ domains });
});

router.delete('/:id/public-site/domains/:domainId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const domainId = req.params.domainId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const removed = await prisma.clubPublicDomain.deleteMany({ where: { id: domainId, clubId } });
  if (removed.count !== 1) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  res.status(204).send();
});

router.get('/:id/members', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const members = await prisma.clubMembership.findMany({
    where: { clubId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerifiedAt: true,
          address: true,
          placeOfBirth: true,
          dateOfBirth: true,
          firearmCertificateNumber: true,
          firearmCertificateExpiry: true,
          shotgunCertificateNumber: true,
          shotgunCertificateExpiry: true,
          gdprConsentDate: true,
          section21Declarations: {
            orderBy: { signedDate: 'desc' },
            take: 1,
            select: {
              nextDueDate: true,
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const withSection21Status = members.map(member => {
    const { section21Declarations, ...userWithoutDeclarations } = member.user;
    const latestDeclaration = section21Declarations[0];
    let section21Status: 'SIGNED' | 'EXPIRED' | 'PENDING_RENEWAL' | 'NOT_DECLARED' = 'NOT_DECLARED';

    if (latestDeclaration) {
      section21Status = deriveDeclarationStatusFromDueDate(latestDeclaration.nextDueDate, now);
    }

    return {
      ...member,
      user: userWithoutDeclarations,
      section21Status,
    };
  });

  res.json(withSection21Status);
});

router.get('/:id/members/export.csv', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const csv = await buildMemberDemographicsCsv(clubId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${clubId}-members.csv"`);
  res.send(csv);
});

router.get('/:id/members/:userId/profile-history', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const membership = await prisma.clubMembership.findUnique({
    where: {
      userId_clubId: {
        userId: targetUserId,
        clubId,
      },
    },
    select: {
      approvedAt: true,
    },
  });

  if (!membership) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  if (!membership.approvedAt) {
    res.json([]);
    return;
  }

  const history = await getUserProfileHistorySince({
    userId: targetUserId,
    since: membership.approvedAt,
  });

  res.json(history);
});

router.post('/:id/join', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  const existing = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId: req.user!.id, clubId } },
  });
  if (existing) {
    if (existing.status === MembershipStatus.INACTIVE) {
      const membership = await prisma.clubMembership.update({
        where: { userId_clubId: { userId: req.user!.id, clubId } },
        data: {
          status: MembershipStatus.PENDING,
          role: MembershipRole.MEMBER,
        },
      });
      res.status(201).json(membership);
      return;
    }
    res.status(409).json({ error: 'Already a member or request pending' });
    return;
  }
  const membership = await prisma.clubMembership.create({
    data: {
      userId: req.user!.id,
      clubId,
      status: MembershipStatus.PENDING,
      role: MembershipRole.MEMBER,
    },
  });
  res.status(201).json(membership);
});

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['MEMBER', 'ADMIN', 'PROBATIONARY_MEMBER', 'JUNIOR']).default('MEMBER'),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

router.post('/:id/invites', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const invite = await prisma.clubInvite.create({
    data: {
      clubId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000),
      createdByUserId: req.user!.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });
  const emailSent = await emailService.sendInviteEmail({
    to: invite.email,
    clubName: club?.name ?? 'our club',
    role: invite.role,
    inviteToken: invite.token,
  });

  res.status(201).json({ ...invite, emailSent });
});

router.post('/:id/invites/:inviteId/send', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const inviteId = req.params.inviteId as string;

  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invite = await prisma.clubInvite.findFirst({
    where: {
      id: inviteId,
      clubId,
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      redeemedAt: true,
      expiresAt: true,
    },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  if (invite.redeemedAt) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }
  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });
  const emailSent = await emailService.sendInviteEmail({
    to: invite.email,
    clubName: club?.name ?? 'our club',
    role: invite.role,
    inviteToken: invite.token,
  });

  res.json({
    success: true,
    emailSent,
    message: emailSent
      ? 'Invite email sent.'
      : 'Invite was found, but email sending is disabled or failed.',
  });
});

router.delete('/:id/invites/:inviteId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const inviteId = req.params.inviteId as string;

  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invite = await prisma.clubInvite.findFirst({
    where: {
      id: inviteId,
      clubId,
    },
    select: {
      id: true,
      redeemedAt: true,
    },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  if (invite.redeemedAt) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }

  const deleted = await prisma.clubInvite.deleteMany({
    where: {
      id: inviteId,
      clubId,
      redeemedAt: null,
    },
  });

  if (deleted.count !== 1) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }

  res.status(204).send();
});

router.get('/:id/invites', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invites = await prisma.clubInvite.findMany({
    where: { clubId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      redeemedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(invites);
});

router.get('/invites/:token', async (req: AuthRequest, res: Response) => {
  const token = req.params.token as string;
  const invite = await prisma.clubInvite.findUnique({
    where: { token },
    include: { club: { select: { id: true, name: true } } },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  if (invite.redeemedAt) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }
  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }
  if (req.user!.email.toLowerCase() !== invite.email.toLowerCase()) {
    res.status(403).json({ error: 'Invite email does not match your account' });
    return;
  }

  res.json({
    id: invite.id,
    token: invite.token,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    club: invite.club,
  });
});

router.post('/invites/:token/accept', async (req: AuthRequest, res: Response) => {
  const token = req.params.token as string;

  try {
    const membership = await prisma.$transaction(async tx => {
      const invite = await tx.clubInvite.findUnique({ where: { token } });
      if (!invite) {
        throw new Error('INVITE_NOT_FOUND');
      }
      if (invite.redeemedAt) {
        throw new Error('INVITE_REDEEMED');
      }
      if (invite.expiresAt < new Date()) {
        throw new Error('INVITE_EXPIRED');
      }
      if (req.user!.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new Error('INVITE_EMAIL_MISMATCH');
      }

      const existing = await tx.clubMembership.findUnique({
        where: {
          userId_clubId: {
            userId: req.user!.id,
            clubId: invite.clubId,
          },
        },
      });

      if (existing?.status === MembershipStatus.APPROVED) {
        throw new Error('ALREADY_MEMBER');
      }

      const savedMembership = existing
        ? await tx.clubMembership.update({
            where: {
              userId_clubId: {
                userId: req.user!.id,
                clubId: invite.clubId,
              },
            },
            data: {
              role: invite.role,
              status: MembershipStatus.PENDING,
            },
          })
        : await tx.clubMembership.create({
            data: {
              userId: req.user!.id,
              clubId: invite.clubId,
              role: invite.role,
              status: MembershipStatus.PENDING,
            },
          });

      const markRedeemed = await tx.clubInvite.updateMany({
        where: {
          id: invite.id,
          redeemedAt: null,
        },
        data: {
          redeemedAt: new Date(),
          redeemedByUserId: req.user!.id,
        },
      });

      if (markRedeemed.count !== 1) {
        throw new Error('INVITE_REDEEMED');
      }

      return savedMembership;
    });

    res.json({
      success: true,
      message: 'Invite accepted. Your membership is pending admin approval.',
      membership,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'INVITE_ACCEPT_FAILED';
    if (message === 'INVITE_NOT_FOUND') {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (message === 'INVITE_REDEEMED') {
      res.status(409).json({ error: 'Invite already redeemed' });
      return;
    }
    if (message === 'INVITE_EXPIRED') {
      res.status(410).json({ error: 'Invite expired' });
      return;
    }
    if (message === 'INVITE_EMAIL_MISMATCH') {
      res.status(403).json({ error: 'Invite email does not match your account' });
      return;
    }
    if (message === 'ALREADY_MEMBER') {
      res.status(409).json({ error: 'You are already an approved member of this club' });
      return;
    }

    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

const updateMemberSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']).optional(),
  role: z.enum(['MEMBER', 'ADMIN', 'PROBATIONARY_MEMBER', 'JUNIOR']).optional(),
});

router.patch('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { status, role } = parsed.data;
  if (!status && !role) {
    res.status(400).json({ error: 'Must provide status or role to update' });
    return;
  }

  const existingMembership = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    select: { role: true, status: true, approvedAt: true },
  });
  if (!existingMembership) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  // Validate: cannot demote the last admin
  if (role && role !== MembershipRole.ADMIN) {
    if (existingMembership.role === MembershipRole.ADMIN) {
      const adminCount = await prisma.clubMembership.count({
        where: {
          clubId,
          role: MembershipRole.ADMIN,
          status: MembershipStatus.APPROVED,
        },
      });
      if (adminCount === 1) {
        res.status(409).json({ error: 'Cannot demote the last admin of the club' });
        return;
      }
    }
  }

  const updateData: {
    status?: MembershipStatus;
    role?: MembershipRole;
    approvedAt?: Date;
  } = {};

  if (status) {
    updateData.status = status;
    if (status === MembershipStatus.APPROVED && !existingMembership.approvedAt) {
      updateData.approvedAt = new Date();
    }
  }
  if (role) {
    updateData.role = role;
  }

  const updated = await prisma.clubMembership.update({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    data: updateData,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (status) {
    auditMemberStatusChange(req.ip, req.user!.id, clubId, targetUserId, status);
  }
  if (role) {
    auditMemberRoleChange(req.ip, req.user!.id, clubId, targetUserId, role);
  }

  res.json(updated);
});

router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const adminUserId = req.user!.id;
  const isAdmin = await ensureAdminForClub(adminUserId, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (targetUserId === adminUserId) {
    res.status(409).json({ error: 'You cannot remove yourself from the club' });
    return;
  }

  const targetMember = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!targetMember) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }
  if (targetMember.status === MembershipStatus.INACTIVE) {
    res.status(200).json(targetMember);
    return;
  }

  if (targetMember.role === MembershipRole.ADMIN && targetMember.status === MembershipStatus.APPROVED) {
    const adminCount = await prisma.clubMembership.count({
      where: {
        clubId,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.APPROVED,
      },
    });
    if (adminCount === 1) {
      res.status(409).json({ error: 'Cannot remove the last approved admin of the club' });
      return;
    }
  }

  const updated = await prisma.clubMembership.update({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    data: { status: MembershipStatus.INACTIVE },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  auditMemberStatusChange(req.ip, adminUserId, clubId, targetUserId, MembershipStatus.INACTIVE);
  res.json(updated);
});

const firearmSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().min(1),
  serialNumber: z.string().min(1),
});

const firearmFavoriteSchema = z.object({
  isFavorite: z.boolean(),
});

router.get('/:id/firearms', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const firearms = await prisma.firearm.findMany({
    where: { clubId, ownerType: OwnerType.CLUB, deletedAt: null },
    orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(firearms);
});

router.post('/:id/firearms', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const firearm = await prisma.firearm.create({
    data: {
      ...parsed.data,
      ownerType: OwnerType.CLUB,
      clubId,
    },
  });
  res.status(201).json(firearm);
});

router.delete('/:id/firearms/:firearmId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const firearmId = req.params.firearmId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // Verify the firearm actually belongs to this club before deleting.
  // Without this check an admin of one club could delete a firearm owned by
  // another club by supplying a foreign firearmId in the URL.
  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, clubId, ownerType: OwnerType.CLUB, deletedAt: null },
  });
  if (!firearm) {
    auditFirearmDeleteDenied(req.ip, req.user!.id, clubId, firearmId);
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }
  await prisma.firearm.update({
    where: { id: firearmId },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
});

router.patch('/:id/firearms/:firearmId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const firearmId = req.params.firearmId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, clubId, ownerType: OwnerType.CLUB, deletedAt: null },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }

  const updated = await prisma.firearm.update({
    where: { id: firearmId },
    data: parsed.data,
  });

  res.json(updated);
});

router.patch('/:id/firearms/:firearmId/favorite', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const firearmId = req.params.firearmId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = firearmFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, clubId, ownerType: OwnerType.CLUB, deletedAt: null },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }

  const updated = await prisma.firearm.update({
    where: { id: firearmId },
    data: { isFavorite: parsed.data.isFavorite },
  });

  res.json(updated);
});

// Club Settings endpoints for Google Wallet
const hexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format').optional();

const updateClubSettingsSchema = z.object({
  logoUrl: z.string().url('Invalid URL').optional().nullable(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  passIssuingEnabled: z.boolean().optional(),
  memberCardSignInEnabled: z.boolean().optional(),
  membershipCardAverageMetric: z.nativeEnum(MembershipCardAverageMetric).optional(),
  membershipCardAverageDiscipline: z.string().trim().min(1).max(80).optional().nullable(),
  backupEnabled: z.boolean().optional(),
  ammoSalesLookbackDays: z.number().int().min(1).max(365).optional(),
  ammoDefaultLeadTimeDays: z.number().int().min(1).max(365).optional(),
  ammoDefaultSafetyStockDays: z.number().int().min(0).max(365).optional(),
  ammoDefaultSalesSafeId: z.string().min(1).optional().nullable(),
}).superRefine((data, ctx) => {
  if (
    data.membershipCardAverageMetric &&
    (data.membershipCardAverageMetric === MembershipCardAverageMetric.DISCIPLINE_ALL_TIME ||
      data.membershipCardAverageMetric === MembershipCardAverageMetric.DISCIPLINE_LAST_10) &&
    !data.membershipCardAverageDiscipline
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['membershipCardAverageDiscipline'],
      message: 'membershipCardAverageDiscipline is required when discipline average metric is selected',
    });
  }
});

router.get('/:id/settings', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  let settings = await prisma.clubSettings.findUnique({
    where: { clubId },
  });

  if (!settings) {
    // Create default settings if they don't exist
    settings = await prisma.clubSettings.create({
      data: {
        clubId,
        primaryColor: '#1f2937',
        secondaryColor: '#374151',
        accentColor: '#3b82f6',
        passIssuingEnabled: false,
        memberCardSignInEnabled: false,
        membershipCardAverageMetric: MembershipCardAverageMetric.OVERALL_LAST_10,
        membershipCardAverageDiscipline: null,
        backupEnabled: false,
        ammoSalesLookbackDays: 30,
        ammoDefaultLeadTimeDays: 14,
        ammoDefaultSafetyStockDays: 7,
        ammoDefaultSalesSafeId: null,
      },
    });
  }

  res.json(settings);
});

router.post('/:id/settings', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateClubSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const updateData: {
    logoUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    passIssuingEnabled?: boolean;
    memberCardSignInEnabled?: boolean;
    membershipCardAverageMetric?: MembershipCardAverageMetric;
    membershipCardAverageDiscipline?: string | null;
    backupEnabled?: boolean;
    ammoSalesLookbackDays?: number;
    ammoDefaultLeadTimeDays?: number;
    ammoDefaultSafetyStockDays?: number;
    ammoDefaultSalesSafeId?: string | null;
  } = {};

  if ('logoUrl' in parsed.data) {
    updateData.logoUrl = parsed.data.logoUrl ? normalizeOptionalText(parsed.data.logoUrl) : null;
  }
  if ('primaryColor' in parsed.data && parsed.data.primaryColor) {
    updateData.primaryColor = parsed.data.primaryColor;
  }
  if ('secondaryColor' in parsed.data && parsed.data.secondaryColor) {
    updateData.secondaryColor = parsed.data.secondaryColor;
  }
  if ('accentColor' in parsed.data && parsed.data.accentColor) {
    updateData.accentColor = parsed.data.accentColor;
  }
  if ('passIssuingEnabled' in parsed.data && typeof parsed.data.passIssuingEnabled === 'boolean') {
    updateData.passIssuingEnabled = parsed.data.passIssuingEnabled;
  }
  if ('memberCardSignInEnabled' in parsed.data && typeof parsed.data.memberCardSignInEnabled === 'boolean') {
    updateData.memberCardSignInEnabled = parsed.data.memberCardSignInEnabled;
  }
  if ('membershipCardAverageMetric' in parsed.data && parsed.data.membershipCardAverageMetric) {
    updateData.membershipCardAverageMetric = parsed.data.membershipCardAverageMetric;
  }
  if ('membershipCardAverageDiscipline' in parsed.data) {
    updateData.membershipCardAverageDiscipline = parsed.data.membershipCardAverageDiscipline
      ? parsed.data.membershipCardAverageDiscipline.trim().replace(/\s+/g, ' ')
      : null;
  }
  if ('backupEnabled' in parsed.data && typeof parsed.data.backupEnabled === 'boolean') {
    updateData.backupEnabled = parsed.data.backupEnabled;
  }
  if ('ammoSalesLookbackDays' in parsed.data && typeof parsed.data.ammoSalesLookbackDays === 'number') {
    updateData.ammoSalesLookbackDays = parsed.data.ammoSalesLookbackDays;
  }
  if ('ammoDefaultLeadTimeDays' in parsed.data && typeof parsed.data.ammoDefaultLeadTimeDays === 'number') {
    updateData.ammoDefaultLeadTimeDays = parsed.data.ammoDefaultLeadTimeDays;
  }
  if ('ammoDefaultSafetyStockDays' in parsed.data && typeof parsed.data.ammoDefaultSafetyStockDays === 'number') {
    updateData.ammoDefaultSafetyStockDays = parsed.data.ammoDefaultSafetyStockDays;
  }
  if ('ammoDefaultSalesSafeId' in parsed.data) {
    updateData.ammoDefaultSalesSafeId = parsed.data.ammoDefaultSalesSafeId ?? null;
  }

  if (typeof updateData.ammoDefaultSalesSafeId === 'string') {
    const safe = await prisma.ammunitionSafe.findFirst({
      where: {
        id: updateData.ammoDefaultSalesSafeId,
        clubId,
      },
      select: { id: true },
    });
    if (!safe) {
      res.status(400).json({ error: 'Default sales safe must belong to this club' });
      return;
    }
  }

  let settings = await prisma.clubSettings.findUnique({
    where: { clubId },
  });

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { disciplinesOffered: true },
  });

  const existingDisciplines = Array.isArray(club?.disciplinesOffered)
    ? club!.disciplinesOffered
      .map(v => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''))
      .filter(Boolean)
    : [];
  const nextDisciplines = existingDisciplines;

  const nextMetric = updateData.membershipCardAverageMetric
    ?? settings?.membershipCardAverageMetric
    ?? MembershipCardAverageMetric.OVERALL_LAST_10;
  const nextDiscipline = updateData.membershipCardAverageDiscipline
    ?? settings?.membershipCardAverageDiscipline
    ?? null;

  if (
    (nextMetric === MembershipCardAverageMetric.DISCIPLINE_ALL_TIME
      || nextMetric === MembershipCardAverageMetric.DISCIPLINE_LAST_10)
    && !nextDiscipline
  ) {
    res.status(400).json({ error: 'A discipline must be selected for discipline-based membership card averages' });
    return;
  }

  if (nextDiscipline && nextDisciplines.length > 0) {
    const matched = nextDisciplines.some(d => d.toLowerCase() === nextDiscipline.toLowerCase());
    if (!matched) {
      res.status(400).json({ error: 'membershipCardAverageDiscipline must be one of the club\'s offered disciplines' });
      return;
    }
  }

  if (!settings) {
    settings = await prisma.clubSettings.create({
      data: {
        clubId,
        ...updateData,
      },
    });
  } else {
    settings = await prisma.clubSettings.update({
      where: { clubId },
      data: updateData,
    });
  }

  res.json(settings);
});

const backupOAuthStartSchema = z.object({
  driveFolderId: z.string().min(1).optional(),
});

const backupFolderListQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
});

const backupFolderSelectSchema = z.object({
  driveFolderId: z.string().min(1),
});

router.get('/:id/settings/backups/google-drive/status', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const [settings, connection, latestRuns] = await Promise.all([
    prisma.clubSettings.findUnique({ where: { clubId }, select: { backupEnabled: true } }),
    prisma.googleDriveConnection.findUnique({
      where: { clubId },
      select: {
        status: true,
        driveFolderId: true,
        encryptedRefreshToken: true,
        tokenIv: true,
        tokenAuthTag: true,
        linkedAt: true,
        disconnectedAt: true,
        updatedAt: true,
      },
    }),
    prisma.backupRun.findMany({
      where: { clubId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        dataset: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        error: true,
      },
    }),
  ]);

  const latestByDataset = Object.values(BackupDataset).reduce<Record<string, {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    error: string | null;
  } | null>>((acc, dataset) => {
    const run = latestRuns.find(r => r.dataset === dataset) ?? null;
    acc[dataset] = run ? {
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      error: run.error ?? null,
    } : null;
    return acc;
  }, {});

  let driveFolderName: string | null = null;
  if (connection?.driveFolderId
    && connection.status === GoogleDriveConnectionStatus.ACTIVE
    && connection.encryptedRefreshToken
    && connection.tokenIv
    && connection.tokenAuthTag) {
    driveFolderName = getCachedDriveFolderName(connection.driveFolderId);
    if (!driveFolderName) {
      try {
        const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
        const drive = new GoogleDriveBackupClient(refreshToken);
        const folder = await drive.getFolderMetadata(connection.driveFolderId);
        driveFolderName = folder?.name ?? null;
        if (folder?.name) {
          setCachedDriveFolderName(connection.driveFolderId, folder.name);
        }
      } catch {
        driveFolderName = null;
      }
    }
  }

  res.json({
    backupEnabled: settings?.backupEnabled ?? false,
    connection: connection
      ? {
          linked: connection.status === GoogleDriveConnectionStatus.ACTIVE,
          status: connection.status,
          driveFolderId: connection.driveFolderId,
          driveFolderName,
          linkedAt: connection.linkedAt,
          disconnectedAt: connection.disconnectedAt,
          updatedAt: connection.updatedAt,
        }
      : {
          linked: false,
          status: 'NONE',
          driveFolderId: null,
          driveFolderName: null,
          linkedAt: null,
          disconnectedAt: null,
          updatedAt: null,
        },
    latestByDataset,
  });
});

router.post('/:id/settings/backups/google-drive/link/start', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    assertGoogleDriveOAuthConfigured();
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Google Drive OAuth is not configured' });
    return;
  }

  const parsed = backupOAuthStartSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.googleDriveOAuthState.create({
    data: {
      state,
      clubId,
      userId: req.user!.id,
      nonce,
      expiresAt,
    },
  });

  if (parsed.data.driveFolderId) {
    await prisma.googleDriveConnection.upsert({
      where: { clubId },
      create: {
        clubId,
        linkedByUserId: req.user!.id,
        status: GoogleDriveConnectionStatus.DISCONNECTED,
        driveFolderId: parsed.data.driveFolderId.trim(),
        encryptedRefreshToken: '',
        tokenIv: '',
        tokenAuthTag: '',
      },
      update: {
        driveFolderId: parsed.data.driveFolderId.trim(),
      },
    });
  }

  res.json({
    authUrl: buildGoogleDriveAuthUrl(state),
    expiresAt,
  });
});

router.get('/:id/settings/backups/google-drive/folders', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = backupFolderListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const connection = await prisma.googleDriveConnection.findUnique({
    where: { clubId },
    select: {
      status: true,
      encryptedRefreshToken: true,
      tokenIv: true,
      tokenAuthTag: true,
    },
  });

  if (!connection || connection.status !== GoogleDriveConnectionStatus.ACTIVE) {
    res.status(400).json({ error: 'Link Google Drive before browsing folders' });
    return;
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
  const drive = new GoogleDriveBackupClient(refreshToken);
  const parentId = parsed.data.parentId;
  const currentFolder = parentId ? await drive.getFolderMetadata(parentId) : null;

  if (parentId && !currentFolder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  const folders = await drive.listFolders(parentId ?? 'root');
  res.json({
    currentFolder: currentFolder
      ? {
          id: currentFolder.id,
          name: currentFolder.name,
          parentId: currentFolder.parentId,
        }
      : null,
    folders,
  });
});

router.post('/:id/settings/backups/google-drive/folder', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = backupFolderSelectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const connection = await prisma.googleDriveConnection.findUnique({
    where: { clubId },
    select: {
      status: true,
      encryptedRefreshToken: true,
      tokenIv: true,
      tokenAuthTag: true,
    },
  });

  if (!connection || connection.status !== GoogleDriveConnectionStatus.ACTIVE) {
    res.status(400).json({ error: 'Link Google Drive before selecting a folder' });
    return;
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
  const drive = new GoogleDriveBackupClient(refreshToken);
  const folder = await drive.getFolderMetadata(parsed.data.driveFolderId);
  if (!folder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  await prisma.googleDriveConnection.update({
    where: { clubId },
    data: { driveFolderId: folder.id },
  });

  setCachedDriveFolderName(folder.id, folder.name);

  res.json({
    driveFolderId: folder.id,
    folderName: folder.name,
  });
});

router.get('/settings/backups/google-drive/callback', async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!state || !code) {
    res.status(400).json({ error: 'Missing OAuth state or code' });
    return;
  }

  const oauthState = await prisma.googleDriveOAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.userId !== req.user.id) {
    res.status(400).json({ error: 'Invalid OAuth state' });
    return;
  }
  if (oauthState.consumedAt || oauthState.expiresAt < new Date()) {
    res.status(400).json({ error: 'OAuth state expired or already used' });
    return;
  }

  let refreshToken: string;
  let scope: string | undefined;
  let expiryDate: Date | undefined;
  try {
    const exchanged = await exchangeGoogleOAuthCode(code);
    refreshToken = exchanged.refreshToken;
    scope = exchanged.scope;
    expiryDate = exchanged.expiryDate;
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to complete OAuth exchange' });
    return;
  }

  const encrypted = encryptSecret(refreshToken);
  const existingConnection = await prisma.googleDriveConnection.findUnique({
    where: { clubId: oauthState.clubId },
    select: { driveFolderId: true },
  });

  await prisma.$transaction([
    prisma.googleDriveOAuthState.update({
      where: { state: oauthState.state },
      data: { consumedAt: new Date() },
    }),
    prisma.googleDriveConnection.upsert({
      where: { clubId: oauthState.clubId },
      create: {
        clubId: oauthState.clubId,
        linkedByUserId: req.user.id,
        status: GoogleDriveConnectionStatus.ACTIVE,
        driveFolderId: existingConnection?.driveFolderId ?? null,
        encryptedRefreshToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenScope: scope,
        tokenExpiry: expiryDate,
        linkedAt: new Date(),
        disconnectedAt: null,
      },
      update: {
        linkedByUserId: req.user.id,
        status: GoogleDriveConnectionStatus.ACTIVE,
        encryptedRefreshToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenScope: scope,
        tokenExpiry: expiryDate,
        linkedAt: new Date(),
        disconnectedAt: null,
      },
    }),
  ]);

  const origin = process.env.CLIENT_ORIGIN?.trim();
  if (origin) {
    res.redirect(`${origin}/clubs/${oauthState.clubId}?backupDriveLinked=1`);
    return;
  }

  res.json({ success: true, clubId: oauthState.clubId });
});

router.post('/:id/settings/backups/google-drive/disconnect', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const connection = await prisma.googleDriveConnection.findUnique({ where: { clubId } });
  if (!connection) {
    res.status(404).json({ error: 'Google Drive connection not found' });
    return;
  }

  if (connection.encryptedRefreshToken && connection.tokenIv && connection.tokenAuthTag) {
    try {
      const token = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
      await revokeGoogleToken(token);
    } catch {
      // best effort revoke; continue to disconnect locally
    }
  }

  await prisma.$transaction([
    prisma.googleDriveConnection.update({
      where: { clubId },
      data: {
        status: GoogleDriveConnectionStatus.DISCONNECTED,
        disconnectedAt: new Date(),
      },
    }),
    prisma.clubSettings.upsert({
      where: { clubId },
      create: {
        clubId,
        backupEnabled: false,
      },
      update: {
        backupEnabled: false,
      },
    }),
  ]);

  res.json({ success: true });
});

export default router;
