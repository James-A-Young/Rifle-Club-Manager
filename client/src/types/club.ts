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

export interface AmmunitionTypePriceHistory {
  id: string;
  pricePence: number;
  createdAt: string;
}

export interface AmmunitionType {
  id: string;
  name: string;
  currentPricePence: number;
  priceHistory: AmmunitionTypePriceHistory[];
}

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
