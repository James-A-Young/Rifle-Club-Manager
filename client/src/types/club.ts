/** Shared domain types used across club dashboard, kiosk, and sign-in screens. */

export interface SimpleFirearm {
  id: string;
  friendlyName?: string | null;
  make: string;
  model: string;
  caliber: string;
  isFavorite?: boolean;
}

export interface Firearm extends SimpleFirearm {
  serialNumber: string;
}

export interface Club {
  id: string;
  name: string;
  homeOfficeRef?: string | null;
  address?: string | null;
  disciplinesOffered?: string[] | null;
  acceptingNewMembers: boolean;
  openingTimes?: string | null;
  description?: string | null;
}

export type PublicAnnouncementVariant = 'INFO' | 'WARNING' | 'SUCCESS';

export interface ClubPublicSessionBlock {
  id: string;
  clubId: string;
  dayLabel: string;
  sessionType: string;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
  sortOrder: number;
}

export interface ClubPublicAnnouncement {
  id: string;
  clubId: string;
  title: string;
  message: string;
  variant: PublicAnnouncementVariant;
  startsAt?: string | null;
  endsAt?: string | null;
  isEnabled: boolean;
  sortOrder: number;
}

export interface ClubPublicBlogPostPreview {
  id: string;
  clubId: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

export interface ClubPublicBlogPost extends ClubPublicBlogPostPreview {
  markdownBody: string;
  renderedHtml?: string;
  isPublished: boolean;
  updatedAt?: string;
}

export interface ClubPublicBlogPostListResponse {
  posts: ClubPublicBlogPostPreview[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ClubPublicDomain {
  id: string;
  clubId: string;
  domain: string;
  verificationToken: string;
  expectedCnameTarget: string;
  status: 'PENDING' | 'VERIFIED';
  isActive: boolean;
  verifiedAt?: string | null;
  lastCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClubPublicSiteProfile {
  vanitySlug?: string | null;
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  headerImageUrl?: string | null;
  headerImageAlt?: string | null;
  sessions: ClubPublicSessionBlock[];
  announcements: ClubPublicAnnouncement[];
  blogPosts: ClubPublicBlogPostPreview[];
  canonicalUrl: string;
  resolvedBy: 'id' | 'vanity' | 'domain';
}

export interface ClubPublicPageData extends Club {
  createdAt: string;
  _count: { memberships: number };
  publicSite: ClubPublicSiteProfile;
}

export interface MemberUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt?: string | null;
  address?: string;
  placeOfBirth?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  disabilityStatus?: 'NOT_DISABLED' | 'DISABLED' | 'PREFER_NOT_TO_SAY';
  guardianDeclarationAccepted?: boolean;
  guardianFullName?: string | null;
  guardianPhoneNumber?: string | null;
  guardianDeclarationAt?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhoneNumber?: string | null;
  phoneNumber?: string;
  firearmCertificateNumber?: string | null;
  firearmCertificateExpiry?: string | null;
  shotgunCertificateNumber?: string | null;
  shotgunCertificateExpiry?: string | null;
  gdprConsentDate?: string;
}

export interface Member {
  id: string;
  userId: string;
  status: string;
  role: string;
  section21Status?: 'SIGNED' | 'EXPIRED' | 'PENDING_RENEWAL' | 'NOT_DECLARED';
  user: MemberUser;
}

export interface SignInLink {
  id: string;
  cryptoToken: string;
  expiresAt: string;
  mode?: 'KIOSK' | 'QR';
}

export type MembershipRoleType = 'MEMBER' | 'ADMIN' | 'PROBATIONARY_MEMBER' | 'JUNIOR';

export interface ClubInvite {
  id: string;
  email: string;
  role: MembershipRoleType;
  token: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
  emailSent?: boolean;
}

export interface ClubSettings {
  clubId: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  passIssuingEnabled: boolean;
  memberCardSignInEnabled: boolean;
  membershipCardAverageMetric?:
    | 'OVERALL_LAST_10'
    | 'OVERALL_ALL_TIME'
    | 'COMPETITION_LAST_10'
    | 'COMPETITION_ALL_TIME'
    | 'PRACTICE_LAST_10'
    | 'PRACTICE_ALL_TIME'
    | 'DISCIPLINE_LAST_10'
    | 'DISCIPLINE_ALL_TIME';
  membershipCardAverageDiscipline?: string | null;
  backupEnabled: boolean;
  ammoSalesLookbackDays: number;
  ammoDefaultLeadTimeDays: number;
  ammoDefaultSafetyStockDays: number;
  ammoDefaultSalesSafeId?: string | null;
}

export interface BackupDatasetRunStatus {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface GoogleDriveBackupStatus {
  backupEnabled: boolean;
  connection: {
    linked: boolean;
    status: string;
    driveFolderId: string | null;
    driveFolderName: string | null;
    linkedAt: string | null;
    disconnectedAt: string | null;
    updatedAt: string | null;
  };
  latestByDataset: Record<string, BackupDatasetRunStatus | null>;
}

export interface GoogleDriveFolderItem {
  id: string;
  name: string;
}

export interface GoogleDriveFolderListResponse {
  currentFolder: {
    id: string;
    name: string;
    parentId: string | null;
  } | null;
  folders: GoogleDriveFolderItem[];
}

export interface AmmunitionTypePriceHistory {
  id: string;
  pricePence: number;
  createdAt: string;
}

export interface AmmunitionType {
  id: string;
  name: string;
  currentPricePence: number;
  reorderLevelQuantity?: number | null;
  reorderQuantity?: number | null;
  leadTimeDays?: number | null;
  safetyStockDays?: number | null;
  priceHistory: AmmunitionTypePriceHistory[];
}

export type PaymentMethod = 'CASH' | 'ONLINE' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

export interface AmmunitionSafe {
  id: string;
  name: string;
}

export interface AmmunitionStock {
  id: string;
  ammunitionTypeId: string;
  ammunitionSafeId: string;
  quantity: number;
}

export interface AmmunitionSale {
  id: string;
  buyerFirstName: string;
  buyerLastName: string;
  buyerUserId: string | null;
  soldByUserId: string;
  quantity: number;
  unitPricePence: number;
  totalPricePence: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  buyer?: {
    id: string;
    name: string;
    email: string;
  } | null;
  soldBy: {
    id: string;
    name: string;
    email: string;
  };
  ammunitionType: {
    id: string;
    name: string;
  };
  ammunitionSafe: {
    id: string;
    name: string;
  };
}

export interface AmmunitionReorderAnalysisRow {
  ammunitionTypeId: string;
  ammunitionTypeName: string;
  lookbackDays: number;
  currentStock: number;
  soldInWindow: number;
  avgDailyUsage: number;
  leadTimeDays: number;
  safetyStockDays: number;
  reorderPoint: number;
  suggestedReorderPoint: number;
  suggestedQuantity: number;
  daysUntilStockout: number | null;
  status: 'OK' | 'LOW' | 'CRITICAL';
}

export interface AmmunitionReorderAnalysisResponse {
  lookbackDays: number;
  rows: AmmunitionReorderAnalysisRow[];
}

export interface CashBox {
  id: string;
  clubId: string;
  balancePence: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashBoxTransaction {
  id: string;
  clubId: string;
  reason: 'AMMUNITION_SALE' | 'ADD_FLOAT' | 'DONATION' | 'FEE_PAYMENT' | 'BANKED_CASH';
  amountPence: number;
  balanceAfterPence: number;
  relatedSaleId?: string | null;
  createdByUserId: string;
  note?: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  relatedSale?: {
    id: string;
    buyerFirstName: string;
    buyerLastName: string;
    quantity: number;
    totalPricePence: number;
    paymentMethod: PaymentMethod;
  } | null;
}

export interface AmmunitionStockInput {
  id: string;
  quantity: number;
  note?: string | null;
  createdAt: string;
  ammunitionType: { id: string; name: string };
  ammunitionSafe: { id: string; name: string };
  inputBy: { id: string; name: string; email: string };
}

export interface ClubFormData {
  name: string;
  homeOfficeRef: string;
  address: string;
  disciplinesOffered: string[];
  acceptingNewMembers: boolean;
  openingTimes: string;
  description: string;
}

export interface EditingRoleState {
  userId: string;
  role: MembershipRoleType;
}

export interface ProfileHistoryFieldChange {
  field:
    | 'name'
    | 'address'
    | 'placeOfBirth'
    | 'dateOfBirth'
    | 'gender'
    | 'disabilityStatus'
    | 'guardianDeclarationAccepted'
    | 'guardianFullName'
    | 'guardianPhoneNumber'
    | 'emergencyContactName'
    | 'emergencyContactRelation'
    | 'emergencyContactPhoneNumber'
    | 'firearmCertificateNumber'
    | 'firearmCertificateExpiry'
    | 'shotgunCertificateNumber'
    | 'shotgunCertificateExpiry';
  oldValue: string | null;
  newValue: string | null;
}

export interface MemberProfileHistoryEntry {
  id: string;
  changedAt: string;
  changedByUserId: string | null;
  changes: ProfileHistoryFieldChange[];
}

// ---------------------------------------------------------------------------
// Scoring / Match Secretary types
// ---------------------------------------------------------------------------

export interface Season {
  id: string;
  clubId: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { competitions: number };
}

export interface Round {
  id: string;
  competitionId: string;
  roundNumber: number;
  dueDate: string;
}

export interface Competition {
  id: string;
  clubId: string;
  seasonId: string;
  name: string;
  organiser: string | null;
  discipline: string;
  roundCount: number;
  cardsPerRound: number;
  createdAt: string;
  updatedAt: string;
  rounds: Round[];
  _count?: { entries: number };
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  userId: string;
  user: { id: string; name: string; email: string };
}

export interface ScoreCell {
  id: string;
  userId: string;
  cardNumber: number;
  score: number | null;
}

export interface SheetRound {
  id: string;
  roundNumber: number;
  dueDate: string;
  scores: ScoreCell[];
}

export interface ScoreSheet {
  competition: {
    id: string;
    name: string;
    organiser: string | null;
    discipline: string;
    roundCount: number;
    cardsPerRound: number;
  };
  members: { id: string; name: string; email: string }[];
  rounds: SheetRound[];
}

export interface DueCard {
  scoreId: string;
  competitionId: string;
  competitionName: string;
  roundId: string;
  roundNumber: number;
  dueDate: string;
  cardNumber: number;
}

export interface ScoringAverages {
  allTimeAverage: number | null;
  last10Average: number | null;
  totalCardsShot: number;
  competitionCardsShot?: number;
  practiceCardsShot?: number;
  practiceAllTimeAverage?: number | null;
  practiceLast10Average?: number | null;
  byDiscipline?: {
    discipline: string;
    totalCardsShot: number;
    allTimeAverage: number | null;
    last10Average: number | null;
    bestScore: number | null;
  }[];
}

export interface RecentScore {
  scoreId: string;
  competitionId: string;
  competitionName: string;
  score: number;
  scoredAt: string;
}

export interface MemberScoreHistoryRow {
  scoreId: string;
  competitionId: string;
  competitionName: string;
  discipline: string;
  dateShot: string;
  dateDue: string;
  roundNumber: number;
  cardNumber: number;
  score: number;
}

export interface MemberScoreHistoryResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: MemberScoreHistoryRow[];
}

export interface PracticeCardRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  discipline: string;
  score: number;
  recordedAt: string;
  createdAt: string;
  createdByUserId: string;
  createdByName: string;
}
