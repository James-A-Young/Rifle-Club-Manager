# Club Onboarding Guide (New Operators)

This guide walks a new club operator through setting up Rifle Club Manager from scratch — from first login to having a live kiosk and approved members.

> **Prerequisite**: The platform must already be deployed and reachable at a URL. If you need to self-host first, follow the [Deploy Guide](deploy-guide.md).

---

## Step 1: Create your account

Navigate to your platform URL and click **Start Free** (or go to `/register`).

Fill in the required fields:
- Full name
- Email address
- Password (minimum 8 characters)
- Home address
- Place of birth
- Date of birth
- Tick **GDPR consent**

If the deployment has Cloudflare Turnstile enabled, complete the captcha widget before submitting.

After registering you are signed in immediately. Your account starts with system role `MEMBER`.

> **Note**: If you were invited to join an existing club (rather than creating a new one), see the [Member User Guide](member-user-guide.md) instead.

---

## Step 2: Create your club

After registration you land on your **Dashboard**.

1. Click **Create Club**.
2. Enter at minimum a **Club Name**.
3. Optionally fill in other profile fields at this stage (you can edit them later):
   - Home Office Reference
   - Address
   - Disciplines Offered
   - Opening Times
   - Description
4. Submit.

What happens automatically:
- Your new club is created and listed on your Dashboard.
- You are added as an **approved ADMIN** member of the club.
- Your account's system role is promoted to `OWNER`.

---

## Step 3: Complete your club profile

Open your club from the Dashboard (**View**), then click **Edit** in the **Club Profile** section.

Keep the following fields up to date, as they appear on the public profile page (`/clubs/profile/:id`) visible to anyone with the link:

| Field | Purpose |
|---|---|
| Club Name | Displayed everywhere |
| Home Office Reference | Used in official correspondence |
| Address | Physical range location |
| Disciplines Offered | Shooting disciplines (e.g. target, practical, air rifle) — add each tag individually |
| Accepting New Members | Toggle to open or close the club to new join requests |
| Opening Times | Free-text range schedule |
| Description | Public-facing description of the club |

Click **Save Club Profile** when done.

---

## Step 4: Configure club settings

In your club dashboard, club settings control branding and key feature flags.

Navigate to the **Club Settings** section (visible to admins only):

### Branding
| Setting | Description |
|---|---|
| `logoUrl` | URL of your club logo (shown on membership passes) |
| `primaryColor` | Main brand color (hex, default `#1f2937`) |
| `secondaryColor` | Secondary color (hex, default `#374151`) |
| `accentColor` | Accent / highlight color (hex, default `#3b82f6`) |

### Feature flags
| Setting | Description |
|---|---|
| `passIssuingEnabled` | Allow approved members to generate a Google Wallet membership pass for this club. Only enable after configuring Google Wallet credentials in the deployment environment. |
| `memberCardSignInEnabled` | Allow members to sign in at the kiosk by scanning the QR code on their digital membership card. |

---

## Step 5: Set up your kiosk

The kiosk is a tablet-friendly sign-in terminal. Members and guests use it to record their attendance at the range.

### Create a kiosk link
1. In your club dashboard, go to the **Kiosk Links** section.
2. Click **Create Kiosk Link**.
3. A long-lived link is generated (valid for approximately 5 years).
4. Click **Copy** to copy the URL.

### Deploy on a tablet
1. Open the copied URL on the kiosk device (tablet or dedicated PC at the front desk).
2. Bookmark or pin it as a home screen shortcut.
3. The kiosk page displays a rotating QR code that refreshes automatically every few minutes — members scan it to sign in.
4. A manual sign-in form is also available on the kiosk for members without phones.

### Managing active visitors
From the kiosk interface, staff can see who is currently signed in and sign out individual visitors or clear all active visits at end of day.

### Revoking a kiosk link
If a device is lost, stolen, or retired:
1. Go to **Kiosk Links** in the club dashboard.
2. Click **Revoke** next to the relevant link.
3. Create a new kiosk link and deploy it on the replacement device.

---

## Step 6: Invite your first members

There are two ways members can join your club.

### Option A: Invite link (recommended for controlled onboarding)
1. In your club dashboard, open the **Invites** section.
2. Enter the member's email address, select a role (`MEMBER` or `ADMIN`), and set an expiry (default 14 days, max 90).
3. Click **Create Invite**.
4. Share via **Copy Link** (paste into a message) or **Send Email** (opens your mail client with a pre-filled invitation).

The recipient:
- If they already have an account: logs in and opens the invite URL to accept.
- If they are new: registers using the **same email address** the invite was sent to, then accepts.

After accepting, their membership is created with `PENDING` status for admin approval.

### Option B: Open join request
Members can discover your club from the **Dashboard** → **Join Club** flow and submit a request without an invite. Their request appears as `PENDING` in your members list.

> Set **Accepting New Members** to `No` in the club profile to stop open join requests while still allowing invite-based onboarding.

---

## Step 7: Approve membership requests

1. Open your club dashboard.
2. Scroll to the **Members** table.
3. Entries with `PENDING` status show **Approve** and **Reject** buttons.
4. Click **Approve** to grant access or **Reject** to decline.

Once approved:
- The member can sign in at the kiosk.
- The member can request a Google Wallet membership pass (if `passIssuingEnabled` is on).
- Their status changes to `APPROVED`.

Rejected members remain in the list with `REJECTED` status and cannot participate in club activities.

---

## Step 8: Add club firearms to the armory (optional)

If your club lends or tracks range firearms, record them in the **Club Armory**:

1. In your club dashboard, go to **Club Armory**.
2. Click **Add Firearm**.
3. Enter make, model, caliber, and serial number.

Members signing in via the kiosk or sign-in page can then select a club firearm from the list, or enter a personal serial number. This is recorded in the visit log for compliance purposes.

---

## Step 9: Enable Google Wallet membership passes (optional)

If the deployment is configured with Google Wallet credentials, you can issue digital membership passes:

1. Enable `passIssuingEnabled` in **Club Settings**.
2. Optionally configure your logo URL and brand colors so the pass reflects your club's identity.
3. Approved members can then go to their **Profile** and request a pass for your club.
4. The pass displays in Google Wallet with their name, role, current-year visit count, and a QR code for kiosk sign-in (when `memberCardSignInEnabled` is also on).

> Google Wallet pass issuance requires `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_ISSUER_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY`, `GOOGLE_WALLET_PRIVATE_KEY_ID`, and `GOOGLE_WALLET_PROJECT_ID` to be set in the server environment. If these are absent, the endpoint returns an error even if `passIssuingEnabled` is on.

---

## Day-to-day admin reference

Once the club is running, refer to the [Admin User Guide](admin-user-guide.md) for:
- Viewing sign-in history and exporting CSV reports
- Managing member roles and handling role disputes
- Reviewing member compliance profiles (certificate numbers, DOB, GDPR consent date)
- Revoking kiosk links when devices are replaced
