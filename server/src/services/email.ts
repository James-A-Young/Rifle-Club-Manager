import { MembershipRole } from '../generated/client.js';
import { Resend } from 'resend';

const DEFAULT_APP_ORIGIN = 'http://localhost:5173';
const warnedMessages = new Set<string>();

function warnOnce(message: string): void {
  if (warnedMessages.has(message)) {
    return;
  }
  warnedMessages.add(message);
  console.warn(message);
}

function getAppOrigin(): string {
  const configured = process.env.CLIENT_ORIGIN ?? DEFAULT_APP_ORIGIN;
  return configured.replace(/\/+$/, '');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    warnOnce('Email disabled: RESEND_API_KEY is not configured.');
    return null;
  }
  return key;
}

function getResendFromEmail(): string | null {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    warnOnce('Email disabled: RESEND_FROM_EMAIL is not configured.');
    return null;
  }
  return from;
}

function createResendClient(): Resend | null {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

export interface SendPasswordResetEmailParams {
  to: string;
  name?: string | null;
  resetToken: string;
  expiresInMinutes: number;
}

export interface SendInviteEmailParams {
  to: string;
  clubName: string;
  role: MembershipRole;
  inviteToken: string;
}

export interface SendTwoFactorDisableEmailParams {
  to: string;
  name?: string | null;
  disableToken: string;
  expiresInMinutes: number;
}

function buildResetUrl(resetToken: string): string {
  const params = new URLSearchParams({ token: resetToken });
  return `${getAppOrigin()}/reset-password?${params.toString()}`;
}

function buildInviteUrl(inviteToken: string): string {
  return `${getAppOrigin()}/invites/${encodeURIComponent(inviteToken)}/accept`;
}

function buildTwoFactorDisableUrl(disableToken: string): string {
  const params = new URLSearchParams({ token: disableToken });
  return `${getAppOrigin()}/disable-2fa?${params.toString()}`;
}

async function sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<boolean> {
  const resend = createResendClient();
  const from = getResendFromEmail();
  if (!resend || !from) {
    return false;
  }

  const resetUrl = buildResetUrl(params.resetToken);
  const safeResetUrl = escapeHtml(resetUrl);
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : 'Hello,';
  const safeGreeting = escapeHtml(greeting);
  const subject = 'Reset your Rifle Club Manager password';
  const text = [
    greeting,
    '',
    'We received a request to reset your password.',
    `Use this one-time link to reset it: ${resetUrl}`,
    '',
    `This link expires in ${params.expiresInMinutes} minutes.`,
    'If you did not request a reset, you can ignore this email.',
  ].join('\n');
  const html = [
    `<p>${safeGreeting}</p>`,
    '<p>We received a request to reset your password.</p>',
    `<p><a href="${safeResetUrl}">Reset your password</a></p>`,
    `<p>This one-time link expires in ${params.expiresInMinutes} minutes.</p>`,
    '<p>If you did not request a reset, you can ignore this email.</p>',
  ].join('');

  try {
    await resend.emails.send({
      from,
      to: params.to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

async function sendInviteEmail(params: SendInviteEmailParams): Promise<boolean> {
  const resend = createResendClient();
  const from = getResendFromEmail();
  if (!resend || !from) {
    return false;
  }

  const inviteUrl = buildInviteUrl(params.inviteToken);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const safeClubName = escapeHtml(params.clubName);
  const safeRole = escapeHtml(params.role);
  const subject = `Invitation to join ${params.clubName}`;
  const text = [
    'Hello,',
    '',
    `You have been invited to join ${params.clubName} as ${params.role}.`,
    `Accept your invite here: ${inviteUrl}`,
    '',
    'If you already have an account, sign in and accept directly.',
    'If not, register with this invited email address.',
  ].join('\n');
  const html = [
    '<p>Hello,</p>',
    `<p>You have been invited to join <strong>${safeClubName}</strong> as <strong>${safeRole}</strong>.</p>`,
    `<p><a href="${safeInviteUrl}">Accept your invite</a></p>`,
    '<p>If you already have an account, sign in and accept directly. If not, register with this invited email address.</p>',
  ].join('');

  try {
    await resend.emails.send({
      from,
      to: params.to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error('Failed to send invite email:', error);
    return false;
  }
}

async function sendTwoFactorDisableEmail(params: SendTwoFactorDisableEmailParams): Promise<boolean> {
  const resend = createResendClient();
  const from = getResendFromEmail();
  if (!resend || !from) {
    return false;
  }

  const disableUrl = buildTwoFactorDisableUrl(params.disableToken);
  const safeDisableUrl = escapeHtml(disableUrl);
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : 'Hello,';
  const safeGreeting = escapeHtml(greeting);
  const subject = 'Disable two-factor authentication for your account';
  const text = [
    greeting,
    '',
    'We received a request to disable authenticator-based 2FA on your account.',
    `Use this one-time link to disable 2FA: ${disableUrl}`,
    '',
    `This link expires in ${params.expiresInMinutes} minutes.`,
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = [
    `<p>${safeGreeting}</p>`,
    '<p>We received a request to disable authenticator-based 2FA on your account.</p>',
    `<p><a href="${safeDisableUrl}">Disable 2FA</a></p>`,
    `<p>This one-time link expires in ${params.expiresInMinutes} minutes.</p>`,
    '<p>If you did not request this, you can ignore this email.</p>',
  ].join('');

  try {
    await resend.emails.send({
      from,
      to: params.to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error('Failed to send 2FA disable email:', error);
    return false;
  }
}

export function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  const normalized = (userAgent ?? '').trim();
  const trimmed = normalized.length > 512 ? normalized.slice(0, 512) : normalized;
  return trimmed.length > 0 ? trimmed : null;
}

export const emailService = {
  sendPasswordResetEmail,
  sendInviteEmail,
  sendTwoFactorDisableEmail,
};
