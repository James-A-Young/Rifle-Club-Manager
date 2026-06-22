import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { normalizeDisciplines } from '../shared/clubUtils';
import {
  Club,
  Member,
  Firearm,
  SignInLink,
  ClubInvite,
  ClubSettings,
  GoogleDriveBackupStatus,
  GoogleDriveFolderItem,
  GoogleDriveFolderListResponse,
  ClubFormData,
  MembershipRoleType,
  EditingRoleState,
  AmmunitionType,
  AmmunitionSafe,
  AmmunitionSale,
  AmmunitionStock,
  PaymentMethod,
  AmmunitionReorderAnalysisResponse,
  AmmunitionReorderAnalysisRow,
  ClubPublicPageData,
  ClubPublicBlogPost,
  ClubPublicDomain,
  PublicAnnouncementVariant,
} from '../types/club';
import DashboardTabNav from '../components/dashboard/DashboardTabNav';
import ClubProfileSection from '../components/dashboard/ClubProfileSection';
import ClubSettingsSection from '../components/dashboard/ClubSettingsSection';
import KioskLinksSection from '../components/dashboard/KioskLinksSection';
import ArmorySection from '../components/dashboard/ArmorySection';
import MembersSection from '../components/dashboard/MembersSection';
import InvitesSection from '../components/dashboard/InvitesSection';
import ActiveVisitorsTable, { ActiveVisitorRow } from '../components/ActiveVisitorsTable';
import AmmunitionSalesSection from '../components/dashboard/AmmunitionSalesSection';
import MatchSecretarySection from '../components/dashboard/MatchSecretarySection';
import Section21RenewalPrompt from '../components/Section21RenewalPrompt';
import PublicSiteSection from '../components/dashboard/PublicSiteSection';

interface ActiveVisitor {
  id: string;
  publicVisitRef: string;
  visitorName: string;
  visitorEmail: string;
  guestClubRepresented?: string | null;
  purpose: string;
  timeIn: string;
  firearm: string | null;
}

interface AmmunitionSettingsResponse {
  types: AmmunitionType[];
  safes: AmmunitionSafe[];
}

interface PublicSiteProfileForm {
  vanitySlug: string;
  heroTitle: string;
  heroSubtitle: string;
  headerImageUrl: string;
  headerImageAlt: string;
}

interface PublicSessionDraft {
  dayLabel: string;
  sessionType: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}

interface PublicAnnouncementDraft {
  title: string;
  message: string;
  variant: PublicAnnouncementVariant;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
}

interface PublicBlogDraft {
  title: string;
  slug: string;
  excerpt: string;
  markdownBody: string;
  isPublished: boolean;
}

function toLocalDayBoundaryIso(date: string, boundary: 'start' | 'end'): string {
  const [yearRaw, monthRaw, dayRaw] = date.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) {
    return '';
  }
  const localDate = boundary === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999);
  return localDate.toISOString();
}

export default function ClubDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Data state
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [firearms, setFirearms] = useState<Firearm[]>([]);
  const [links, setLinks] = useState<SignInLink[]>([]);
  const [invites, setInvites] = useState<ClubInvite[]>([]);

  // UI state
  const [showFirearmForm, setShowFirearmForm] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [membershipResolved, setMembershipResolved] = useState(false);
  const [activeTab, setActiveTab] = useState<'operations' | 'ammunition' | 'match-secretary' | 'settings' | 'public-site'>('operations');

  // Club profile edit
  const [editingClubProfile, setEditingClubProfile] = useState(false);
  const [savingClubProfile, setSavingClubProfile] = useState(false);
  const [disciplineInput, setDisciplineInput] = useState('');
  const [clubForm, setClubForm] = useState<ClubFormData>({
    name: '',
    homeOfficeRef: '',
    address: '',
    disciplinesOffered: [],
    acceptingNewMembers: true,
    openingTimes: '',
    description: '',
  });

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRoleType>('MEMBER');
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(14);

  // Member role editing
  const [editingRole, setEditingRole] = useState<EditingRoleState | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Active visits
  const [activeVisits, setActiveVisits] = useState<ActiveVisitor[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState('');
  const [signoutLoading, setSignoutLoading] = useState<string | null>(null);
  const [signoutAllLoading, setSignoutAllLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState<ClubSettings | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<ClubSettings>({
    clubId: '',
    logoUrl: '',
    primaryColor: '#1f2937',
    secondaryColor: '#374151',
    accentColor: '#3b82f6',
    passIssuingEnabled: false,
    memberCardSignInEnabled: false,
    scoringDisciplines: [],
    membershipCardAverageMetric: 'OVERALL_LAST_10',
    membershipCardAverageDiscipline: null,
    backupEnabled: false,
    ammoSalesLookbackDays: 30,
    ammoDefaultLeadTimeDays: 14,
    ammoDefaultSafetyStockDays: 7,
    ammoDefaultSalesSafeId: null,
  });
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveBackupStatus | null>(null);
  const [backupDriveFolderIdInput, setBackupDriveFolderIdInput] = useState('');
  const [backupDriveFolderName, setBackupDriveFolderName] = useState('');
  const [backupActionLoading, setBackupActionLoading] = useState(false);
  const [backupFolderPickerOpen, setBackupFolderPickerOpen] = useState(false);
  const [backupFolderPickerLoading, setBackupFolderPickerLoading] = useState(false);
  const [backupFolderPickerError, setBackupFolderPickerError] = useState('');
  const [backupFolderPickerCurrent, setBackupFolderPickerCurrent] = useState<{ id: string; name: string; parentId: string | null } | null>(null);
  const [backupFolderPickerItems, setBackupFolderPickerItems] = useState<GoogleDriveFolderItem[]>([]);
  const [ammunitionTypes, setAmmunitionTypes] = useState<AmmunitionType[]>([]);
  const [ammunitionSafes, setAmmunitionSafes] = useState<AmmunitionSafe[]>([]);
  const [ammunitionStock, setAmmunitionStock] = useState<AmmunitionStock[]>([]);
  const [ammunitionSales, setAmmunitionSales] = useState<AmmunitionSale[]>([]);
  const [reorderAnalysisRows, setReorderAnalysisRows] = useState<AmmunitionReorderAnalysisRow[]>([]);
  const [newAmmunitionTypeName, setNewAmmunitionTypeName] = useState('');
  const [newAmmunitionTypePricePence, setNewAmmunitionTypePricePence] = useState(0);
  const [newAmmunitionSafeName, setNewAmmunitionSafeName] = useState('');
  const [saleBuyerUserId, setSaleBuyerUserId] = useState('');
  const [saleBuyerFirstName, setSaleBuyerFirstName] = useState('');
  const [saleBuyerLastName, setSaleBuyerLastName] = useState('');
  const [saleTypeId, setSaleTypeId] = useState('');
  const [saleSafeId, setSaleSafeId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState(50);
  const [salePaymentMethod, setSalePaymentMethod] = useState<PaymentMethod>('CASH');
  const [ledgerBuyerSearch, setLedgerBuyerSearch] = useState('');
  const [ledgerSellerSearch, setLedgerSellerSearch] = useState('');
  const [ledgerTypeId, setLedgerTypeId] = useState('');
  const [ledgerFromDate, setLedgerFromDate] = useState('');
  const [ledgerToDate, setLedgerToDate] = useState('');
  const [stockInputTypeId, setStockInputTypeId] = useState('');
  const [stockInputSafeId, setStockInputSafeId] = useState('');
  const [stockInputQuantity, setStockInputQuantity] = useState(1);
  const [transferTypeId, setTransferTypeId] = useState('');
  const [transferFromSafeId, setTransferFromSafeId] = useState('');
  const [transferToSafeId, setTransferToSafeId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [publicSiteProfileForm, setPublicSiteProfileForm] = useState<PublicSiteProfileForm>({
    vanitySlug: '',
    heroTitle: '',
    heroSubtitle: '',
    headerImageUrl: '',
    headerImageAlt: '',
  });
  const [publicSessions, setPublicSessions] = useState<PublicSessionDraft[]>([]);
  const [publicAnnouncements, setPublicAnnouncements] = useState<PublicAnnouncementDraft[]>([]);
  const [publicBlogPosts, setPublicBlogPosts] = useState<ClubPublicBlogPost[]>([]);
  const [publicBlogDraft, setPublicBlogDraft] = useState<PublicBlogDraft>({
    title: '',
    slug: '',
    excerpt: '',
    markdownBody: '',
    isPublished: false,
  });
  const [publicDomains, setPublicDomains] = useState<ClubPublicDomain[]>([]);
  const [expectedCnameTarget, setExpectedCnameTarget] = useState('public.shootingmatch.app');
  const [newPublicDomain, setNewPublicDomain] = useState('');
  const [publicSiteSaving, setPublicSiteSaving] = useState(false);

  const REFRESH_VISITS_INTERVAL_MS = 120_000;

  useEffect(() => {
    if (!id) return;
    setMembershipResolved(false);
    api.get<Club>(`/api/clubs/${id}`).then(clubData => {
      setClub(clubData);
      setClubForm({
        name: clubData.name,
        homeOfficeRef: clubData.homeOfficeRef ?? '',
        address: clubData.address ?? '',
        disciplinesOffered: normalizeDisciplines(clubData.disciplinesOffered),
        acceptingNewMembers: clubData.acceptingNewMembers ?? true,
        openingTimes: clubData.openingTimes ?? '',
        description: clubData.description ?? '',
      });
    }).catch(e => setError(e instanceof Error ? e.message : 'Error'));
    api.get<Member[]>(`/api/clubs/${id}/members`)
      .then(ms => {
        setMembers(ms);
        const me = ms.find(m => m.userId === user?.id);
        setIsAdmin(me?.role === 'ADMIN');
      })
      .catch(() => setIsAdmin(false))
      .finally(() => setMembershipResolved(true));
  }, [id, user?.id]);

  useEffect(() => {
    if (!id || !membershipResolved || isAdmin) return;
    navigate(`/clubs/profile/${id}`, { replace: true });
  }, [id, isAdmin, membershipResolved, navigate]);

  function applyBackupStatus(status: GoogleDriveBackupStatus) {
    setGoogleDriveStatus(status);
    setBackupDriveFolderIdInput(status.connection.driveFolderId ?? '');
    setBackupDriveFolderName(status.connection.driveFolderName ?? '');
  }

  useEffect(() => {
    if (!id || !isAdmin) return;
    api.get<SignInLink[]>(`/api/sign-in-links/club/${id}`)
      .then(setLinks)
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading links'));
    api.get<ClubInvite[]>(`/api/clubs/${id}/invites`)
      .then(setInvites)
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading invites'));
    api.get<ClubSettings>(`/api/clubs/${id}/settings`)
      .then(s => {
        const normalized = {
          ...s,
          scoringDisciplines: normalizeDisciplines(s.scoringDisciplines),
          membershipCardAverageMetric: s.membershipCardAverageMetric ?? 'OVERALL_LAST_10',
          membershipCardAverageDiscipline: s.membershipCardAverageDiscipline ?? null,
        };
        setSettings(normalized);
        setSettingsForm(normalized);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading settings'));
    api.get<GoogleDriveBackupStatus>(`/api/clubs/${id}/settings/backups/google-drive/status`)
      .then(status => applyBackupStatus(status))
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading backup status'));
    api.get<Firearm[]>(`/api/clubs/${id}/firearms`)
    .then(firearms => setFirearms(firearms))
    .catch(e => setError(e instanceof Error ? e.message : 'Error loading firearms'));
    api.get<{
      publicSite: ClubPublicPageData['publicSite'];
      posts: ClubPublicBlogPost[];
      domains: ClubPublicDomain[];
    }>(`/api/clubs/${id}/public-site`)
      .then(data => {
        const site = data.publicSite;
        setPublicSiteProfileForm({
          vanitySlug: site?.vanitySlug ?? '',
          heroTitle: site?.heroTitle ?? '',
          heroSubtitle: site?.heroSubtitle ?? '',
          headerImageUrl: site?.headerImageUrl ?? '',
          headerImageAlt: site?.headerImageAlt ?? '',
        });
        setPublicSessions((site?.sessions ?? []).map(item => ({
          dayLabel: item.dayLabel,
          sessionType: item.sessionType,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          notes: item.notes ?? '',
        })));
        const toDateTimeLocal = (iso: string | null | undefined) => {
          if (!iso) return '';
          const date = new Date(iso);
          date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
          return date.toISOString().slice(0, 16);
        };
        setPublicAnnouncements((site?.announcements ?? []).map(item => ({
          title: item.title,
          message: item.message,
          variant: item.variant,
          startsAt: toDateTimeLocal(item.startsAt),
          endsAt: toDateTimeLocal(item.endsAt),
          isEnabled: item.isEnabled,
        })));
        setPublicBlogPosts(data.posts ?? []);
        setPublicDomains(data.domains ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading public site settings'));
    api.get<{ expectedCnameTarget: string; domains: ClubPublicDomain[] }>(`/api/clubs/${id}/public-site/domains`)
      .then(data => {
        setExpectedCnameTarget(data.expectedCnameTarget);
        setPublicDomains(data.domains);
      })
      .catch(() => undefined);
  }, [id, isAdmin]);

  useEffect(() => {
    if (!id || !isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('backupDriveLinked') !== '1') return;
    void reloadBackupStatus()
      .finally(() => setBackupActionLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  async function loadAmmunitionSettings() {
    if (!id || !isAdmin) return;
    const settingsData = await api.get<AmmunitionSettingsResponse>(`/api/ammunition/club/${id}/settings`);
    setAmmunitionTypes(settingsData.types);
    setAmmunitionSafes(settingsData.safes);
  }

  async function loadAmmunitionStock() {
    if (!id || !isAdmin) return;
    const data = await api.get<{ stock: AmmunitionStock[] }>(`/api/ammunition/club/${id}/stock`);
    setAmmunitionStock(data.stock);
  }

  async function loadAmmunitionSales() {
    if (!id || !isAdmin) return;
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (ledgerBuyerSearch.trim()) params.set('buyerSearch', ledgerBuyerSearch.trim());
    if (ledgerSellerSearch.trim()) params.set('sellerSearch', ledgerSellerSearch.trim());
    if (ledgerTypeId) params.set('typeId', ledgerTypeId);
    if (ledgerFromDate) params.set('from', toLocalDayBoundaryIso(ledgerFromDate, 'start'));
    if (ledgerToDate) params.set('to', toLocalDayBoundaryIso(ledgerToDate, 'end'));
    const rows = await api.get<AmmunitionSale[]>(`/api/ammunition/club/${id}/sales?${params.toString()}`);
    setAmmunitionSales(rows);
  }

  async function loadReorderAnalysis() {
    if (!id || !isAdmin) return;
    const response = await api.get<AmmunitionReorderAnalysisResponse>(
      `/api/ammunition/club/${id}/reorder-analysis?lookbackDays=${settingsForm.ammoSalesLookbackDays}`,
    );
    setReorderAnalysisRows(response.rows);
  }

  useEffect(() => {
    if (!id || !isAdmin) return;
    Promise.all([loadAmmunitionSettings(), loadAmmunitionStock(), loadAmmunitionSales(), loadReorderAnalysis()])
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading ammunition data'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  useEffect(() => {
    if (!saleSafeId) return;
    if (!ammunitionSafes.some(safe => safe.id === saleSafeId)) {
      setSaleSafeId('');
    }
  }, [saleSafeId, ammunitionSafes]);

  useEffect(() => {
    if (saleSafeId || ammunitionSafes.length === 0) return;

    if (settingsForm.ammoDefaultSalesSafeId && ammunitionSafes.some(safe => safe.id === settingsForm.ammoDefaultSalesSafeId)) {
      setSaleSafeId(settingsForm.ammoDefaultSalesSafeId);
    }
  }, [saleSafeId, ammunitionSafes, settingsForm.ammoDefaultSalesSafeId]);

  useEffect(() => {
    if (!id || !isAdmin) return;

    const loadVisits = async () => {
      setVisitsLoading(true);
      setVisitsError('');
      try {
        const visits = await api.get<ActiveVisitor[]>(`/api/visits/club/${id}/active`);
        setActiveVisits(visits);
      } catch (e) {
        setVisitsError(e instanceof Error ? e.message : 'Error loading active visits');
      } finally {
        setVisitsLoading(false);
      }
    };

    loadVisits();
    const interval = window.setInterval(loadVisits, REFRESH_VISITS_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [id, isAdmin]);

  const inviteBaseUrl = useMemo(() => `${window.location.origin}/invites`, []);
  const saleTotalPence = useMemo(() => {
    const type = ammunitionTypes.find(t => t.id === saleTypeId);
    return type ? type.currentPricePence * Math.max(0, saleQuantity) : 0;
  }, [ammunitionTypes, saleTypeId, saleQuantity]);

  function addDiscipline() {
    const value = disciplineInput.trim();
    if (!value) return;
    setClubForm(prev => {
      if (prev.disciplinesOffered.includes(value)) return prev;
      return { ...prev, disciplinesOffered: [...prev.disciplinesOffered, value] };
    });
    setDisciplineInput('');
  }

  async function saveClubProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSavingClubProfile(true);
    setError('');
    try {
      const updated = await api.patch<Club>(`/api/clubs/${id}`, {
        name: clubForm.name,
        homeOfficeRef: clubForm.homeOfficeRef,
        address: clubForm.address,
        disciplinesOffered: clubForm.disciplinesOffered,
        acceptingNewMembers: clubForm.acceptingNewMembers,
        openingTimes: clubForm.openingTimes,
        description: clubForm.description,
      });
      setClub(updated);
      setClubForm({
        name: updated.name,
        homeOfficeRef: updated.homeOfficeRef ?? '',
        address: updated.address ?? '',
        disciplinesOffered: normalizeDisciplines(updated.disciplinesOffered),
        acceptingNewMembers: updated.acceptingNewMembers,
        openingTimes: updated.openingTimes ?? '',
        description: updated.description ?? '',
      });
      setEditingClubProfile(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating club profile');
    } finally {
      setSavingClubProfile(false);
    }
  }

  async function approveMember(userId: string, status: 'APPROVED' | 'REJECTED') {
    if (!id) return;
    try {
      const updated = await api.patch<Member>(`/api/clubs/${id}/members/${userId}`, { status });
      setMembers(prev => prev.map(m => (m.userId === userId ? updated : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating member');
    }
  }

  async function saveRoleChange() {
    if (!id || !editingRole) return;
    setSavingRole(true);
    setError('');
    try {
      const updated = await api.patch<Member>(`/api/clubs/${id}/members/${editingRole.userId}`, {
        role: editingRole.role,
      });
      setMembers(prev => prev.map(m => (m.userId === editingRole.userId ? updated : m)));
      setEditingRole(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating member role');
    } finally {
      setSavingRole(false);
    }
  }

  async function removeMember(userId: string) {
    if (!id) return;
    const member = members.find(m => m.userId === userId);
    const name = member?.user.name ?? 'this member';
    if (!confirm(`Remove ${name} from this club? They will be marked inactive and can apply again later.`)) {
      return;
    }

    setRemovingMemberId(userId);
    setError('');
    try {
      const updated = await api.delete<Member>(`/api/clubs/${id}/members/${userId}`);
      setMembers(prev => prev.map(m => (m.userId === userId ? updated : m)));
      if (editingRole?.userId === userId) {
        setEditingRole(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error removing member');
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function generateKioskLink() {
    if (!id) return;
    try {
      const l = await api.post<SignInLink>('/api/sign-in-links/kiosk', { clubId: id });
      setLinks(prev => [{ ...l, mode: 'KIOSK' }, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generating kiosk link');
    }
  }

  async function revokeLink(linkId: string) {
    try {
      await api.delete(`/api/sign-in-links/${linkId}`);
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error revoking link');
    }
  }

  async function createInvite() {
    if (!id || !inviteEmail.trim()) return;
    try {
      setError('');
      const invite = await api.post<ClubInvite>(`/api/clubs/${id}/invites`, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        expiresInDays: inviteExpiresInDays,
      });
      setInvites(prev => [invite, ...prev]);
      setInviteEmail('');
      if (invite.emailSent === false) {
        setError('Invite created, but email sending is disabled or failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating invite');
    }
  }

  async function createBulkInvites(emails: string[]) {
    if (!id || emails.length === 0) return;

    setError('');

    const results = await Promise.allSettled(
      emails.map(email => api.post<ClubInvite>(`/api/clubs/${id}/invites`, {
        email,
        role: inviteRole,
        expiresInDays: inviteExpiresInDays,
      })),
    );

    const createdInvites: ClubInvite[] = [];
    const failedEmails: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        createdInvites.push(result.value);
      } else {
        failedEmails.push(emails[index] as string);
      }
    });

    if (createdInvites.length > 0) {
      setInvites(prev => [...createdInvites, ...prev]);
    }

    if (failedEmails.length > 0) {
      setError(
        `Created ${createdInvites.length} invite(s). Failed ${failedEmails.length}: ${failedEmails.join(', ')}`,
      );
      return;
    }

    if (createdInvites.some(invite => invite.emailSent === false)) {
      setError('Invites created, but email sending is disabled or failed for one or more invites.');
    }
  }

  function getInviteUrl(token: string): string {
    return `${inviteBaseUrl}/${token}/accept`;
  }

  function copyInviteUrl(token: string) {
    void navigator.clipboard.writeText(getInviteUrl(token));
  }

  async function resendInviteEmail(invite: ClubInvite) {
    if (!id) return;
    try {
      setError('');
      const response = await api.post<{ success: boolean; emailSent: boolean; message?: string }>(
        `/api/clubs/${id}/invites/${invite.id}/send`,
        {},
      );
      if (!response.emailSent) {
        setError(response.message ?? 'Invite was found, but email could not be sent.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error sending invite email');
    }
  }

  async function cancelInvite(invite: ClubInvite) {
    if (!id) return;
    if (!confirm(`Cancel invite for ${invite.email}?`)) return;

    try {
      setError('');
      await api.delete(`/api/clubs/${id}/invites/${invite.id}`);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cancelling invite');
    }
  }

  async function addFirearm(data: { make: string; model: string; caliber: string; serialNumber: string }) {
    if (!id) return;
    const f = await api.post<Firearm>(`/api/clubs/${id}/firearms`, data);
    setFirearms(prev => [...prev, f]);
    setShowFirearmForm(false);
  }

  async function editFirearm(firearmId: string, data: { make: string; model: string; caliber: string; serialNumber: string }) {
    if (!id) return;
    const updated = await api.patch<Firearm>(`/api/clubs/${id}/firearms/${firearmId}`, data);
    setFirearms(prev => prev.map(f => (f.id === firearmId ? updated : f)));
  }

  async function removeFirearm(firearmId: string) {
    if (!id) return;
    await api.delete(`/api/clubs/${id}/firearms/${firearmId}`);
    setFirearms(prev => prev.filter(f => f.id !== firearmId));
  }

  async function toggleFavoriteFirearm(firearmId: string, isFavorite: boolean) {
    if (!id) return;
    const updated = await api.patch<Firearm>(`/api/clubs/${id}/firearms/${firearmId}/favorite`, { isFavorite });
    setFirearms(prev => prev.map(f => (f.id === firearmId ? updated : f)));
  }

  async function handleSignOut(visitId: string) {
    if (!id) return;
    setSignoutLoading(visitId);
    try {
      await api.patch(`/api/visits/club/${id}/${visitId}/signout`, {});
      const visits = await api.get<ActiveVisitor[]>(`/api/visits/club/${id}/active`);
      setActiveVisits(visits);
    } catch (err) {
      setVisitsError(err instanceof Error ? err.message : 'Error signing out');
    } finally {
      setSignoutLoading(null);
    }
  }

  async function handleSignOutAll() {
    if (!id || !confirm('Are you sure you want to sign out all visitors? This cannot be undone.')) return;
    setSignoutAllLoading(true);
    try {
      await api.patch(`/api/visits/club/${id}/signout-all`, { confirm: true });
      const visits = await api.get<ActiveVisitor[]>(`/api/visits/club/${id}/active`);
      setActiveVisits(visits);
    } catch (err) {
      setVisitsError(err instanceof Error ? err.message : 'Error signing out all visitors');
    } finally {
      setSignoutAllLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSavingSettings(true);
    setError('');
    try {
      const updated = await api.post<ClubSettings>(`/api/clubs/${id}/settings`, {
        logoUrl: settingsForm.logoUrl || null,
        primaryColor: settingsForm.primaryColor,
        secondaryColor: settingsForm.secondaryColor,
        accentColor: settingsForm.accentColor,
        passIssuingEnabled: settingsForm.passIssuingEnabled,
        memberCardSignInEnabled: settingsForm.memberCardSignInEnabled,
        scoringDisciplines: normalizeDisciplines(settingsForm.scoringDisciplines),
        membershipCardAverageMetric: settingsForm.membershipCardAverageMetric,
        membershipCardAverageDiscipline: settingsForm.membershipCardAverageDiscipline || null,
        backupEnabled: settingsForm.backupEnabled,
        ammoSalesLookbackDays: settingsForm.ammoSalesLookbackDays,
        ammoDefaultLeadTimeDays: settingsForm.ammoDefaultLeadTimeDays,
        ammoDefaultSafetyStockDays: settingsForm.ammoDefaultSafetyStockDays,
        ammoDefaultSalesSafeId: settingsForm.ammoDefaultSalesSafeId || null,
      });
      const normalized = {
        ...updated,
        scoringDisciplines: normalizeDisciplines(updated.scoringDisciplines),
        membershipCardAverageMetric: updated.membershipCardAverageMetric ?? 'OVERALL_LAST_10',
        membershipCardAverageDiscipline: updated.membershipCardAverageDiscipline ?? null,
      };
      setSettings(normalized);
      setSettingsForm(normalized);
      setEditingSettings(false);
      await loadReorderAnalysis();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function reloadBackupStatus() {
    if (!id || !isAdmin) return;
    const status = await api.get<GoogleDriveBackupStatus>(`/api/clubs/${id}/settings/backups/google-drive/status`);
    applyBackupStatus(status);
  }

  async function startGoogleDriveLink() {
    if (!id) return;
    setBackupActionLoading(true);
    setError('');
    try {
      const response = await api.post<{ authUrl: string }>(`/api/clubs/${id}/settings/backups/google-drive/link/start`, {
        driveFolderId: backupDriveFolderIdInput.trim() || undefined,
      });
      window.location.href = response.authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error starting Google Drive link');
      setBackupActionLoading(false);
    }
  }

  async function loadDriveFolderChoices(parentId?: string) {
    if (!id) return;
    setBackupFolderPickerLoading(true);
    setBackupFolderPickerError('');
    try {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const result = await api.get<GoogleDriveFolderListResponse>(`/api/clubs/${id}/settings/backups/google-drive/folders${query}`);
      setBackupFolderPickerCurrent(result.currentFolder);
      setBackupFolderPickerItems(result.folders);
    } catch (e) {
      setBackupFolderPickerError(e instanceof Error ? e.message : 'Error loading folders');
    } finally {
      setBackupFolderPickerLoading(false);
    }
  }

  async function openBackupFolderPicker() {
    if (!googleDriveStatus?.connection?.linked) {
      setError('Link Google Drive before picking a folder.');
      return;
    }
    setBackupFolderPickerOpen(true);
    await loadDriveFolderChoices(backupDriveFolderIdInput.trim() || undefined);
  }

  function closeBackupFolderPicker() {
    setBackupFolderPickerOpen(false);
    setBackupFolderPickerError('');
  }

  async function openBackupFolder(folderId: string) {
    await loadDriveFolderChoices(folderId);
  }

  async function goUpBackupFolder() {
    const parentId = backupFolderPickerCurrent?.parentId;
    if (!parentId) {
      await loadDriveFolderChoices();
      return;
    }
    await loadDriveFolderChoices(parentId);
  }

  async function selectBackupFolder(folderId: string, folderName: string) {
    if (!id) return;
    setBackupActionLoading(true);
    setError('');
    try {
      const response = await api.post<{ driveFolderId: string; folderName: string }>(`/api/clubs/${id}/settings/backups/google-drive/folder`, {
        driveFolderId: folderId,
      });
      setBackupDriveFolderIdInput(response.driveFolderId);
      setBackupDriveFolderName(response.folderName || folderName);
      setBackupFolderPickerOpen(false);
      await reloadBackupStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error selecting backup folder';
      setError(message);
      setBackupFolderPickerError(message);
    } finally {
      setBackupActionLoading(false);
    }
  }

  async function disconnectGoogleDrive() {
    if (!id || !window.confirm('Disconnect Google Drive backup for this club?')) return;
    setBackupActionLoading(true);
    setError('');
    try {
      await api.post(`/api/clubs/${id}/settings/backups/google-drive/disconnect`, {});
      setSettingsForm(prev => ({ ...prev, backupEnabled: false }));
      await reloadBackupStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error disconnecting Google Drive');
    } finally {
      setBackupActionLoading(false);
    }
  }

  async function createAmmunitionType(pricePenceOverride?: number) {
    if (!id || !newAmmunitionTypeName.trim()) return;
    const pricePence = pricePenceOverride ?? newAmmunitionTypePricePence;
    if (!Number.isFinite(pricePence) || pricePence <= 0) {
      setError('Please provide a valid ammunition price greater than 0');
      return;
    }
    try {
      await api.post(`/api/ammunition/club/${id}/types`, {
        name: newAmmunitionTypeName.trim(),
        pricePence,
      });
      setNewAmmunitionTypeName('');
      setNewAmmunitionTypePricePence(0);
      await loadAmmunitionSettings();
      await loadAmmunitionStock();
      await loadReorderAnalysis();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating ammunition type');
    }
  }

  async function updateAmmunitionTypePrice(typeId: string, pricePence: number) {
    if (!id) return;
    try {
      await api.patch(`/api/ammunition/club/${id}/types/${typeId}`, { pricePence });
      await loadAmmunitionSettings();
      await loadAmmunitionSales();
      await loadReorderAnalysis();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating ammunition type');
    }
  }

  async function updateAmmunitionTypeReorderConfig(
    typeId: string,
    config: {
      reorderLevelQuantity: number | null;
      reorderQuantity: number | null;
      leadTimeDays: number | null;
      safetyStockDays: number | null;
    },
  ) {
    if (!id) return;
    try {
      await api.patch(`/api/ammunition/club/${id}/types/${typeId}`, config);
      await loadAmmunitionSettings();
      await loadReorderAnalysis();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating reorder settings');
    }
  }

  async function createAmmunitionSafe() {
    if (!id || !newAmmunitionSafeName.trim()) return;
    try {
      await api.post(`/api/ammunition/club/${id}/safes`, { name: newAmmunitionSafeName.trim() });
      setNewAmmunitionSafeName('');
      await loadAmmunitionSettings();
      await loadAmmunitionStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating ammunition safe');
    }
  }

  function handleSaleBuyerUserIdChange(value: string) {
    setSaleBuyerUserId(value);
    const match = members.find(m => m.userId === value);
    if (match) {
      const nameParts = match.user.name.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length >= 2) {
        setSaleBuyerFirstName(nameParts.slice(0, -1).join(' '));
        setSaleBuyerLastName(nameParts[nameParts.length - 1]);
      } else {
        setSaleBuyerFirstName(match.user.name.trim());
        setSaleBuyerLastName('');
      }
    }
  }

  async function confirmAmmunitionSale() {
    if (!id || !saleTypeId || !saleSafeId || saleQuantity <= 0 || !saleBuyerFirstName.trim() || !saleBuyerLastName.trim()) {
      setError('Please complete all sale fields');
      return;
    }
    try {
      await api.post(`/api/ammunition/club/${id}/sales`, {
        buyerFirstName: saleBuyerFirstName.trim(),
        buyerLastName: saleBuyerLastName.trim(),
        buyerUserId: saleBuyerUserId || null,
        ammunitionTypeId: saleTypeId,
        ammunitionSafeId: saleSafeId,
        quantity: saleQuantity,
        paymentMethod: salePaymentMethod,
      });
      setSaleQuantity(50);
      await Promise.all([loadAmmunitionSales(), loadAmmunitionStock()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error recording sale');
    }
  }

  async function submitStockInput() {
    if (!id || !stockInputTypeId || !stockInputSafeId || stockInputQuantity <= 0) {
      setError('Please complete stock input details');
      return;
    }
    try {
      await api.post(`/api/ammunition/club/${id}/stock/input`, {
        ammunitionTypeId: stockInputTypeId,
        ammunitionSafeId: stockInputSafeId,
        quantity: stockInputQuantity,
      });
      setStockInputQuantity(1);
      await loadAmmunitionStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inputting stock');
    }
  }

  async function submitStockTransfer() {
    if (!id || !transferTypeId || !transferFromSafeId || !transferToSafeId || transferQuantity <= 0) {
      setError('Please complete all transfer fields');
      return;
    }
    try {
      await api.post(`/api/ammunition/club/${id}/stock/transfer`, {
        ammunitionTypeId: transferTypeId,
        fromSafeId: transferFromSafeId,
        toSafeId: transferToSafeId,
        quantity: transferQuantity,
      });
      setTransferQuantity(1);
      await loadAmmunitionStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error transferring stock');
    }
  }

  async function renameSafe(safeId: string, newName: string) {
    if (!id) return;
    try {
      await api.patch(`/api/ammunition/club/${id}/safes/${safeId}`, { name: newName });
      await Promise.all([loadAmmunitionSettings(), loadAmmunitionStock()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error renaming safe');
    }
  }

  async function deleteSafe(safeId: string) {
    if (!id) return;
    try {
      await api.delete(`/api/ammunition/club/${id}/safes/${safeId}`);
      await Promise.all([loadAmmunitionSettings(), loadAmmunitionStock()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error deleting safe');
    }
  }

  async function exportAmmunitionLedgerCsv() {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (ledgerBuyerSearch.trim()) params.set('buyerSearch', ledgerBuyerSearch.trim());
      if (ledgerSellerSearch.trim()) params.set('sellerSearch', ledgerSellerSearch.trim());
      if (ledgerTypeId) params.set('typeId', ledgerTypeId);
      if (ledgerFromDate) params.set('from', toLocalDayBoundaryIso(ledgerFromDate, 'start'));
      if (ledgerToDate) params.set('to', toLocalDayBoundaryIso(ledgerToDate, 'end'));
      const response = await fetch(`/api/ammunition/club/${id}/sales/export.csv?${params.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((body as { error?: string }).error ?? response.statusText);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `club-${id}-ammunition-sales.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error exporting ledger');
    }
  }

  async function exportMembershipCsv() {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/clubs/${id}/members/export.csv`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((body as { error?: string }).error ?? response.statusText);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `club-${id}-members.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error exporting membership list');
    }
  }

  async function savePublicSiteProfile() {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      await api.patch(`/api/clubs/${id}/public-site`, {
        vanitySlug: publicSiteProfileForm.vanitySlug || null,
        heroTitle: publicSiteProfileForm.heroTitle || null,
        heroSubtitle: publicSiteProfileForm.heroSubtitle || null,
        headerImageUrl: publicSiteProfileForm.headerImageUrl || null,
        headerImageAlt: publicSiteProfileForm.headerImageAlt || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save public profile settings');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function savePublicSessions() {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      await api.put(`/api/clubs/${id}/public-site/sessions`, {
        sessions: publicSessions.map(item => ({
          dayLabel: item.dayLabel,
          sessionType: item.sessionType,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          notes: item.notes || null,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sessions');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function savePublicAnnouncements() {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      await api.put(`/api/clubs/${id}/public-site/announcements`, {
        announcements: publicAnnouncements.map(item => ({
          title: item.title,
          message: item.message,
          variant: item.variant,
          startsAt: item.startsAt ? new Date(item.startsAt).toISOString() : null,
          endsAt: item.endsAt ? new Date(item.endsAt).toISOString() : null,
          isEnabled: item.isEnabled,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save announcements');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function createPublicBlogPost() {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      const created = await api.post<ClubPublicBlogPost>(`/api/clubs/${id}/public-site/blog-posts`, {
        title: publicBlogDraft.title,
        slug: publicBlogDraft.slug || undefined,
        excerpt: publicBlogDraft.excerpt || null,
        markdownBody: publicBlogDraft.markdownBody,
        isPublished: publicBlogDraft.isPublished,
      });
      setPublicBlogPosts(prev => [created, ...prev]);
      setPublicBlogDraft({ title: '', slug: '', excerpt: '', markdownBody: '', isPublished: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create blog post');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function deletePublicBlogPost(postId: string) {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      await api.delete(`/api/clubs/${id}/public-site/blog-posts/${postId}`);
      setPublicBlogPosts(prev => prev.filter(post => post.id !== postId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete blog post');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function togglePublicBlogPost(postId: string, publish: boolean) {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      const updated = await api.patch<ClubPublicBlogPost>(`/api/clubs/${id}/public-site/blog-posts/${postId}`, {
        isPublished: publish,
      });
      setPublicBlogPosts(prev => prev.map(post => post.id === postId ? updated : post));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update blog post');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function addPublicDomain() {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      const created = await api.post<ClubPublicDomain>(`/api/clubs/${id}/public-site/domains`, {
        domain: newPublicDomain,
      });
      setPublicDomains(prev => [...prev, created]);
      setNewPublicDomain('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add custom domain');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function verifyPublicDomain(domainId: string) {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      const response = await api.post<{ domain: ClubPublicDomain }>(`/api/clubs/${id}/public-site/domains/${domainId}/check-verification`, {});
      setPublicDomains(prev => prev.map(domain => domain.id === domainId ? response.domain : domain));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to verify domain');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function toggleDomainActivation(domainId: string, isActive: boolean) {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      const response = await api.patch<{ domains: ClubPublicDomain[] }>(`/api/clubs/${id}/public-site/domains/${domainId}/activation`, { isActive });
      setPublicDomains(response.domains);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update domain activation');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  async function deletePublicDomain(domainId: string) {
    if (!id || !isAdmin) return;
    setPublicSiteSaving(true);
    try {
      await api.delete(`/api/clubs/${id}/public-site/domains/${domainId}`);
      setPublicDomains(prev => prev.filter(domain => domain.id !== domainId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete domain');
    } finally {
      setPublicSiteSaving(false);
    }
  }

  if (!club || !membershipResolved) return <div>Loading…</div>;
  if (!isAdmin) return null;

  const visitRows: ActiveVisitorRow[] = activeVisits.map(v => ({
    signOutId: v.id,
    visitorName: v.visitorName,
    visitorEmail: v.visitorEmail,
    purpose: v.purpose,
    firearm: v.firearm,
    timeIn: v.timeIn,
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{club.name}</h1>
          {club.homeOfficeRef && (
            <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>
              Home Office Ref: {club.homeOfficeRef}
            </p>
          )}
        </div>
        <div className="actions">
          <Link to={`/clubs/profile/${id}`} className="btn btn-secondary btn-sm">Public Profile</Link>
          {isAdmin && (
            <Link to={`/clubs/${id}/history`} className="btn btn-secondary btn-sm">
              Sign-In History
            </Link>
          )}
          {isAdmin && (
            <Link to={`/clubs/${id}/ammunition-history`} className="btn btn-secondary btn-sm">
              Ammunition History
            </Link>
          )}
          {isAdmin && (
            <Link to={`/clubs/${id}/cashbox`} className="btn btn-secondary btn-sm">
              Cashbox
            </Link>
          )}
          {isAdmin && (
            <Link to={`/clubs/${id}/scores-report`} className="btn btn-secondary btn-sm">
              Scores Report
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <Section21RenewalPrompt />

      <DashboardTabNav activeTab={activeTab} isAdmin={isAdmin} onChange={setActiveTab} />

      {activeTab === 'settings' && (
        <>
          <ClubProfileSection
            club={club}
            isAdmin={isAdmin}
            editing={editingClubProfile}
            saving={savingClubProfile}
            form={clubForm}
            disciplineInput={disciplineInput}
            onToggleEdit={() => setEditingClubProfile(v => !v)}
            onSave={saveClubProfile}
            onFormChange={partial => setClubForm(prev => ({ ...prev, ...partial }))}
            onDisciplineInputChange={setDisciplineInput}
            onAddDiscipline={addDiscipline}
            onRemoveDiscipline={discipline =>
              setClubForm(prev => ({
                ...prev,
                disciplinesOffered: prev.disciplinesOffered.filter(d => d !== discipline),
              }))
            }
          />

          {isAdmin && (
            <ClubSettingsSection
              settings={settings}
              editing={editingSettings}
              saving={savingSettings}
              form={settingsForm}
              onToggleEdit={() => setEditingSettings(v => !v)}
              onSave={saveSettings}
              onFormChange={partial => setSettingsForm(prev => ({ ...prev, ...partial }))}
              ammunitionTypes={ammunitionTypes}
              ammunitionSafes={ammunitionSafes}
              newAmmunitionTypeName={newAmmunitionTypeName}
              newAmmunitionTypePricePence={newAmmunitionTypePricePence}
              newAmmunitionSafeName={newAmmunitionSafeName}
              onNewAmmunitionTypeNameChange={setNewAmmunitionTypeName}
              onNewAmmunitionTypePricePenceChange={setNewAmmunitionTypePricePence}
              onNewAmmunitionSafeNameChange={setNewAmmunitionSafeName}
              onCreateAmmunitionType={createAmmunitionType}
              onCreateAmmunitionSafe={createAmmunitionSafe}
              onUpdateAmmunitionTypePrice={updateAmmunitionTypePrice}
              onUpdateAmmunitionTypeReorderConfig={updateAmmunitionTypeReorderConfig}
              onRenameSafe={renameSafe}
              onDeleteSafe={deleteSafe}
              googleDriveStatus={googleDriveStatus}
              backupDriveFolderIdInput={backupDriveFolderIdInput}
              backupDriveFolderName={backupDriveFolderName}
              backupActionLoading={backupActionLoading}
              onBackupDriveFolderIdInputChange={setBackupDriveFolderIdInput}
              backupFolderPickerOpen={backupFolderPickerOpen}
              backupFolderPickerLoading={backupFolderPickerLoading}
              backupFolderPickerError={backupFolderPickerError}
              backupFolderPickerCurrentName={backupFolderPickerCurrent?.name ?? 'My Drive'}
              backupFolderPickerCanGoUp={Boolean(backupFolderPickerCurrent)}
              backupFolderPickerItems={backupFolderPickerItems}
              onOpenBackupFolderPicker={() => void openBackupFolderPicker()}
              onCloseBackupFolderPicker={closeBackupFolderPicker}
              onOpenBackupFolder={folderId => void openBackupFolder(folderId)}
              onGoUpBackupFolder={() => void goUpBackupFolder()}
              onSelectBackupFolder={(folderId, folderName) => void selectBackupFolder(folderId, folderName)}
              onStartGoogleDriveLink={startGoogleDriveLink}
              onDisconnectGoogleDrive={disconnectGoogleDrive}
              onRefreshBackupStatus={() => void reloadBackupStatus()}
            />
          )}

          {isAdmin && (
            <KioskLinksSection
              links={links}
              onGenerate={generateKioskLink}
              onRevoke={revokeLink}
            />
          )}

          {isAdmin && (
            <ArmorySection
              title="Club Armory"
              addButtonLabel="Add Firearm"
              emptyMessage="No firearms registered"
              firearms={firearms}
              showForm={showFirearmForm}
              onToggleForm={() => setShowFirearmForm(s => !s)}
              onAdd={addFirearm}
              onEdit={editFirearm}
              onRemove={removeFirearm}
              onToggleFavorite={toggleFavoriteFirearm}
            />
          )}
        </>
      )}

      {activeTab === 'operations' && (
        <>
          {isAdmin && (
            <section>
              <ActiveVisitorsTable
                visits={visitRows}
                loading={visitsLoading}
                error={visitsError}
                signOutLoadingId={signoutLoading}
                showSignOutAll={activeVisits.length > 0}
                signOutAllLoading={signoutAllLoading}
                onSignOut={handleSignOut}
                onSignOutAll={handleSignOutAll}
              />
            </section>
          )}

          <MembersSection
            members={members}
            clubId={id ?? ''}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            onExportMembersCsv={exportMembershipCsv}
            editingRole={editingRole}
            savingRole={savingRole}
            removingUserId={removingMemberId}
            onApprove={approveMember}
            onRemove={removeMember}
            onStartEditRole={(userId, role) => setEditingRole({ userId, role })}
            onEditingRoleChange={role => setEditingRole(prev => prev ? { ...prev, role } : null)}
            onSaveRole={saveRoleChange}
            onCancelEditRole={() => setEditingRole(null)}
          />

          {isAdmin && (
            <InvitesSection
              invites={invites}
              email={inviteEmail}
              role={inviteRole}
              expiresInDays={inviteExpiresInDays}
              onEmailChange={setInviteEmail}
              onRoleChange={setInviteRole}
              onExpiresChange={setInviteExpiresInDays}
              onCreate={createInvite}
              onCreateBulk={createBulkInvites}
              onCopyUrl={copyInviteUrl}
              onSendEmail={resendInviteEmail}
              onCancel={cancelInvite}
            />
          )}
        </>
      )}

      {activeTab === 'public-site' && (
        <>
          <PublicSiteSection
            profile={publicSiteProfileForm}
            sessions={publicSessions}
            announcements={publicAnnouncements}
            blogPosts={publicBlogPosts}
            blogDraft={publicBlogDraft}
            domains={publicDomains}
            newDomain={newPublicDomain}
            expectedCnameTarget={expectedCnameTarget}
            loading={publicSiteSaving}
            onProfileChange={partial => setPublicSiteProfileForm(prev => ({ ...prev, ...partial }))}
            onSaveProfile={() => void savePublicSiteProfile()}
            onSessionsChange={setPublicSessions}
            onSaveSessions={() => void savePublicSessions()}
            onAnnouncementsChange={setPublicAnnouncements}
            onSaveAnnouncements={() => void savePublicAnnouncements()}
            onBlogDraftChange={partial => setPublicBlogDraft(prev => ({ ...prev, ...partial }))}
            onCreateBlogPost={() => void createPublicBlogPost()}
            onDeleteBlogPost={postId => void deletePublicBlogPost(postId)}
            onTogglePublishBlogPost={(postId, publish) => void togglePublicBlogPost(postId, publish)}
            onNewDomainChange={setNewPublicDomain}
            onAddDomain={() => void addPublicDomain()}
            onVerifyDomain={domainId => void verifyPublicDomain(domainId)}
            onToggleDomainActivation={(domainId, active) => void toggleDomainActivation(domainId, active)}
            onDeleteDomain={domainId => void deletePublicDomain(domainId)}
          />
        </>
      )}

      {activeTab === 'ammunition' && (
        <>
          {!isAdmin ? (
            <div className="alert alert-info">Only club admins can access ammunition sales.</div>
          ) : (
            <AmmunitionSalesSection
              members={members}
              types={ammunitionTypes}
              safes={ammunitionSafes}
              stock={ammunitionStock}
              sales={ammunitionSales}
              reorderAnalysisRows={reorderAnalysisRows}
              saleBuyerUserId={saleBuyerUserId}
              saleBuyerFirstName={saleBuyerFirstName}
              saleBuyerLastName={saleBuyerLastName}
              saleTypeId={saleTypeId}
              saleSafeId={saleSafeId}
              saleQuantity={saleQuantity}
              salePaymentMethod={salePaymentMethod}
              saleTotalPence={saleTotalPence}
              ledgerBuyerSearch={ledgerBuyerSearch}
              ledgerSellerSearch={ledgerSellerSearch}
              ledgerTypeId={ledgerTypeId}
              ledgerFromDate={ledgerFromDate}
              ledgerToDate={ledgerToDate}
              stockInputTypeId={stockInputTypeId}
              stockInputSafeId={stockInputSafeId}
              stockInputQuantity={stockInputQuantity}
              transferTypeId={transferTypeId}
              transferFromSafeId={transferFromSafeId}
              transferToSafeId={transferToSafeId}
              transferQuantity={transferQuantity}
              onSaleBuyerUserIdChange={handleSaleBuyerUserIdChange}
              onSaleBuyerFirstNameChange={setSaleBuyerFirstName}
              onSaleBuyerLastNameChange={setSaleBuyerLastName}
              onSaleTypeIdChange={setSaleTypeId}
              onSaleSafeIdChange={setSaleSafeId}
              onSaleQuantityChange={setSaleQuantity}
              onSalePaymentMethodChange={setSalePaymentMethod}
              onConfirmSale={confirmAmmunitionSale}
              onLedgerBuyerSearchChange={setLedgerBuyerSearch}
              onLedgerSellerSearchChange={setLedgerSellerSearch}
              onLedgerTypeIdChange={setLedgerTypeId}
              onLedgerFromDateChange={setLedgerFromDate}
              onLedgerToDateChange={setLedgerToDate}
              onRefreshLedger={loadAmmunitionSales}
              onRefreshReorderAnalysis={loadReorderAnalysis}
              onExportLedgerCsv={exportAmmunitionLedgerCsv}
              onStockInputTypeIdChange={setStockInputTypeId}
              onStockInputSafeIdChange={setStockInputSafeId}
              onStockInputQuantityChange={setStockInputQuantity}
              onSubmitStockInput={submitStockInput}
              onTransferTypeIdChange={setTransferTypeId}
              onTransferFromSafeIdChange={setTransferFromSafeId}
              onTransferToSafeIdChange={setTransferToSafeId}
              onTransferQuantityChange={setTransferQuantity}
              onSubmitTransfer={submitStockTransfer}
              onViewHistory={() => navigate(`/clubs/${id}/ammunition-history`)}
            />
          )}
        </>
      )}

      {activeTab === 'match-secretary' && (
        <>
          {!isAdmin ? (
            <div className="alert alert-info">Only club admins can access match secretary features.</div>
          ) : (
            <MatchSecretarySection
              clubId={id ?? ''}
              members={members}
              disciplineOptions={normalizeDisciplines(settingsForm.scoringDisciplines)}
            />
          )}
        </>
      )}
    </>
  );
}
