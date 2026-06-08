import { randomBytes } from 'crypto';

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function normalizeVanitySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function slugFromTitle(value: string): string {
  const slug = normalizeVanitySlug(value);
  return slug || 'post';
}

export function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  const hostPort = withoutScheme.split('/')[0] ?? '';
  const hostname = hostPort.split(':')[0] ?? '';
  if (!hostname || hostname.includes(' ')) return null;
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  if (!hostname.includes('.')) return null;
  return hostname.replace(/^\.+|\.+$/g, '');
}

export function normalizeHostHeader(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  return normalizeDomain(hostHeader);
}

export function buildVerificationToken(_domain: string): string {
  return randomBytes(12).toString('hex');
}

export function getExpectedCnameTarget(): string {
  return (process.env.PUBLIC_SITE_CNAME_TARGET ?? 'public.shootingmatch.app').trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineMarkdown(value: string): string {
  let out = escapeHtml(value);

  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, hrefRaw) => {
    try {
      const url = new URL(hrefRaw, 'https://shootingmatch.app');
      if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) {
        return text;
      }
      return `<a href="${escapeHtml(url.toString())}" rel="noopener noreferrer" target="_blank">${text}</a>`;
    } catch {
      return text;
    }
  });

  return out;
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(line => applyInlineMarkdown(line)).join('<br/>')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<ul>${listItems.map(item => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const depth = headingMatch[1].length;
      html.push(`<h${depth}>${applyInlineMarkdown(headingMatch[2])}</h${depth}>`);
      continue;
    }

    const listMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return html.join('');
}
