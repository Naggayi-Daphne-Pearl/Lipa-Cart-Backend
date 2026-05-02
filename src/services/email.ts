import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import sgMail from '@sendgrid/mail';
import PDFDocument from 'pdfkit';

type EmailTransportKind = 'sendgrid-api' | 'smtp' | null;

let transporter: nodemailer.Transporter | null = null;
let transportKind: EmailTransportKind = null;
let lastEmailError: string | null = null;
let transporterVerified = false;
let emailTemporarilyDisabledUntil = 0;

type EmailAttachment = Mail.Attachment;

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

const FROM_ADDRESS = process.env.SMTP_FROM || 'LipaCart <noreply@lipacart.com>';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'daphnepearl101@gmail.com';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://www.lipacart.com').replace(/\/+$/, '');
const SMTP_CONNECTION_TIMEOUT_MS = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '20000', 10);
const SMTP_GREETING_TIMEOUT_MS = parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '20000', 10);
const SMTP_SOCKET_TIMEOUT_MS = parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '30000', 10);
const SMTP_FAILURE_BACKOFF_MS = parseInt(process.env.SMTP_FAILURE_BACKOFF_MS || '60000', 10);

interface ForgotPasswordEmailOptions {
  name?: string | null;
  resetUrl?: string | null;
}

interface ApprovalEmailOptions {
  name?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Unified email template system
// ─────────────────────────────────────────────────────────────

const BRAND = {
  primary: '#0F766E',
  primaryDark: '#0B5B56',
  ink: '#111827',
  muted: '#4B5563',
  subtle: '#6B7280',
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  codeBg: '#FFFFFF',
};

type EmailSection =
  | { kind: 'greeting'; text: string }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  | { kind: 'code'; code: string; label?: string; caption?: string }
  | { kind: 'cta'; label: string; url: string }
  | {
      kind: 'summary';
      rows: Array<{
        label: string;
        value: string;
        accent?: 'primary' | 'muted' | 'warn' | 'success';
      }>;
    }
  | { kind: 'notice'; title?: string; body: string; tone?: 'info' | 'warn' | 'success' };

function accentColor(accent?: 'primary' | 'muted' | 'warn' | 'success'): string {
  switch (accent) {
    case 'primary':
      return BRAND.primary;
    case 'warn':
      return BRAND.primary;
    case 'success':
      return BRAND.primary;
    case 'muted':
    default:
      return BRAND.ink;
  }
}

function toneStyles(tone?: 'info' | 'warn' | 'success'): {
  bg: string;
  border: string;
  ink: string;
} {
  return { bg: '#FFFFFF', border: BRAND.border, ink: tone ? BRAND.primaryDark : BRAND.ink };
}

function renderSection(section: EmailSection): string {
  switch (section.kind) {
    case 'greeting':
      return `<p style="margin:0 0 12px;color:${BRAND.ink};font-size:16px;font-weight:600;">${escapeHtml(section.text)}</p>`;
    case 'paragraph':
      return `<p style="margin:0 0 14px;color:${section.muted ? BRAND.muted : BRAND.ink};font-size:14px;line-height:1.6;">${section.text}</p>`;
    case 'code':
      return `
        <div style="margin:0 0 20px;padding:18px 16px;background:${BRAND.codeBg};border:1px solid ${BRAND.primary};border-radius:10px;text-align:center;">
          ${section.label ? `<p style="margin:0 0 10px;color:${BRAND.muted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(section.label)}</p>` : ''}
          <div style="font-size:30px;line-height:1;font-weight:700;letter-spacing:5px;color:${BRAND.ink};font-family:'SFMono-Regular',Consolas,Menlo,monospace;">${escapeHtml(section.code)}</div>
          ${section.caption ? `<p style="margin:10px 0 0;color:${BRAND.muted};font-size:12px;">${escapeHtml(section.caption)}</p>` : ''}
        </div>`;
    case 'cta':
      return `
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${section.url}" style="display:inline-block;padding:12px 22px;background:${BRAND.primary};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">${escapeHtml(section.label)}</a>
        </div>`;
    case 'summary':
      return `
        <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
          ${section.rows
            .map(
              (r, i) => `
            <tr>
              <td style="padding:10px 0;color:${BRAND.muted};font-size:14px;${i > 0 ? `border-top:1px solid ${BRAND.border};` : ''}">${escapeHtml(r.label)}</td>
              <td style="padding:10px 0;text-align:right;color:${accentColor(r.accent)};font-size:14px;font-weight:600;${i > 0 ? `border-top:1px solid ${BRAND.border};` : ''}">${escapeHtml(r.value)}</td>
            </tr>`,
            )
            .join('')}
        </table>`;
    case 'notice': {
      const { bg, border, ink } = toneStyles(section.tone);
      return `
        <div style="margin:0 0 20px;padding:14px 16px;border-radius:10px;background:${bg};border:1px solid ${border};">
          ${section.title ? `<p style="margin:0 0 4px;color:${ink};font-size:13px;font-weight:700;">${escapeHtml(section.title)}</p>` : ''}
          <p style="margin:0;color:${ink};font-size:13px;line-height:1.6;">${section.body}</p>
        </div>`;
    }
  }
}

function renderShell(params: { preheader?: string; sections: EmailSection[] }): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${params.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.preheader)}</div>` : ''}
  <div style="padding:20px 12px;">
    <div style="max-width:560px;margin:0 auto;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">
      <div style="padding:20px 24px 12px;border-bottom:2px solid ${BRAND.primary};">
        <div style="color:${BRAND.primary};font-size:20px;font-weight:700;letter-spacing:-0.2px;">LipaCart</div>
        <div style="color:${BRAND.muted};font-size:12px;margin-top:3px;">Reliable grocery delivery updates</div>
      </div>
      <div style="padding:20px 24px 6px;">
        ${params.sections.map(renderSection).join('\n')}
      </div>
      <div style="padding:16px 24px 20px;border-top:1px solid ${BRAND.border};background:#FFFFFF;">
        <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;">Support: <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">${SUPPORT_EMAIL}</a></p>
        <p style="margin:0;color:${BRAND.subtle};font-size:11px;">© ${year} LipaCart. Automated message from the LipaCart platform.</p>
      </div>
    </div>
  </div>
</body></html>`;
}

function renderSectionsPlainText(sections: EmailSection[]): string {
  const lines: string[] = [];
  for (const s of sections) {
    switch (s.kind) {
      case 'greeting':
        lines.push(s.text);
        lines.push('');
        break;
      case 'paragraph':
        lines.push(toPlainText(s.text));
        lines.push('');
        break;
      case 'code':
        if (s.label) lines.push(s.label.toUpperCase());
        lines.push(s.code);
        if (s.caption) lines.push(s.caption);
        lines.push('');
        break;
      case 'cta':
        lines.push(`${s.label}: ${s.url}`);
        lines.push('');
        break;
      case 'summary':
        for (const r of s.rows) lines.push(`${r.label}: ${r.value}`);
        lines.push('');
        break;
      case 'notice':
        if (s.title) lines.push(s.title);
        lines.push(toPlainText(s.body));
        lines.push('');
        break;
    }
  }
  lines.push(`Need help? Contact ${SUPPORT_EMAIL}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Initialize the Nodemailer transporter.
 * Call once at server startup. Skips gracefully if not configured.
 */
export function initEmail(): boolean {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
  if (sendgridApiKey) {
    sgMail.setApiKey(sendgridApiKey);
    transportKind = 'sendgrid-api';
    transporterVerified = true;
    lastEmailError = null;
    console.log('[email] SendGrid Web API transport initialized');
    return true;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const rawPass = process.env.SMTP_PASS?.trim();
  const isGmail = Boolean(host?.includes('gmail.com'));
  const pass = isGmail ? rawPass?.replace(/[^a-zA-Z0-9]/g, '') : rawPass;

  if (!host || !user || !pass) {
    console.warn('[email] SMTP not configured — email notifications disabled');
    return false;
  }

  if (isGmail && pass.length !== 16) {
    console.warn(
      `[email] Gmail app password appears unusual (normalized length: ${pass.length}). ` +
        'Regenerate app password and paste it exactly.',
    );
  }

  transportKind = 'smtp';
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  transporter.verify().then(
    () => {
      transporterVerified = true;
      lastEmailError = null;
      console.log('[email] Nodemailer initialized and verified');
    },
    (err) => {
      transporterVerified = false;
      lastEmailError = err?.message || 'SMTP verification failed';
      console.warn('[email] Transporter verify failed:', err?.message);
    },
  );

  return true;
}

/** Whether the email service is ready. */
export function isEmailReady(): boolean {
  return transportKind !== null;
}

export function getEmailDiagnostics() {
  return {
    configured: isEmailReady(),
    transport: transportKind,
    verified: transporterVerified,
    lastError: lastEmailError,
  };
}

function toPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withSupportContact(text: string): string {
  const normalized = (text || '').trim();
  if (!normalized) return `Support: ${SUPPORT_EMAIL}`;

  if (normalized.toLowerCase().includes(SUPPORT_EMAIL.toLowerCase())) {
    return normalized;
  }

  return `${normalized}\n\nSupport: ${SUPPORT_EMAIL}`;
}

function isTimeoutLikeError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  return (
    code.includes('TIMEOUT') ||
    code === 'ESOCKET' ||
    code === 'ECONNECTION' ||
    message.includes('timeout')
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildResetUrl(
  email?: string | null,
  otp?: string | null,
  overrideUrl?: string | null,
): string {
  let url: URL;
  try {
    url = overrideUrl ? new URL(overrideUrl) : new URL('/forgot-password', FRONTEND_URL);
  } catch {
    url = new URL('/forgot-password', FRONTEND_URL);
  }

  if (email) {
    url.searchParams.set('email', email.toLowerCase());
  }

  if (otp) {
    url.searchParams.set('otp', otp);
    url.searchParams.set('step', 'otp');
  }

  return url.toString();
}

/**
 * Send a generic email. Returns true on success.
 * Supports legacy signature: sendEmail(to, subject, html, text?)
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<boolean>;
export async function sendEmail(options: SendEmailOptions): Promise<boolean>;
export async function sendEmail(
  toOrOptions: string | SendEmailOptions,
  subject?: string,
  html?: string,
  text?: string,
): Promise<boolean> {
  if (!transportKind) return false;

  if (Date.now() < emailTemporarilyDisabledUntil) {
    return false;
  }

  const payload: SendEmailOptions =
    typeof toOrOptions === 'string'
      ? {
          to: toOrOptions,
          subject: subject || 'LipaCart Notification',
          html: html || '',
          text,
        }
      : toOrOptions;

  if (!payload.to) return false;

  const finalText = withSupportContact(payload.text || toPlainText(payload.html));
  const mergedHeaders = {
    ...(payload.headers || {}),
    'X-Support-Email': SUPPORT_EMAIL,
  };

  try {
    if (transportKind === 'sendgrid-api') {
      const { from, name } = parseFromAddress(FROM_ADDRESS);
      await sgMail.send({
        to: payload.to,
        from: name ? { email: from, name } : from,
        replyTo: payload.replyTo || SUPPORT_EMAIL,
        subject: payload.subject,
        html: payload.html,
        text: finalText,
        headers: mergedHeaders,
        attachments: payload.attachments?.map((a) => ({
          filename: String(a.filename || 'attachment'),
          type: (a as any).contentType || 'application/octet-stream',
          disposition: 'attachment',
          content: Buffer.isBuffer(a.content)
            ? a.content.toString('base64')
            : Buffer.from(String(a.content ?? ''), 'utf8').toString('base64'),
        })),
      });
    } else {
      if (!transporter) return false;
      await transporter.sendMail({
        from: FROM_ADDRESS,
        to: payload.to,
        replyTo: payload.replyTo || SUPPORT_EMAIL,
        subject: payload.subject,
        html: payload.html,
        text: finalText,
        headers: mergedHeaders,
        attachments: payload.attachments,
      });
    }
    lastEmailError = null;
    emailTemporarilyDisabledUntil = 0;
    return true;
  } catch (err: any) {
    const sgBody = err?.response?.body;
    lastEmailError =
      (sgBody && typeof sgBody === 'object' ? JSON.stringify(sgBody) : null) ||
      err?.message ||
      'Email send failed';
    if (transportKind === 'smtp' && isTimeoutLikeError(err) && process.env.NODE_ENV !== 'test') {
      emailTemporarilyDisabledUntil = Date.now() + SMTP_FAILURE_BACKOFF_MS;
      console.warn(
        `[email] SMTP temporarily disabled for ${Math.ceil(SMTP_FAILURE_BACKOFF_MS / 1000)}s after timeout`,
      );
    }
    console.error(`[email] Failed to send to ${payload.to}:`, lastEmailError);
    return false;
  }
}

function parseFromAddress(raw: string): { from: string; name?: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1]?.replace(/^"|"$/g, '').trim() || undefined, from: match[2].trim() };
  }
  return { from: raw.trim() };
}

function escapePdfText(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimpleReceiptPdf(orderNumber: string, total: number): Buffer {
  const issuedAt = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
  const lines = [
    'LipaCart Receipt',
    `Order Number: #${orderNumber}`,
    `Total Paid: UGX ${Number(total || 0).toLocaleString()}`,
    `Issued At: ${issuedAt}`,
    'Thank you for shopping with LipaCart.',
  ];

  const commands = ['BT', '/F1 12 Tf'];
  let y = 780;
  for (const line of lines) {
    commands.push(`1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= 24;
  }
  commands.push('ET');

  const stream = commands.join('\n');
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[5] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function buildPlainTextReceiptPdf(title: string, lines: string[]): Buffer {
  const commands = ['BT', '/F1 12 Tf'];
  const allLines = [title, '', ...lines];
  let y = 780;
  for (const line of allLines) {
    commands.push(`1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= line ? 18 : 10;
  }
  commands.push('ET');

  const stream = commands.join('\n');
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[5] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function formatCurrency(amount: unknown, currency = 'UGX'): string {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function formatDateTime(value: unknown): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatHumanDateTime(value: unknown): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('en-UG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function truncateMiddle(value: string, head = 8, tail = 5): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function toPdfSafeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\t\n\r\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PaymentReceiptPdfItem {
  name: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
}

interface PaymentReceiptPdfData {
  orderNumber: string;
  transactionId: string;
  paidAtHuman: string;
  amountPaid: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryWindow: string;
  itemRows: PaymentReceiptPdfItem[];
  summaryRows: Array<{ label: string; value: string; strong?: boolean }>;
}

async function buildStyledPaymentReceiptPdf(data: PaymentReceiptPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true });
  const chunks: Buffer[] = [];

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const colors = {
    green: '#0F766E',
    greenSoft: '#E7F6EE',
    ink: '#24312E',
    muted: '#6B7280',
    line: '#D8E2DD',
    soft: '#F6F8F7',
    zebra: '#FBFCFB',
  };
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageWidth - doc.page.margins.right;
  const contentWidth = right - left;
  const cardPad = 16;
  let y = doc.page.margins.top;

  const drawPageChrome = () => {
    doc.save();
    doc.rect(0, 0, pageWidth, 18).fill(colors.green);
    doc.restore();
  };

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 72) return;
    doc.addPage();
    drawPageChrome();
    y = doc.page.margins.top;
  };

  const sectionCard = (title: string, height: number, render: () => void) => {
    ensureSpace(height);
    doc.save();
    doc.roundedRect(left, y, contentWidth, height, 12).fillAndStroke('#FFFFFF', colors.line);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.green).text(toPdfSafeText(title), left + cardPad, y + 14, {
      width: contentWidth - cardPad * 2,
    });
    const previousY = y;
    y += 40;
    render();
    y = previousY + height + 14;
  };

  const labelValue = (label: string, value: string, top: number, emphasize = false) => {
    doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(toPdfSafeText(label), left + cardPad, top, {
      width: 150,
    });
    doc
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(emphasize ? 11 : 10.5)
      .fillColor(emphasize ? colors.green : colors.ink)
      .text(toPdfSafeText(value), left + 190, top, {
        width: contentWidth - 190 - cardPad,
        align: 'right',
      });
  };

  drawPageChrome();

  doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.green).text('LipaCart', left, y, { width: contentWidth / 2 });
  doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text('Reliable grocery delivery', left, y + 22, {
    width: contentWidth / 2,
  });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.ink).text('PAYMENT RECEIPT', left, y + 4, {
    width: contentWidth,
    align: 'right',
  });
  y += 52;

  ensureSpace(118);
  doc.save();
  doc.roundedRect(left, y, contentWidth, 118, 16).fillAndStroke(colors.greenSoft, colors.line);
  doc.restore();
  doc.circle(left + 34, y + 32, 18).fill(colors.green);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF').text('PAID', left + 19, y + 26, { width: 30, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(colors.green).text('Payment Successful', left + 68, y + 18);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(colors.green).text(toPdfSafeText(data.amountPaid), left + 68, y + 42);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.ink).text(`#${toPdfSafeText(data.orderNumber)}`, left + 68, y + 78);
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(toPdfSafeText(data.paidAtHuman), left + 68, y + 94);
  y += 132;

  sectionCard('Payment Information', 122, () => {
    labelValue('Transaction ID', data.transactionId, y);
    labelValue('Date', data.paidAtHuman, y + 22);
    labelValue('Method', 'PawaPay', y + 44);
    labelValue('Status', 'Payment Successful', y + 66, true);
    labelValue('Amount Paid', data.amountPaid, y + 88, true);
  });

  sectionCard('Customer Information', 84, () => {
    labelValue('Name', data.customerName, y);
    labelValue('Email', data.customerEmail, y + 24);
    labelValue('Delivery Window', data.deliveryWindow, y + 48);
  });

  const addressHeight = Math.max(84, 60 + Math.ceil(data.deliveryAddress.length / 44) * 14);
  sectionCard('Delivery Details', addressHeight, () => {
    doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text('Address', left + cardPad, y, { width: 120 });
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.ink).text(toPdfSafeText(data.deliveryAddress), left + 190, y, {
      width: contentWidth - 190 - cardPad,
      align: 'right',
    });
    labelValue('Website', FRONTEND_URL, y + 28);
  });

  const tableHeight = 58 + Math.max(1, data.itemRows.length) * 24 + 16;
  sectionCard('Order Items', tableHeight, () => {
    const cols = {
      item: left + cardPad,
      qty: left + contentWidth - 210,
      unit: left + contentWidth - 140,
      subtotal: left + contentWidth - 68,
    };
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.muted);
    doc.text('ITEM', cols.item, y, { width: cols.qty - cols.item - 8 });
    doc.text('QTY', cols.qty, y, { width: 34, align: 'center' });
    doc.text('UNIT', cols.unit, y, { width: 62, align: 'right' });
    doc.text('SUBTOTAL', cols.subtotal, y, { width: 58, align: 'right' });
    let rowY = y + 18;
    const rows = data.itemRows.length
      ? data.itemRows
      : [{ name: 'Order items unavailable', quantity: '-', unitPrice: '-', subtotal: '-' }];
    rows.forEach((row, index) => {
      if (index % 2 == 0) {
        doc.save();
        doc.rect(left + 8, rowY - 3, contentWidth - 16, 22).fill(colors.zebra);
        doc.restore();
      }
      doc.font('Helvetica').fontSize(10).fillColor(colors.ink).text(toPdfSafeText(row.name), cols.item, rowY, {
        width: cols.qty - cols.item - 8,
      });
      doc.text(toPdfSafeText(row.quantity), cols.qty, rowY, { width: 34, align: 'center' });
      doc.text(toPdfSafeText(row.unitPrice), cols.unit, rowY, { width: 62, align: 'right' });
      doc.text(toPdfSafeText(row.subtotal), cols.subtotal, rowY, { width: 58, align: 'right' });
      rowY += 24;
    });
  });

  const totalsHeight = 44 + data.summaryRows.length * 22;
  sectionCard('Order Summary', totalsHeight, () => {
    let rowY = y;
    data.summaryRows.forEach((row, index) => {
      if (row.strong && index > 0) {
        doc.save();
        doc.moveTo(left + cardPad, rowY - 6).lineTo(right - cardPad, rowY - 6).strokeColor(colors.line).stroke();
        doc.restore();
      }
      labelValue(row.label, row.value, rowY, row.strong);
      rowY += 22;
    });
  });

  ensureSpace(86);
  doc.save();
  doc.roundedRect(left, y, contentWidth, 86, 12).fillAndStroke(colors.soft, colors.line);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.ink).text('Thank you for shopping with LipaCart!', left + cardPad, y + 16);
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(
    'This is an official receipt. Please retain it for your records.',
    left + cardPad,
    y + 36,
    { width: contentWidth - cardPad * 2 },
  );
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(`Support: ${toPdfSafeText(SUPPORT_EMAIL)} | ${toPdfSafeText(FRONTEND_URL)}`, left + cardPad, y + 56, {
    width: contentWidth - cardPad * 2,
  });

  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex++) {
    doc.switchToPage(pageIndex);
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text(
      `Page ${pageIndex - pageRange.start + 1} of ${pageRange.count}`,
      left,
      pageHeight - 36,
      { width: contentWidth, align: 'right' },
    );
  }

  doc.end();
  return bufferPromise;
}

async function _getCustomerContact(
  strapi: any,
  orderId: number,
): Promise<{ email: string; name: string | null } | null> {
  try {
    const customerLink: any = await strapi.db.connection.raw(
      `SELECT user_id FROM orders_customer_lnk WHERE order_id = ?`,
      [orderId],
    );
    const rows = customerLink?.rows || customerLink;
    if (!rows || rows.length === 0) return null;

    const user: any = await strapi.db.query('api::user.user').findOne({
      where: { id: rows[0].user_id },
    });

    if (!user?.email) return null;

    return {
      email: String(user.email),
      name: user.name ? String(user.name) : null,
    };
  } catch {
    return null;
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  const sections: EmailSection[] = [
    { kind: 'greeting', text: 'Hi there,' },
    { kind: 'paragraph', text: 'Use the code below to sign in to LipaCart.' },
    { kind: 'code', code: otp, label: 'Verification code', caption: 'Valid for 5 minutes' },
    {
      kind: 'notice',
      body: 'Never share this code with anyone. LipaCart will never ask for your verification code.',
      tone: 'warn',
    },
    {
      kind: 'paragraph',
      muted: true,
      text: "If you didn't request this, you can safely ignore this email.",
    },
  ];
  return sendEmail({
    to,
    subject: 'Your LipaCart verification code',
    text: renderSectionsPlainText(sections),
    html: renderShell({ preheader: `Your LipaCart code is ${otp}`, sections }),
    headers: {
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': `otp-${Date.now()}`,
    },
  });
}

export async function sendForgotPasswordOtpEmail(
  to: string,
  otp: string,
  options: ForgotPasswordEmailOptions = {},
): Promise<boolean> {
  const firstName = options.name?.trim().split(' ')[0] || '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const resetUrl = buildResetUrl(to, otp, options.resetUrl);

  const sections: EmailSection[] = [
    { kind: 'greeting', text: greeting },
    {
      kind: 'paragraph',
      text: 'We received a request to reset your LipaCart password. Tap the button below or enter the code manually.',
    },
    { kind: 'cta', label: 'Reset Password', url: resetUrl },
    { kind: 'code', code: otp, label: 'Verification code', caption: 'Valid for 5 minutes' },
    {
      kind: 'notice',
      title: "Didn't request this?",
      body: 'You can safely ignore this email. Your account is still secure.',
      tone: 'info',
    },
    {
      kind: 'notice',
      body: 'Never share this code with anyone. LipaCart support will never ask for your verification code.',
      tone: 'warn',
    },
  ];

  return sendEmail({
    to,
    subject: 'Reset your LipaCart password',
    replyTo: SUPPORT_EMAIL,
    text: renderSectionsPlainText(sections),
    html: renderShell({ preheader: 'Reset your LipaCart password', sections }),
    headers: {
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': `forgot-pw-${Date.now()}`,
    },
  });
}

export async function sendKycApprovedLoginEmail(
  to: string,
  role: 'shopper' | 'rider',
  options: ApprovalEmailOptions = {},
): Promise<boolean> {
  const firstName = options.name?.trim().split(' ')[0] || '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const roleLabel = role === 'shopper' ? 'shopper' : 'rider';
  const loginUrl = `${FRONTEND_URL}/login`;

  const sections: EmailSection[] = [
    { kind: 'greeting', text: greeting },
    {
      kind: 'paragraph',
      text: `Welcome to the LipaCart team! Your ${roleLabel} account has been reviewed and approved.`,
    },
    {
      kind: 'paragraph',
      text: 'When you log in, the app will guide you through a short training quiz (5 questions, about 3 minutes) before you start taking orders. You can retake it if you do not pass the first time.',
    },
    { kind: 'cta', label: 'Log In to LipaCart', url: loginUrl },
    {
      kind: 'notice',
      title: "You're approved",
      body: 'Welcome to the LipaCart team. Tap the button above to log in and start your training.',
      tone: 'success',
    },
  ];

  return sendEmail({
    to,
    subject: 'Your LipaCart account is approved',
    replyTo: SUPPORT_EMAIL,
    text: renderSectionsPlainText(sections),
    html: renderShell({ preheader: `Your LipaCart ${roleLabel} account is approved`, sections }),
    headers: {
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': `kyc-approved-${role}-${Date.now()}`,
    },
  });
}

export async function sendOrderStatusUpdateEmail(
  strapi: any,
  orderId: number,
  orderNumber: string,
  statusLabel: string,
): Promise<void> {
  if (!isEmailReady()) return;

  try {
    const customerEmail = await _getCustomerEmail(strapi, orderId);
    if (!customerEmail) return;

    const sections: EmailSection[] = [
      { kind: 'greeting', text: 'Order update' },
      {
        kind: 'paragraph',
        text: `Your order <strong>#${escapeHtml(orderNumber)}</strong> has a new status.`,
      },
      {
        kind: 'summary',
        rows: [
          { label: 'Order Number', value: `#${orderNumber}` },
          { label: 'Status', value: statusLabel, accent: 'primary' },
        ],
      },
      { kind: 'paragraph', muted: true, text: 'You can track this order in the LipaCart app.' },
    ];
    await sendEmail({
      to: customerEmail,
      subject: `Order Update — #${orderNumber}`,
      text: renderSectionsPlainText(sections),
      html: renderShell({ preheader: `Order #${orderNumber} status: ${statusLabel}`, sections }),
    });
  } catch (err: any) {
    console.error('[email] sendOrderStatusUpdateEmail error:', err?.message);
  }
}

/**
 * Send an order confirmation email to the customer.
 */
export async function sendOrderConfirmationEmail(
  strapi: any,
  orderId: number,
  orderNumber: string,
): Promise<void> {
  if (!isEmailReady()) return;

  try {
    const customerEmail = await _getCustomerEmail(strapi, orderId);
    if (!customerEmail) return;

    const order: any = await strapi.db.query('api::order.order').findOne({
      where: { id: orderId },
    });

    const total = order?.total ?? 0;
    const formattedTotal = `UGX ${Number(total).toLocaleString()}`;

    const sections: EmailSection[] = [
      { kind: 'greeting', text: 'Order confirmed' },
      {
        kind: 'paragraph',
        text: `Your order <strong>#${escapeHtml(orderNumber)}</strong> has been placed successfully.`,
      },
      {
        kind: 'summary',
        rows: [
          { label: 'Order Number', value: `#${orderNumber}` },
          { label: 'Total', value: formattedTotal, accent: 'primary' },
          { label: 'Status', value: 'Payment Confirmed', accent: 'warn' },
        ],
      },
      {
        kind: 'paragraph',
        muted: true,
        text: "A personal shopper will be assigned to your order shortly. You'll receive updates as your order progresses.",
      },
    ];
    await sendEmail({
      to: customerEmail,
      subject: `Order Confirmed — #${orderNumber}`,
      text: renderSectionsPlainText(sections),
      html: renderShell({
        preheader: `Order #${orderNumber} confirmed — ${formattedTotal}`,
        sections,
      }),
    });
  } catch (err: any) {
    console.error('[email] sendOrderConfirmationEmail error:', err?.message);
  }
}

/**
 * Send a delivery receipt email to the customer.
 */
export async function sendDeliveryReceiptEmail(
  strapi: any,
  orderId: number,
  orderNumber: string,
): Promise<void> {
  if (!isEmailReady()) return;

  try {
    const customerEmail = await _getCustomerEmail(strapi, orderId);
    if (!customerEmail) return;

    const order: any = await strapi.db.query('api::order.order').findOne({
      where: { id: orderId },
    });

    const total = order?.total ?? 0;
    const formattedTotal = `UGX ${Number(total).toLocaleString()}`;
    const receiptPdf = buildSimpleReceiptPdf(orderNumber, total);

    const sections: EmailSection[] = [
      { kind: 'greeting', text: 'Order delivered' },
      {
        kind: 'paragraph',
        text: `Your order <strong>#${escapeHtml(orderNumber)}</strong> has arrived. Enjoy your groceries!`,
      },
      {
        kind: 'summary',
        rows: [
          { label: 'Order Number', value: `#${orderNumber}` },
          { label: 'Total Paid', value: formattedTotal, accent: 'primary' },
        ],
      },
      {
        kind: 'notice',
        title: 'Receipt attached',
        body: 'A PDF receipt is attached to this email for your records.',
        tone: 'success',
      },
      {
        kind: 'paragraph',
        muted: true,
        text: 'Had any issues? Rate your experience in the LipaCart app or reply to let us know.',
      },
    ];
    await sendEmail({
      to: customerEmail,
      subject: `Order Delivered — #${orderNumber}`,
      text: renderSectionsPlainText(sections),
      html: renderShell({ preheader: `Order #${orderNumber} delivered`, sections }),
      attachments: [
        {
          filename: `receipt-${orderNumber}.pdf`,
          content: receiptPdf,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err: any) {
    console.error('[email] sendDeliveryReceiptEmail error:', err?.message);
  }
}

/**
 * Send a payment receipt email after a successful PawaPay payment.
 */
export async function sendPawaPayPaymentReceiptEmail(
  strapi: any,
  paymentId: string | number,
): Promise<void> {
  if (!isEmailReady()) return;

  try {
    const payment: any = await strapi.db.query('api::payment.payment').findOne({
      where: { id: paymentId },
      populate: {
        order: {
          populate: {
            order_items: { populate: ['product'] },
            delivery_address: true,
          },
        },
      },
    });

    const order = payment?.order;
    if (!payment || !order) return;

    const customer = await _getCustomerContact(strapi, order.id);
    if (!customer?.email) return;

    const orderNumber = String(order.order_number || order.documentId || order.id);
    const customerName = customer.name || 'Customer';
    const paymentCurrency = String(payment.currency || 'UGX');
    const subtotal = Number(order.subtotal || 0);
    const serviceFee = Number(order.service_fee || 0);
    const deliveryFee = Number(order.delivery_fee || 0);
    const total = Number(payment.amount || order.total || 0);
    const pawaPayCharge = Math.max(0, total - subtotal - serviceFee - deliveryFee);
    const paidAt = formatDateTime(payment.completed_at || new Date());
    const paidAtHuman = formatHumanDateTime(payment.completed_at || new Date());
    const orderUrl = `${FRONTEND_URL}/customer/orders`;
    const transactionId = String(payment.transaction_id || payment.documentId || payment.id);
    const shortTransactionId = truncateMiddle(transactionId);
    const deliveryAddress = [
      order.delivery_address?.address_line,
      order.delivery_address?.city,
      order.delivery_address?.landmark,
    ]
      .filter(Boolean)
      .join(', ');
    const deliverySlot = String(order.delivery_slot || 'We will share your delivery window soon.');

    const itemRows = Array.isArray(order.order_items)
      ? order.order_items
          .map((item: any) => {
            const quantity = Number(item.quantity || 0);
            const unitPrice = Number(item.actual_price || item.estimated_price || 0);
            const lineTotal = quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0;
            return {
              label: `${item.product_name || item.product?.name || 'Item'} x ${quantity || 1}`,
              name: String(item.product_name || item.product?.name || 'Item'),
              quantity: String(quantity || 1),
              unitPrice: unitPrice > 0 ? formatCurrency(unitPrice, paymentCurrency) : '-',
              subtotal: lineTotal > 0 ? formatCurrency(lineTotal, paymentCurrency) : 'Included',
              value: lineTotal > 0 ? formatCurrency(lineTotal, paymentCurrency) : 'Included',
            };
          })
          .filter((row: any) => row.label)
      : [];

    const sections: EmailSection[] = [
      { kind: 'greeting', text: `Hi ${escapeHtml(customerName)},` },
      {
        kind: 'paragraph',
        text: `Your payment for order <strong>#${escapeHtml(orderNumber)}</strong> has been received and finalized.`,
      },
      { kind: 'cta', label: 'View Order', url: orderUrl },
      {
        kind: 'summary',
        rows: [
          { label: 'Transaction ID', value: transactionId },
          { label: 'Paid On', value: paidAtHuman },
          { label: 'Amount Paid', value: formatCurrency(total, paymentCurrency), accent: 'primary' },
          { label: 'Payment Method', value: 'PawaPay' },
          { label: 'Merchant', value: 'LipaCart' },
          { label: 'Customer', value: customerName },
          { label: 'Email', value: customer.email },
        ],
      },
    ];

    if (itemRows.length > 0) {
      sections.push({
        kind: 'summary',
        rows: itemRows,
      });
    }

    sections.push({
      kind: 'summary',
      rows: [
        { label: 'Subtotal', value: formatCurrency(subtotal, paymentCurrency) },
        { label: 'Service Fee', value: formatCurrency(serviceFee, paymentCurrency) },
        { label: 'Delivery Fee', value: formatCurrency(deliveryFee, paymentCurrency) },
        ...(pawaPayCharge > 0
          ? [{ label: 'PawaPay Charge', value: formatCurrency(pawaPayCharge, paymentCurrency) }]
          : []),
        { label: 'Total Paid', value: formatCurrency(total, paymentCurrency), accent: 'primary' },
      ],
    });

    sections.push({
      kind: 'notice',
      title: 'Receipt attached',
      body: 'A payment receipt PDF is attached to this email for your records.',
      tone: 'success',
    });

    const receiptLines = [
      `Order Number: #${orderNumber}`,
      `Transaction ID: ${String(payment.transaction_id || payment.documentId || payment.id)}`,
      `Paid On: ${paidAt}`,
      `Amount Paid: ${formatCurrency(total, paymentCurrency)}`,
      'Payment Method: PawaPay',
      'Merchant: LipaCart',
      `Customer: ${customerName}`,
      `Email: ${customer.email}`,
      '',
      'Breakdown:',
      `Subtotal: ${formatCurrency(subtotal, paymentCurrency)}`,
      `Service Fee: ${formatCurrency(serviceFee, paymentCurrency)}`,
      `Delivery Fee: ${formatCurrency(deliveryFee, paymentCurrency)}`,
      ...(pawaPayCharge > 0
        ? [`PawaPay Charge: ${formatCurrency(pawaPayCharge, paymentCurrency)}`]
        : []),
      `Total Paid: ${formatCurrency(total, paymentCurrency)}`,
      ...(itemRows.length > 0 ? ['', 'Items:', ...itemRows.map((row) => `${row.label} - ${row.value}`)] : []),
    ];
    const summaryRows = [
      { label: 'Subtotal', value: formatCurrency(subtotal, paymentCurrency) },
      { label: 'Service Fee', value: formatCurrency(serviceFee, paymentCurrency) },
      { label: 'Delivery Fee', value: formatCurrency(deliveryFee, paymentCurrency) },
      ...(pawaPayCharge > 0
        ? [{ label: 'PawaPay Charge', value: formatCurrency(pawaPayCharge, paymentCurrency) }]
        : []),
      { label: 'Total Paid', value: formatCurrency(total, paymentCurrency), strong: true },
    ];
    const receiptPdf = await buildStyledPaymentReceiptPdf({
      orderNumber,
      transactionId,
      paidAtHuman,
      amountPaid: formatCurrency(total, paymentCurrency),
      customerName,
      customerEmail: customer.email,
      deliveryAddress: deliveryAddress || 'Saved in your LipaCart account',
      deliveryWindow: deliverySlot,
      itemRows: itemRows.map((row: any) => ({
        name: row.name,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        subtotal: row.subtotal,
      })),
      summaryRows,
    });

    const receiptPayload = {
      paymentId: payment.id,
      orderId: order.id,
      orderNumber,
      transactionId,
      customerName,
      customerEmail: customer.email,
      currency: paymentCurrency,
      subtotal,
      serviceFee,
      deliveryFee,
      pawaPayCharge,
      total,
      paidAt,
      items: itemRows,
    };
    console.info('[email] PawaPay receipt payload:', JSON.stringify(receiptPayload));
    console.info('[email] PawaPay receipt PDF bytes:', receiptPdf.length);

    const itemTableRows = itemRows
      .map(
        (row: any) => `
          <tr>
            <td style="padding:12px 0;border-top:1px solid ${BRAND.border};font-size:14px;color:${BRAND.ink};">
              <div style="font-weight:600;">${escapeHtml(row.name)}</div>
            </td>
            <td style="padding:12px 0;border-top:1px solid ${BRAND.border};font-size:14px;color:${BRAND.muted};text-align:center;white-space:nowrap;">${escapeHtml(row.quantity)}</td>
            <td style="padding:12px 0;border-top:1px solid ${BRAND.border};font-size:14px;color:${BRAND.ink};font-weight:600;text-align:right;white-space:nowrap;">${escapeHtml(row.value)}</td>
          </tr>`,
      )
      .join('');

    const summaryTableRows = summaryRows
      .map(
        (row) => `
          <tr>
            <td style="padding:10px 0;color:${row.strong ? BRAND.ink : BRAND.muted};font-size:${row.strong ? '15px' : '14px'};font-weight:${row.strong ? '700' : '500'};">${escapeHtml(row.label)}</td>
            <td style="padding:10px 0;color:${row.strong ? BRAND.primary : BRAND.ink};font-size:${row.strong ? '15px' : '14px'};font-weight:${row.strong ? '700' : '600'};text-align:right;">${escapeHtml(row.value)}</td>
          </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Payment Receipt</title>
  </head>
  <body style="margin:0;padding:0;background:#F8F9F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Payment successful for order #${escapeHtml(orderNumber)}.</div>
    <div style="padding:24px 12px;">
      <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(15,118,110,0.08);">
        <div style="height:8px;background:${BRAND.primary};"></div>
        <div style="padding:28px 28px 22px;text-align:center;border-bottom:1px solid ${BRAND.border};">
          <div role="img" aria-label="Payment successful" style="width:64px;height:64px;line-height:64px;margin:0 auto 16px;border-radius:50%;background:#E7F6EE;color:${BRAND.primary};font-size:34px;font-weight:700;">✓</div>
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.primary};font-weight:700;">Payment Successful</p>
          <h1 style="margin:0 0 10px;font-size:34px;line-height:1.1;color:${BRAND.primary};">${escapeHtml(formatCurrency(total, paymentCurrency))}</h1>
          <p style="margin:0;color:${BRAND.muted};font-size:15px;">Order <strong style="color:${BRAND.ink};">#${escapeHtml(orderNumber)}</strong></p>
        </div>
        <div style="padding:24px 28px 28px;">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:${BRAND.ink};">Thanks for shopping with LipaCart, ${escapeHtml(customerName)}. We have confirmed your payment and your order is moving to the next stage.</p>

          <div style="text-align:center;margin:0 0 24px;">
            <a href="${orderUrl}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 22px;background:${BRAND.primary};color:#FFFFFF;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;">View Order</a>
          </div>

          <div style="background:#FCFDFC;border:1px solid ${BRAND.border};border-radius:16px;padding:18px 18px 8px;margin:0 0 18px;">
            <h2 style="margin:0 0 14px;font-size:16px;color:${BRAND.ink};">Payment Details</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;">Amount Paid</td>
                <td style="padding:8px 0;color:${BRAND.primary};font-size:14px;font-weight:700;text-align:right;">${escapeHtml(formatCurrency(total, paymentCurrency))}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;border-top:1px solid ${BRAND.border};">Paid On</td>
                <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;border-top:1px solid ${BRAND.border};">${escapeHtml(paidAtHuman)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;border-top:1px solid ${BRAND.border};">Payment Method</td>
                <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;border-top:1px solid ${BRAND.border};">PawaPay</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;border-top:1px solid ${BRAND.border};">Transaction ID</td>
                <td style="padding:8px 0;color:${BRAND.subtle};font-size:12px;font-weight:600;text-align:right;border-top:1px solid ${BRAND.border};font-family:'SFMono-Regular',Consolas,Menlo,monospace;">${escapeHtml(shortTransactionId)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;border-top:1px solid ${BRAND.border};">Merchant</td>
                <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;border-top:1px solid ${BRAND.border};">LipaCart</td>
              </tr>
            </table>
          </div>

          <div style="background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:16px;padding:18px 18px 8px;margin:0 0 18px;">
            <h2 style="margin:0 0 14px;font-size:16px;color:${BRAND.ink};">Order Details</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 12px;">
              <thead>
                <tr>
                  <th scope="col" style="padding:0 0 8px;text-align:left;color:${BRAND.subtle};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Item</th>
                  <th scope="col" style="padding:0 0 8px;text-align:center;color:${BRAND.subtle};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
                  <th scope="col" style="padding:0 0 8px;text-align:right;color:${BRAND.subtle};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemTableRows || `<tr><td colspan="3" style="padding:12px 0;color:${BRAND.muted};font-size:14px;">Order items will appear in your order timeline shortly.</td></tr>`}
              </tbody>
            </table>
            <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${BRAND.border};padding-top:8px;">
              ${summaryTableRows}
            </table>
          </div>

          <div style="display:block;margin:0 0 18px;">
            <div style="background:#FCFDFC;border:1px solid ${BRAND.border};border-radius:16px;padding:18px 18px 8px;margin:0 0 18px;">
              <h2 style="margin:0 0 14px;font-size:16px;color:${BRAND.ink};">Delivery Details</h2>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;">Address</td>
                  <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;">${escapeHtml(deliveryAddress || 'Saved in your LipaCart account')}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;border-top:1px solid ${BRAND.border};">Delivery Window</td>
                  <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;border-top:1px solid ${BRAND.border};">${escapeHtml(deliverySlot)}</td>
                </tr>
              </table>
            </div>

            <div style="background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:16px;padding:18px 18px 8px;">
              <h2 style="margin:0 0 14px;font-size:16px;color:${BRAND.ink};">Customer Info</h2>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;">Name</td>
                  <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;">${escapeHtml(customerName)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:${BRAND.muted};font-size:14px;border-top:1px solid ${BRAND.border};">Email</td>
                  <td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;border-top:1px solid ${BRAND.border};">${escapeHtml(customer.email)}</td>
                </tr>
              </table>
            </div>
          </div>

          <div style="background:#F6FBF8;border:1px solid #D6EDE2;border-radius:16px;padding:16px 18px;margin:0 0 18px;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${BRAND.ink};">Receipt attached</p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:${BRAND.muted};">Your printable PDF receipt is attached to this email. Need help with this payment? Contact support below and include order <strong>#${escapeHtml(orderNumber)}</strong>.</p>
          </div>

          <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:${BRAND.muted};">Thanks for shopping with LipaCart, ${escapeHtml(customerName)}. We'll notify you once your order is on the way.</p>

          <div style="text-align:center;margin:0 0 8px;">
            <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.primary};text-decoration:none;font-size:14px;font-weight:700;">Need help? Contact support</a>
            <span style="display:inline-block;width:18px;"></span>
            <a href="${orderUrl}" style="color:${BRAND.primary};text-decoration:none;font-size:14px;font-weight:700;">Track delivery</a>
          </div>
        </div>
        <div style="padding:18px 28px 24px;border-top:1px solid ${BRAND.border};background:#FBFCFB;text-align:center;">
          <div style="color:${BRAND.primary};font-size:18px;font-weight:800;letter-spacing:-0.2px;margin-bottom:6px;">LipaCart</div>
          <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;">Support: <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.primary};text-decoration:none;font-weight:700;">${SUPPORT_EMAIL}</a></p>
          <p style="margin:0;color:${BRAND.subtle};font-size:11px;">You are receiving this transactional email because a payment was completed on your LipaCart account.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

    const text = [
      `Payment Successful — ${formatCurrency(total, paymentCurrency)}`,
      `Order: #${orderNumber}`,
      `Paid on: ${paidAtHuman}`,
      `Transaction ID: ${transactionId}`,
      'Payment Method: PawaPay',
      'Merchant: LipaCart',
      '',
      'Order Details',
      ...itemRows.map((row: any) => `${row.name} | Qty ${row.quantity} | ${row.value}`),
      '',
      ...summaryRows.map((row) => `${row.label}: ${row.value}`),
      '',
      'Delivery Details',
      `Address: ${deliveryAddress || 'Saved in your LipaCart account'}`,
      `Delivery Window: ${deliverySlot}`,
      '',
      'Customer Info',
      `Name: ${customerName}`,
      `Email: ${customer.email}`,
      '',
      `View Order: ${orderUrl}`,
      `Support: ${SUPPORT_EMAIL}`,
    ].join('\n');

    await sendEmail({
      to: customer.email,
      subject: `Payment Receipt — #${orderNumber}`,
      text,
      html,
      attachments: [
        {
          filename: `payment-receipt-${orderNumber}.pdf`,
          content: receiptPdf,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err: any) {
    console.error('[email] sendPawaPayPaymentReceiptEmail error:', err?.message);
  }
}

/**
 * Look up the customer's email address from an order ID.
 */
async function _getCustomerEmail(strapi: any, orderId: number): Promise<string | null> {
  const customer = await _getCustomerContact(strapi, orderId);
  return customer?.email || null;
}
