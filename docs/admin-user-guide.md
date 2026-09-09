# Admin User Guide (Club Administrators)

## Who Is a Club Admin?
Rifle Club Manager uses two role layers:

- **System user role** (`User.role`): `MEMBER`, `ADMIN`, `OWNER`
  - Set to `OWNER` automatically when a user creates a club.
- **Per-club membership role** (`ClubMembership.role`): `MEMBER` or `ADMIN`
  - Controls what a user can do within a specific club.

In practice:
- A user who creates a club becomes that club's **approved ADMIN** member and their system role becomes `OWNER`.
- Club administration actions (approving members, managing invites, editing club settings, etc.) are authorized by having an **approved ADMIN** club membership — not the system-level role.
- Multiple users can hold club ADMIN role in the same club.

## How-To: Approve or Reject Membership Requests
1. Open your club page (`/clubs/:id`).
2. Go to the **Members** table.
3. For entries with `PENDING` status, click:
   - **Approve** to set `APPROVED`
   - **Reject** to set `REJECTED`
4. Confirm the status badge updates.

Operational note:
- Membership status changes generate structured security audit events in server logs.

## How-To: Invite Members by Email
1. In your club dashboard, open the **Invites** section.
2. Enter:
   - Email
   - Role (`MEMBER` or `ADMIN`)
   - Expiry (1–90 days, default 14)
3. Click **Create Invite**.
4. Share the invite link using **Copy Link** (copies to clipboard) or **Send Email** (opens your default mail client with a pre-filled invite message).

Important behaviors:
- Invite links are token-based and single-use.
- Invite acceptance requires the logged-in account email to match the invite email exactly.
- When an invite is accepted, the membership is created in `PENDING` status and must be approved by a club admin.
- If the recipient does not yet have an account, they should register using the same email address the invite was sent to.

## How-To: Promote or Demote a Member
1. In **Members**, find an `APPROVED` user.
2. Click **Edit Role**.
3. Select `MEMBER` or `ADMIN`.
4. Click **Save**.

Safety guard:
- The system blocks demotion of the **last approved admin** in a club.

## How-To: Edit Club Profile
1. Open **Club Profile**.
2. Click **Edit**.
3. Update any supported fields:
   - Club Name
   - Home Office Reference
   - Address
   - Disciplines Offered
   - Accepting New Members
   - Opening Times
   - Description
4. Click **Save Club Profile**.

## How-To: Manage Club Firearms (Armory)
1. Go to **Club Armory**.
2. Click **Add Firearm** and submit make/model/caliber/serial.
3. Remove firearms with **Remove** when needed.

Security behavior:
- Firearm deletion is restricted to firearms owned by that same club.
- Cross-club deletion attempts are denied and audited.

## How-To: Generate Sign-In Links & Kiosk Mode
### Kiosk links (long-lived)
1. In **Kiosk Links**, click **Create Kiosk Link**.
2. Share/open the generated `/kiosk/:token` URL on a tablet or kiosk device.
3. Revoke with **Revoke** when a device is retired or compromised.

Kiosk behavior:
- The kiosk page rotates short-lived QR sign-in tokens automatically.
- Admins can view active visitors and sign out individual/all visitors from kiosk UI.

### Standard QR sign-in links
- The kiosk issues rotating short-lived links for public sign-in (`/sign-in/:token`).

## How-To: Configure Club Settings (Branding & Cards)
Club settings endpoints support:
- `logoUrl`
- `primaryColor`
- `secondaryColor`
- `accentColor`
- `passIssuingEnabled`
- `memberCardSignInEnabled`

When configured:
- Branding is applied to membership pass generation.
- Member card QR sign-in can be enabled for club operations.

## Visit History & Analytics
Open **View Sign-In History** from your club page.

You can:
- Filter by time window (`3m`, `6m`, `12m`, custom)
- Search by member/guest info and firearm serial
- Filter by visitor type (`member` or `guest`)
- Export history to CSV
- Load more rows with cursor pagination

The summary section also shows:
- Last visit per member
- Last firearm usage
- Most frequent attendee (for selected filters)

## How-To: View Member Profiles
1. In **Members**, click **View Profile**.
2. Review compliance-relevant fields:
   - Address
   - Place and date of birth
   - Firearm certificate number/expiry
   - Shotgun certificate number/expiry
   - GDPR consent date

## Content Moderation Scope
There is no forum/chat/content-post moderation subsystem in this codebase.
Admin moderation is centered on:
- Membership approval/rejection
- Role assignment
- Invite issuance lifecycle
- Attendance and access-control oversight
