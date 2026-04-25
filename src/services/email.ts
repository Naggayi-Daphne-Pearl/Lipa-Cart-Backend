import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import sgMail from '@sendgrid/mail';

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

  let y = 780;
  const commands = ['BT', '/F1 12 Tf'];
  for (const line of lines) {
    commands.push(`50 ${y} Td (${escapePdfText(line)}) Tj`);
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
 * Look up the customer's email address from an order ID.
 */
async function _getCustomerEmail(strapi: any, orderId: number): Promise<string | null> {
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

    return user?.email || null;
  } catch {
    return null;
  }
}
