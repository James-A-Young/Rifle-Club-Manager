import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
} from '../types/club';
import DashboardTabNav from '../components/dashboard/DashboardTabNav';
import ClubProfileSection from '../components/dashboard/ClubProfileSection';
import ClubSettingsSection from '../components/dashboard/ClubSettingsSection';
import KioskLinksSection from '../components/dashboard/KioskLinksSection';
import ArmorySection from '../components/dashboard/ArmorySection';
import MembersSection from '../components/dashboard/MembersSection';
import InvitesSection from '../components/dashboard/InvitesSection';
import ActiveVisitorsTable, { ActiveVisitorRow } from '../components/ActiveVisitorsTable';

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

export default function ClubDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

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
  const [activeTab, setActiveTab] = useState<'operations' | 'settings'>('operations');

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

  const REFRESH_VISITS_INTERVAL_MS = 5_000;

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
              View Sign-In History
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <DashboardTabNav activeTab={activeTab} onChange={setActiveTab} />

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
    </>
  );
}
