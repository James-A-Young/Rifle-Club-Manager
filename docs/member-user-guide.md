# Member User Guide (General Members)

## Getting Started: First Login
### Register your account
Use the Register page and complete:
- Full name
- Email
- Password (minimum 8 characters)
- Address
- Place of birth
- Date of birth
- GDPR consent checkbox

Optional at signup:
- Cloudflare Turnstile captcha (only shown when enabled by deployment config)

After successful registration:
- You are signed in immediately.
- Your club membership (if requested or invite-based) remains `PENDING` until admin approval.

## Set Up Your Profile
Open **Profile** (`/profile`) and review/update:
- Name
- Address
- Place of birth
- Date of birth
- Firearm certificate number + expiry (optional)
- Shotgun certificate number + expiry (optional)

Why this matters:
- Club admins can view these fields for compliance and membership verification.

## Manage Your Personal Firearms
In **My Firearms** on the profile page:
1. Click **Add Firearm**.
2. Enter make, model, caliber, and serial number.
3. Save.
4. Remove entries with **Remove** when needed.

These are your user-owned firearms and are separate from club armory records.

## Join a Club
### Option A: Open join request
1. Open your **Dashboard**.
2. Use the join flow to select a club.
3. Submit request.
4. Wait for admin review.

### Option B: Email invite link
1. Open the invite URL (`/invites/:token/accept`).
2. Sign in first if prompted.
3. Accept the invite.

Important:
- The account email must match the invited email.
- Accepted invites still enter `PENDING` status until approved.

## Sign In at the Range
You can sign in through two paths:

### 1) QR link sign-in (`/sign-in/:token`)
- Scan/open a QR sign-in link provided by the club.
- Enter visit purpose.
- Optionally link a club firearm or enter a personal serial number.
- If not logged in, provide guest details (name, represented club/org, optional email).

### 2) Kiosk sign-in (`/kiosk/:token`)
- Use the kiosk tablet at the club.
- Scan the rotating QR or use manual sign-in form.
- Staff/admin can manage active sign-ins from the kiosk view.

## Sign Out and Track Visits
From your Dashboard:
- See whether you have an active visit.
- Sign out from the active visit panel.
- Review your visit history list.
- View total visits and visits in the last 30 days.

## Your Dashboard
Dashboard provides:
- Welcome panel
- Club list
- Join-club workflow
- Active visit status
- Visit counts (lifetime + recent month)

## Digital Membership Card (Google Wallet)
If your club enables pass issuing:
- You can request a membership pass for that club.
- The pass includes your member QR code and current-year visit count.
- You may receive an "Add to Google Wallet" link.

If pass issuing is disabled (or Wallet credentials are not configured), pass generation is blocked.

## Privacy & Data
Your account stores personal/member data, including:
- Identity and contact details
- Birth/place details
- Optional certificate metadata
- Visit history and sign-in timestamps

Additional privacy notes:
- GDPR consent timestamp is recorded at registration.
- Sign-out updates `timeOut`, while visit records remain for audit/history.
- Authentication primarily uses an HttpOnly `auth_token` cookie.
