/** Constants and types shared between the visit sign-in form used in SignIn, KioskSignIn. */

export const VISIT_PURPOSES = ['Practice', 'Competition', 'Training', 'Range Officer', 'Other'] as const;

export interface GuestDetails {
  guestName: string;
  guestClubRepresented: string;
  guestEmail: string;
}

export const EMPTY_GUEST_DETAILS: GuestDetails = {
  guestName: '',
  guestClubRepresented: '',
  guestEmail: '',
};
