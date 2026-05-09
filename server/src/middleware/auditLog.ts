/**
 * Security audit logger.
 *
 * Emits structured JSON log lines for security-relevant events so that
 * operators and SIEM tools can detect and alert on abuse without exposing
 * sensitive information in HTTP responses.
 *
 * All log lines go to stdout/stderr via console so they are captured by the
 * container runtime's logging driver.  They use a consistent JSON shape:
 *
 *   { "ts": "<ISO-8601>", "event": "<EVENT_CODE>", "severity": "...", ...ctx }
 *
 * Event codes follow the pattern SECURITY_<CATEGORY>_<RESULT>.
 */

export type AuditSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export interface AuditEventBase {
  ts: string;
  severity: AuditSeverity;
  event: string;
  ip?: string;
  userId?: string;
}

function now(): string {
  return new Date().toISOString();
}

function write(severity: AuditSeverity, event: string, ctx: Record<string, unknown>): void {
  const line: AuditEventBase & Record<string, unknown> = {
    ts: now(),
    severity,
    event,
    ...ctx,
  };
  if (severity === 'CRITICAL' || severity === 'WARN') {
    console.warn(JSON.stringify(line));
  } else {
    console.log(JSON.stringify(line));
  }
}

// ─── Auth events ─────────────────────────────────────────────────────────────

/** Record a failed login attempt (wrong password or unknown email). */
export function auditAuthLoginFailed(ip: string | undefined, email: string): void {
  write('WARN', 'SECURITY_AUTH_LOGIN_FAILED', { ip, email });
}

/** Record a successful login. */
export function auditAuthLoginSuccess(ip: string | undefined, userId: string, email: string): void {
  write('INFO', 'SECURITY_AUTH_LOGIN_SUCCESS', { ip, userId, email });
}

/** Record a successful registration. */
export function auditAuthRegisterSuccess(ip: string | undefined, userId: string, email: string): void {
  write('INFO', 'SECURITY_AUTH_REGISTER_SUCCESS', { ip, userId, email });
}

/** Record rejection of an invalid / expired JWT. */
export function auditAuthTokenInvalid(ip: string | undefined, reason: string): void {
  write('WARN', 'SECURITY_AUTH_TOKEN_INVALID', { ip, reason });
}

// ─── Access control events ────────────────────────────────────────────────────

/** Record an attempt to delete a firearm that doesn't belong to the caller's club. */
export function auditFirearmDeleteDenied(
  ip: string | undefined,
  userId: string,
  clubId: string,
  firearmId: string,
): void {
  write('WARN', 'SECURITY_FIREARM_DELETE_DENIED', { ip, userId, clubId, firearmId });
}

/** Record an attempt to link a firearm that doesn't belong to the caller's club/user. */
export function auditFirearmLinkDenied(
  ip: string | undefined,
  userId: string | undefined,
  clubId: string,
  firearmId: string,
): void {
  write('WARN', 'SECURITY_FIREARM_LINK_DENIED', { ip, userId, clubId, firearmId });
}

// ─── Privileged action events ────────────────────────────────────────────────

/** Record a member status change (APPROVED / REJECTED). */
export function auditMemberStatusChange(
  ip: string | undefined,
  adminUserId: string,
  clubId: string,
  targetUserId: string,
  newStatus: string,
): void {
  write('INFO', 'SECURITY_MEMBER_STATUS_CHANGE', { ip, adminUserId, clubId, targetUserId, newStatus });
}

/** Record a member role change (MEMBER → ADMIN or vice-versa). */
export function auditMemberRoleChange(
  ip: string | undefined,
  adminUserId: string,
  clubId: string,
  targetUserId: string,
  newRole: string,
): void {
  write('INFO', 'SECURITY_MEMBER_ROLE_CHANGE', { ip, adminUserId, clubId, targetUserId, newRole });
}

// ─── Kiosk / sign-in link events ─────────────────────────────────────────────

/** Record use of an expired or non-existent sign-in link token. */
export function auditSignInLinkInvalid(ip: string | undefined, reason: string): void {
  write('WARN', 'SECURITY_SIGNIN_LINK_INVALID', { ip, reason });
}

/** Record sign-in via kiosk (for traceability). */
export function auditKioskSignIn(
  ip: string | undefined,
  clubId: string,
  visitorType: 'member' | 'guest',
  userId?: string,
): void {
  write('INFO', 'SECURITY_KIOSK_SIGNIN', { ip, clubId, visitorType, userId });
}
