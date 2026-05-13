import { MembershipRole } from '@prisma/client';
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
  const configured = process.env.APP_ORIGIN ?? process.env.CLIENT_ORIGIN ?? DEFAULT_APP_ORIGIN;
  return configured.replace(/\/+$/, '');
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

function trimUserAgent(userAgent: string | null | undefined): string {
  const normalized = (userAgent ?? '').trim();
  return normalized.length > 512 ? normalized.slice(0, 512) : normalized;
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

function buildResetUrl(resetToken: string): string {
  const params = new URLSearchParams({ token: resetToken });
  return `${getAppOrigin()}/reset-password?${params.toString()}`;
}

function buildInviteUrl(inviteToken: string): string {
  return `${getAppOrigin()}/invites/${encodeURIComponent(inviteToken)}/accept`;
}

async function sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<boolean> {
  const resend = createResendClient();
  const from = getResendFromEmail();
  if (!resend || !from) {
    return false;
  }

  const resetUrl = buildResetUrl(params.resetToken);
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : 'Hello,';
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
    `<p>${greeting}</p>`,
    '<p>We received a request to reset your password.</p>',
    `<p><a href="${resetUrl}">Reset your password</a></p>`,
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
    `<p>You have been invited to join <strong>${params.clubName}</strong> as <strong>${params.role}</strong>.</p>`,
    `<p><a href="${inviteUrl}">Accept your invite</a></p>`,
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

export function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  const trimmed = trimUserAgent(userAgent);
  return trimmed.length > 0 ? trimmed : null;
}

export const emailService = {
  sendPasswordResetEmail,
  sendInviteEmail,
};
