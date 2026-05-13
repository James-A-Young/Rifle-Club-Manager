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
  ClubFormData,
  MembershipRoleType,
  EditingRoleState,
  AmmunitionType,
  AmmunitionSafe,
  AmmunitionSale,
  AmmunitionStock,
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
  const [activeTab, setActiveTab] = useState<'operations' | 'ammunition' | 'match-secretary' | 'settings'>('operations');

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
  });
  const [ammunitionTypes, setAmmunitionTypes] = useState<AmmunitionType[]>([]);
  const [ammunitionSafes, setAmmunitionSafes] = useState<AmmunitionSafe[]>([]);
  const [ammunitionStock, setAmmunitionStock] = useState<AmmunitionStock[]>([]);
  const [ammunitionSales, setAmmunitionSales] = useState<AmmunitionSale[]>([]);
  const [newAmmunitionTypeName, setNewAmmunitionTypeName] = useState('');
  const [newAmmunitionTypePricePence, setNewAmmunitionTypePricePence] = useState(0);
  const [newAmmunitionSafeName, setNewAmmunitionSafeName] = useState('');
  const [saleBuyerUserId, setSaleBuyerUserId] = useState('');
  const [saleBuyerFirstName, setSaleBuyerFirstName] = useState('');
  const [saleBuyerLastName, setSaleBuyerLastName] = useState('');
  const [saleTypeId, setSaleTypeId] = useState('');
  const [saleSafeId, setSaleSafeId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState(1);
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

  const REFRESH_VISITS_INTERVAL_MS = 120_000;

  useEffect(() => {
    if (!id) return;
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
      .catch(() => setIsAdmin(false));
  }, [id, user?.id]);

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
        setSettings(s);
        setSettingsForm(s);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading settings'));
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

  useEffect(() => {
    if (!id || !isAdmin) return;
    Promise.all([loadAmmunitionSettings(), loadAmmunitionStock(), loadAmmunitionSales()])
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading ammunition data'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

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
      const invite = await api.post<ClubInvite>(`/api/clubs/${id}/invites`, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        expiresInDays: inviteExpiresInDays,
      });
      setInvites(prev => [invite, ...prev]);
      setInviteEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating invite');
    }
  }

  function getInviteUrl(token: string): string {
    return `${inviteBaseUrl}/${token}/accept`;
  }

  function copyInviteUrl(token: string) {
    void navigator.clipboard.writeText(getInviteUrl(token));
  }

  function sendInviteEmail(invite: ClubInvite) {
    const inviteUrl = getInviteUrl(invite.token);
    const subject = encodeURIComponent(`Invitation to join ${club?.name ?? 'the club'}`);
    const body = encodeURIComponent(
      `Hello,\n\nYou have been invited to join ${club?.name ?? 'our club'} as ${invite.role}.\n\nUse this link to accept your invite:\n${inviteUrl}\n\nIf you already have an account, sign in and accept directly. If not, register using the same email address this invite was sent to.\n\nThanks.`
    );
    window.location.href = `mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}`;
  }

  async function addFirearm(data: { make: string; model: string; caliber: string; serialNumber: string }) {
    if (!id) return;
    const f = await api.post<Firearm>(`/api/clubs/${id}/firearms`, data);
    setFirearms(prev => [...prev, f]);
    setShowFirearmForm(false);
  }

  async function removeFirearm(firearmId: string) {
    if (!id) return;
    await api.delete(`/api/clubs/${id}/firearms/${firearmId}`);
    setFirearms(prev => prev.filter(f => f.id !== firearmId));
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
      });
      setSettings(updated);
      setSettingsForm(updated);
      setEditingSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function createAmmunitionType() {
    if (!id || !newAmmunitionTypeName.trim()) return;
    try {
      await api.post(`/api/ammunition/club/${id}/types`, {
        name: newAmmunitionTypeName.trim(),
        pricePence: newAmmunitionTypePricePence,
      });
      setNewAmmunitionTypeName('');
      setNewAmmunitionTypePricePence(0);
      await loadAmmunitionSettings();
      await loadAmmunitionStock();
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating ammunition type');
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
      });
      setSaleQuantity(1);
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

  if (!club) return <div>Loading…</div>;

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
            <Link to={`/clubs/${id}/scores-report`} className="btn btn-secondary btn-sm">
              Scores Report
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
              onRenameSafe={renameSafe}
              onDeleteSafe={deleteSafe}
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
              firearms={firearms}
              showForm={showFirearmForm}
              onToggleForm={() => setShowFirearmForm(s => !s)}
              onAdd={addFirearm}
              onRemove={removeFirearm}
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
            editingRole={editingRole}
            savingRole={savingRole}
            onApprove={approveMember}
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
              onCopyUrl={copyInviteUrl}
              onSendEmail={sendInviteEmail}
            />
          )}
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
              saleBuyerUserId={saleBuyerUserId}
              saleBuyerFirstName={saleBuyerFirstName}
              saleBuyerLastName={saleBuyerLastName}
              saleTypeId={saleTypeId}
              saleSafeId={saleSafeId}
              saleQuantity={saleQuantity}
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
              onConfirmSale={confirmAmmunitionSale}
              onLedgerBuyerSearchChange={setLedgerBuyerSearch}
              onLedgerSellerSearchChange={setLedgerSellerSearch}
              onLedgerTypeIdChange={setLedgerTypeId}
              onLedgerFromDateChange={setLedgerFromDate}
              onLedgerToDateChange={setLedgerToDate}
              onRefreshLedger={loadAmmunitionSales}
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
            <MatchSecretarySection clubId={id ?? ''} members={members} />
          )}
        </>
      )}
    </>
  );
}
