/** Shared domain types used across club dashboard, kiosk, and sign-in screens. */

export interface SimpleFirearm {
  id: string;
  make: string;
  model: string;
  caliber: string;
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

export interface MemberUser {
  id: string;
  name: string;
  email: string;
  address?: string;
  placeOfBirth?: string;
  dateOfBirth?: string;
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
  user: MemberUser;
}

export interface SignInLink {
  id: string;
  cryptoToken: string;
  expiresAt: string;
  mode?: 'KIOSK' | 'QR';
}

export type MembershipRoleType = 'MEMBER' | 'ADMIN' | 'PROBATIONARY_MEMBER';

export interface ClubInvite {
  id: string;
  email: string;
  role: MembershipRoleType;
  token: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}

export interface ClubSettings {
  clubId: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  passIssuingEnabled: boolean;
  memberCardSignInEnabled: boolean;
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
