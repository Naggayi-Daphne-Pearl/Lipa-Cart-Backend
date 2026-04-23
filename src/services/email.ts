import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

let transporter: nodemailer.Transporter | null = null;
let lastEmailError: string | null = null;
let transporterVerified = false;

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

/**
 * Initialize the Nodemailer transporter.
 * Call once at server startup. Skips gracefully if not configured.
 */
export function initEmail(): boolean {
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

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
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
  return transporter !== null;
}

export function getEmailDiagnostics() {
  return {
    configured: isEmailReady(),
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
  if (!transporter) return false;

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

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: payload.to,
      replyTo: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
      text: payload.text || toPlainText(payload.html),
      headers: payload.headers,
      attachments: payload.attachments,
    });
    lastEmailError = null;
    return true;
  } catch (err: any) {
    lastEmailError = err?.message || 'Email send failed';
    console.error(`[email] Failed to send to ${payload.to}:`, err?.message);
    return false;
  }
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
  return sendEmail({
    to,
    subject: 'Your LipaCart verification code',
    text: `Your LipaCart OTP is ${otp}. It expires in 5 minutes. Do not share this code.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #15874B; font-size: 24px; margin: 0 0 8px;">LipaCart</h1>
        <p style="color: #6B6660; margin: 0 0 24px;">Your verification code</p>
        <div style="background: #F5F2ED; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2D2D2D;">${otp}</span>
        </div>
        <p style="color: #6B6660; font-size: 14px; margin: 0;">This code expires in <strong>5 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    headers: {
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': `otp-${Date.now()}`,
    },
  });
}

export async function sendForgotPasswordOtpEmail(to: string, otp: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'Reset your LipaCart password',
    replyTo: 'support@lipacart.com',
    text: `We received a request to reset your LipaCart password. Your verification code is: ${otp}. This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 0; background: #FFFFFF;">
        <!-- Header with gradient -->
        <div style="background: linear-gradient(135deg, #15874B 0%, #0F6238 100%); padding: 40px 24px; text-align: center;">
          <h1 style="color: #FFFFFF; font-size: 28px; margin: 0; font-weight: 700;">LipaCart</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Password Reset Request</p>
        </div>

        <!-- Content -->
        <div style="padding: 32px 24px;">
          <p style="color: #2D2D2D; font-size: 14px; margin: 0 0 8px 0;">Hi,</p>
          <p style="color: #5A5A5A; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">We received a request to reset the password for your LipaCart account. Use the verification code below to proceed with resetting your password.</p>

          <!-- OTP Box with border -->
          <div style="background: #F5F2ED; border: 2px solid #15874B; border-radius: 8px; padding: 24px; text-align: center; margin: 32px 0;">
            <p style="color: #6B6660; font-size: 12px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Your verification code</p>
            <div style="background: #FFFFFF; border-radius: 6px; padding: 16px; margin-bottom: 12px;">
              <span style="font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #15874B; font-family: 'Courier New', monospace;">${otp}</span>
            </div>
            <p style="color: #6B6660; font-size: 12px; margin: 0;">Expires in <strong>5 minutes</strong></p>
          </div>

          <p style="color: #5A5A5A; font-size: 14px; line-height: 1.6; margin: 24px 0;">
            <strong style="color: #2D2D2D;">Didn't request this?</strong><br>
            If you didn't ask to reset your password, you can safely ignore this email. Your account remains secure.
          </p>

          <!-- Security notice -->
          <div style="background: #FFF9E6; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 24px 0; border-radius: 4px;">
            <p style="color: #92400E; font-size: 12px; margin: 0; line-height: 1.5;">
              <strong>🔒 Security tip:</strong> Never share your verification code with anyone. LipaCart staff will never ask for it.
            </p>
          </div>

          <!-- Support section -->
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;">
          <div style="text-align: center;">
            <p style="color: #6B6660; font-size: 12px; margin: 0 0 8px 0;">Need help? We're here to assist.</p>
            <a href="mailto:support@lipacart.com" style="color: #15874B; text-decoration: none; font-size: 12px; font-weight: 600;">support@lipacart.com</a>
          </div>

          <!-- Footer -->
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #E5E7EB; text-align: center;">
            <p style="color: #9CA3AF; font-size: 11px; margin: 0 0 8px 0;">
              © ${new Date().getFullYear()} LipaCart. Delivering groceries, delivering happiness.
            </p>
            <p style="color: #D1D5DB; font-size: 10px; margin: 0;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `,
    headers: {
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': `forgot-pw-${Date.now()}`,
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

    await sendEmail({
      to: customerEmail,
      subject: `Order Update — #${orderNumber}`,
      text: `Your order #${orderNumber} status is now: ${statusLabel}.`,
      html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #15874B; font-size: 24px; margin: 0 0 8px;">LipaCart</h1>
        <p style="color: #6B6660; margin: 0 0 24px;">Order update for <strong>#${orderNumber}</strong></p>
        <div style="background: #F5F2ED; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="color: #2D2D2D; margin: 0;">Current status: <strong>${statusLabel}</strong></p>
        </div>
        <p style="color: #6B6660; font-size: 14px;">You can track this order in the LipaCart app.</p>
      </div>
      `,
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

    await sendEmail(
      customerEmail,
      `Order Confirmed — #${orderNumber}`,
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #15874B; font-size: 24px; margin: 0;">LipaCart</h1>
          <p style="color: #6B6660; margin: 4px 0 0;">Fresh groceries delivered to your doorstep</p>
        </div>
        <div style="background: #F5F2ED; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #2D2D2D; font-size: 20px; margin: 0 0 8px;">Order Confirmed!</h2>
          <p style="color: #6B6660; margin: 0;">Your order <strong>#${orderNumber}</strong> has been placed successfully.</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Order Number</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #2D2D2D;">#${orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Total</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #15874B;">${formattedTotal}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Status</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #EA7702;">Payment Confirmed</td>
          </tr>
        </table>
        <p style="color: #6B6660; font-size: 14px;">A personal shopper will be assigned to your order shortly. You'll receive updates as your order progresses.</p>
        <hr style="border: none; border-top: 1px solid #EDE9E3; margin: 20px 0;" />
        <p style="color: #8F8A82; font-size: 12px; text-align: center;">LipaCart — Delivering fresh groceries across East Africa</p>
      </div>
      `,
    );
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

    await sendEmail({
      to: customerEmail,
      subject: `Order Delivered — #${orderNumber}`,
      text: `Your order #${orderNumber} has been delivered. Total paid: ${formattedTotal}. Your receipt is attached as PDF.`,
      html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #15874B; font-size: 24px; margin: 0;">LipaCart</h1>
          <p style="color: #6B6660; margin: 4px 0 0;">Fresh groceries delivered to your doorstep</p>
        </div>
        <div style="background: #E3F5EC; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #15874B; font-size: 20px; margin: 0 0 8px;">Order Delivered!</h2>
          <p style="color: #2D2D2D; margin: 0;">Your order <strong>#${orderNumber}</strong> has been delivered. Enjoy your groceries!</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Order Number</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #2D2D2D;">#${orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Total Paid</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #15874B;">${formattedTotal}</td>
          </tr>
        </table>
        <p style="color: #6B6660; font-size: 14px;">If you have any issues with your order, please contact us in the app. Don't forget to rate your experience!</p>
        <hr style="border: none; border-top: 1px solid #EDE9E3; margin: 20px 0;" />
        <p style="color: #8F8A82; font-size: 12px; text-align: center;">LipaCart — Delivering fresh groceries across East Africa</p>
      </div>
      `,
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
