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
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@lipacart.com';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://www.lipacart.com').replace(/\/+$/, '');
const PLAY_STORE_URL = process.env.PLAY_STORE_URL?.trim();
const APP_STORE_URL = process.env.APP_STORE_URL?.trim();
const INSTAGRAM_URL = process.env.INSTAGRAM_URL?.trim();
const FACEBOOK_URL = process.env.FACEBOOK_URL?.trim();
const X_URL = process.env.X_URL?.trim();

const FORGOT_PASSWORD_LOGO_SVG = `
<svg width="296" height="58" viewBox="0 0 1316 256" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M83.7253 46.3228C78.9517 46.3228 78.1901 39.4682 82.8472 38.4204L236.922 3.75352C239.423 3.19083 241.8 5.09262 241.8 7.65596V42.3228C241.8 44.532 240.01 46.3228 237.8 46.3228H83.7253Z" fill="white"/>
<path d="M82.069 158.889C77.8508 157.37 78.9407 151.125 83.4239 151.125H177.801C180.01 151.125 181.801 152.916 181.801 155.125V189.101C181.801 191.871 179.052 193.803 176.446 192.864L82.069 158.889Z" fill="white"/>
<path d="M3.65039 101.196C-1.2456 100.767 -1.20342 93.595 3.69729 93.2231L217.498 76.9961C219.819 76.8199 221.8 78.6562 221.8 80.9846V115.97C221.8 118.317 219.789 120.16 217.451 119.955L3.65039 101.196Z" fill="white"/>
<path d="M1273.6 146.865C1273.6 152.336 1275.14 156.463 1278.21 159.247C1281.28 161.934 1285.94 163.278 1292.18 163.278C1297.23 163.278 1303.36 162.3 1310.56 160.346C1313.17 159.638 1315.79 161.559 1315.79 164.259V185.601C1315.79 187.174 1314.87 188.612 1313.41 189.194C1304.01 192.937 1292.37 194.808 1278.5 194.808C1263.53 194.808 1252.39 190.873 1245.1 183.002C1237.8 175.132 1234.16 163.086 1234.16 146.865V81.0375C1234.16 78.8283 1232.37 77.0375 1230.16 77.0375H1219.15C1216.94 77.0375 1215.15 75.2466 1215.15 73.0375V62.5833C1215.15 61.188 1215.88 59.8934 1217.07 59.1674L1235.72 47.8069C1236.48 47.3429 1237.06 46.6377 1237.38 45.8033L1247.43 19.1561C1248.02 17.599 1249.51 16.5684 1251.18 16.5684H1269.6C1271.81 16.5684 1273.6 18.3592 1273.6 20.5684V43.3788C1273.6 45.5879 1275.4 47.3788 1277.6 47.3788H1310.21C1312.41 47.3788 1314.21 49.1697 1314.21 51.3788V73.0375C1314.21 75.2466 1312.41 77.0375 1310.21 77.0375H1277.6C1275.4 77.0375 1273.6 78.8283 1273.6 81.0375V146.865Z" fill="white"/>
<path d="M1200.33 44.6465C1203.87 44.6465 1207.12 44.8394 1210.08 45.2252C1212.08 45.4869 1213.46 47.317 1213.3 49.3352L1211.07 78.0151C1210.87 80.5053 1208.46 82.2171 1205.98 81.905C1203.86 81.6376 1201.54 81.5039 1199.03 81.5039C1186.36 81.5039 1176.48 84.7673 1169.38 91.2941C1162.37 97.7249 1158.87 106.795 1158.87 118.505V188.22C1158.87 190.429 1157.07 192.22 1154.87 192.22H1123.42C1121.21 192.22 1119.42 190.429 1119.42 188.22V51.382C1119.42 49.1729 1121.21 47.382 1123.42 47.382H1146.2C1148.05 47.382 1149.66 48.6563 1150.09 50.4607L1154.86 70.5878C1155.01 71.2476 1155.6 71.7136 1156.28 71.7136C1156.81 71.7136 1157.3 71.426 1157.56 70.9666C1162.12 63.0615 1168.12 56.7357 1175.57 51.9892C1183.24 47.094 1191.5 44.6465 1200.33 44.6465Z" fill="white"/>
<path d="M1088.87 188.219C1088.87 190.428 1087.08 192.219 1084.87 192.219H1063.97C1062.32 192.219 1060.83 191.203 1060.24 189.662L1053.81 173.046C1053.68 172.714 1053.36 172.494 1053 172.494C1052.74 172.494 1052.49 172.616 1052.33 172.821C1045.69 181.092 1038.92 186.838 1032 190.059C1024.99 193.227 1015.83 194.81 1004.5 194.81C990.488 194.81 979.497 190.827 971.531 182.86C963.564 174.798 959.581 163.328 959.581 148.451C959.581 133.573 964.86 122.439 975.418 115.049C986.072 107.658 1002.39 103.579 1024.37 102.811L1045.68 102.202C1047.84 102.14 1049.56 100.368 1049.56 98.2037V95.7562C1049.56 81.0708 1042.03 73.7281 1026.96 73.7281C1016.4 73.7281 1003.99 76.682 989.741 82.5897C987.762 83.4097 985.471 82.5793 984.526 80.6577L974.833 60.9524C973.877 59.0079 974.639 56.6483 976.591 55.7062C992.262 48.1404 1009.39 44.3574 1027.97 44.3574C1048.03 44.3574 1063.19 48.6766 1073.46 57.3151C1083.73 65.8576 1088.87 78.6712 1088.87 95.7562V188.219ZM1049.56 137.077V129.242C1049.56 126.988 1047.7 125.18 1045.45 125.243L1034.3 125.559C1022.69 125.943 1014.1 128.054 1008.53 131.894C1002.97 135.637 1000.18 141.396 1000.18 149.171C1000.18 160.305 1006.56 165.872 1019.33 165.872C1028.54 165.872 1035.89 163.28 1041.36 158.097C1046.83 152.818 1049.56 145.811 1049.56 137.077Z" fill="white"/>
<path d="M893.642 33.558C878.573 33.558 866.863 39.221 858.512 50.5469C850.258 61.9689 846.131 77.806 846.131 98.0584C846.131 140.291 861.968 161.407 893.642 161.407C905.788 161.407 920.13 158.701 936.668 153.29C939.29 152.433 942.017 154.363 942.017 157.122V182.495C942.017 184.11 941.048 185.573 939.543 186.159C924.716 191.926 908.168 194.809 889.899 194.809C862.352 194.809 841.283 186.458 826.694 169.757C812.105 152.96 804.81 128.965 804.81 97.7704C804.522 68.2077 812.489 44.452 828.71 26.5032C845.027 8.45849 866.671 -0.371926 893.642 0.0119974C910.954 0.0119974 928.351 3.95077 945.833 11.8283C947.748 12.6916 948.615 14.9166 947.841 16.87L937.834 42.1101C936.981 44.2607 934.486 45.2366 932.378 44.2823C916.59 37.1327 903.678 33.558 893.642 33.558Z" fill="white"/>
<path d="M769.591 188.219C769.591 190.428 767.8 192.219 765.591 192.219H744.689C743.037 192.219 741.555 191.203 740.959 189.662L734.531 173.046C734.402 172.714 734.082 172.494 733.726 172.494C733.463 172.494 733.213 172.616 733.049 172.821C726.413 181.092 719.637 186.838 712.721 190.059C705.714 193.227 696.548 194.81 685.222 194.81C671.209 194.81 660.219 190.827 652.252 182.86C644.286 174.798 640.302 163.328 640.302 148.451C640.302 133.573 645.581 122.439 656.139 115.049C666.793 107.658 683.111 103.579 705.091 102.811L726.4 102.202C728.564 102.14 730.286 100.368 730.286 98.2037V95.7562C730.286 81.0708 722.751 73.7281 707.682 73.7281C697.122 73.7281 684.715 76.682 670.462 82.5897C668.484 83.4097 666.192 82.5793 665.247 80.6577L655.554 60.9524C654.598 59.0079 655.361 56.6483 657.312 55.7062C672.983 48.1404 690.109 44.3574 708.69 44.3574C728.75 44.3574 743.916 48.6766 754.186 57.3151C764.456 65.8576 769.591 78.6712 769.591 95.7562V188.219ZM730.286 137.077V129.242C730.286 126.988 728.425 125.18 726.173 125.243L715.025 125.559C703.411 125.943 694.82 128.054 689.253 131.894C683.686 135.637 680.903 141.396 680.903 149.171C680.903 160.305 687.286 165.872 700.051 165.872C709.266 165.872 716.609 163.28 722.08 158.097C727.551 152.818 730.286 145.811 730.286 137.077Z" fill="white"/>
<path d="M531.42 197.259V252C531.42 254.21 529.629 256 527.42 256H495.971C493.762 256 491.971 254.21 491.971 252V51.382C491.971 49.1728 493.762 47.382 495.971 47.382H521.101C522.867 47.382 524.425 48.5407 524.932 50.2326L529.404 65.1392C529.575 65.7086 530.099 66.0986 530.694 66.0986C531.147 66.0986 531.57 65.8679 531.824 65.4924C541.211 51.5951 554.562 44.6465 571.877 44.6465C589.441 44.6465 603.071 51.2693 612.765 64.5149C622.459 77.6645 627.307 95.9013 627.307 119.225C627.403 142.549 622.363 161.074 612.189 174.799C602.015 188.429 588.482 195.099 571.589 194.811C554.634 194.811 541.372 188.783 531.801 176.725C531.56 176.421 531.192 176.239 530.803 176.239C530.056 176.239 529.474 176.89 529.553 177.633C530.798 189.331 531.42 195.873 531.42 197.259ZM586.994 119.081C586.994 104.684 584.786 93.9816 580.371 86.9749C575.956 79.8721 568.997 76.3208 559.495 76.3208C549.992 76.3208 542.986 79.3442 538.475 85.3912C533.963 91.4381 531.612 101.324 531.42 115.05V119.225C531.42 134.678 533.723 145.812 538.331 152.627C542.938 159.442 550.28 162.849 560.359 162.849C578.115 162.849 586.994 148.26 586.994 119.081Z" fill="white"/>
<path d="M466.491 47.3803C468.7 47.3803 470.491 49.1712 470.491 51.3803V188.218C470.491 190.427 468.7 192.218 466.491 192.218H435.042C432.833 192.218 431.042 190.427 431.042 188.218V51.3803C431.042 49.1712 432.833 47.3803 435.042 47.3803H466.491ZM450.911 38.8853C436.513 38.8853 429.314 32.4544 429.314 19.5928C429.314 6.63509 436.465 0.15625 450.767 0.15625C465.164 0.15625 472.363 6.58709 472.363 19.4488C472.363 25.6877 470.539 30.4868 466.892 33.8462C463.244 37.2056 457.917 38.8853 450.911 38.8853Z" fill="white"/>
<path d="M411.216 188.222C411.216 190.431 409.425 192.222 407.216 192.222H298.309C296.1 192.222 294.309 190.431 294.309 188.222V6.75196C294.309 4.54282 296.1 2.75195 298.309 2.75195H330.478C332.687 2.75195 334.478 4.54281 334.478 6.75195V155.108C334.478 157.317 336.269 159.108 338.478 159.108H407.216C409.425 159.108 411.216 160.899 411.216 163.108V188.222Z" fill="white"/>
</svg>`;

interface ForgotPasswordEmailOptions {
  name?: string | null;
  resetUrl?: string | null;
}

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

function renderStoreLinks(): string {
  if (!PLAY_STORE_URL && !APP_STORE_URL) return '';

  const playLink = PLAY_STORE_URL
    ? `<a href="${PLAY_STORE_URL}" style="display: inline-block; margin: 0 6px 8px; padding: 10px 14px; border-radius: 999px; border: 1px solid #D4E9D9; color: #1B4332; font-size: 12px; font-weight: 700; text-decoration: none;">Google Play</a>`
    : '';
  const appLink = APP_STORE_URL
    ? `<a href="${APP_STORE_URL}" style="display: inline-block; margin: 0 6px 8px; padding: 10px 14px; border-radius: 999px; border: 1px solid #D4E9D9; color: #1B4332; font-size: 12px; font-weight: 700; text-decoration: none;">App Store</a>`
    : '';

  return `
    <div style="margin-top: 28px; text-align: center;">
      <p style="margin: 0 0 12px; color: #567164; font-size: 12px;">Take LipaCart with you</p>
      ${playLink}${appLink}
    </div>`;
}

function renderSocialLinks(): string {
  const links = [
    INSTAGRAM_URL
      ? `<a href="${INSTAGRAM_URL}" style="display: inline-block; margin: 0 6px; color: #1B4332; text-decoration: none; font-size: 12px; font-weight: 700;">Instagram</a>`
      : '',
    FACEBOOK_URL
      ? `<a href="${FACEBOOK_URL}" style="display: inline-block; margin: 0 6px; color: #1B4332; text-decoration: none; font-size: 12px; font-weight: 700;">Facebook</a>`
      : '',
    X_URL
      ? `<a href="${X_URL}" style="display: inline-block; margin: 0 6px; color: #1B4332; text-decoration: none; font-size: 12px; font-weight: 700;">X</a>`
      : '',
  ].filter(Boolean);

  if (links.length === 0) return '';

  return `
    <div style="margin-top: 20px; text-align: center;">
      <p style="margin: 0 0 10px; color: #567164; font-size: 12px;">Follow LipaCart</p>
      ${links.join('')}
    </div>`;
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

export async function sendForgotPasswordOtpEmail(
  to: string,
  otp: string,
  options: ForgotPasswordEmailOptions = {},
): Promise<boolean> {
  const greetingName = options.name?.trim() ? escapeHtml(options.name.trim().split(' ')[0]) : '';
  const greeting = greetingName ? `Hi ${greetingName},` : 'Hi there,';
  const resetUrl = buildResetUrl(to, otp, options.resetUrl);

  return sendEmail({
    to,
    subject: 'Reset your LipaCart password',
    replyTo: SUPPORT_EMAIL,
    text:
      `Let's get you back into your LipaCart account. ` +
      `Use this verification code: ${otp}. ` +
      `You can also continue here: ${resetUrl}. ` +
      `This code expires in 5 minutes. If you didn't request this, ignore this email or contact ${SUPPORT_EMAIL}.`,
    html: `
      <div style="margin: 0; padding: 24px 0; background: #F4F8F1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1F2937;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 22px; overflow: hidden; box-shadow: 0 18px 45px rgba(27, 67, 50, 0.10);">
          <div style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 55%, #1B5E20 100%); padding: 30px 24px 22px; text-align: center; position: relative;">
            <div style="margin-bottom: 14px; opacity: 0.18; font-size: 13px; letter-spacing: 3px; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-transform: uppercase;">
              fresh picks • baskets • produce • doorstep delivery • fresh picks • baskets • produce
            </div>
            <img src="cid:lipacart-forgot-password-logo" alt="LipaCart" style="display: block; margin: 0 auto; width: 220px; max-width: 70%; height: auto;" />
            <p style="margin: 14px 0 0; color: rgba(255, 255, 255, 0.92); font-size: 14px; font-weight: 600; letter-spacing: 0.3px;">Password Reset Request</p>
            <p style="margin: 8px auto 0; max-width: 360px; color: rgba(255, 255, 255, 0.84); font-size: 13px; line-height: 1.6;">
              Fresh groceries, delivered fast. Let's get you back to your basket.
            </p>
            <div style="margin: 18px auto 0; max-width: 360px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
              <span style="display: inline-block; padding: 7px 13px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); color: #FFFFFF; font-size: 12px; font-weight: 600;">Fresh produce</span>
              <span style="display: inline-block; padding: 7px 13px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); color: #FFFFFF; font-size: 12px; font-weight: 600;">Easy reorders</span>
              <span style="display: inline-block; padding: 7px 13px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); color: #FFFFFF; font-size: 12px; font-weight: 600;">Trusted delivery</span>
            </div>
          </div>

          <div style="padding: 32px 28px 36px;">
            <p style="margin: 0 0 10px; color: #203A2F; font-size: 16px; font-weight: 600;">${greeting}</p>
            <p style="margin: 0 0 14px; color: #41584D; font-size: 15px; line-height: 1.7;">
              We received a request to reset your password. No worries, just use the button or the code below to get back to your groceries.
            </p>
            <p style="margin: 0 0 28px; color: #6A7F74; font-size: 13px; line-height: 1.6;">
              Using a different device? Simply enter the code below manually to verify your identity.
            </p>

            <div style="text-align: center; margin: 0 0 28px;">
              <a href="${resetUrl}" style="display: inline-block; padding: 14px 26px; background: #F89227; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 999px; box-shadow: 0 12px 24px rgba(248, 146, 39, 0.24);">
                Verify Now
              </a>
            </div>

            <div style="background: linear-gradient(180deg, #FFFDF8 0%, #F7F3EA 100%); border: 2px dashed #7BC67E; border-radius: 18px; padding: 24px 20px; text-align: center; margin: 0 0 28px; box-shadow: 0 10px 24px rgba(62, 104, 71, 0.10);">
              <p style="margin: 0 0 12px; color: #708176; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.8px;">Your verification code</p>
              <div style="background: #FFFFFF; border: 1px solid #E6EFE6; border-radius: 14px; padding: 16px 12px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);">
                <span style="display: inline-block; font-size: 38px; line-height: 1; font-weight: 800; letter-spacing: 7px; color: #111827; font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">${otp}</span>
              </div>
              <p style="margin: 12px 0 0; color: #6C7A74; font-size: 12px;">Valid for <strong>5 minutes</strong></p>
            </div>

            <div style="margin: 0 0 24px; padding: 16px 18px; border-radius: 14px; background: #F8FBF7; border: 1px solid #E1EFE3;">
              <p style="margin: 0 0 6px; color: #203A2F; font-size: 14px; font-weight: 700;">Didn't request this?</p>
              <p style="margin: 0; color: #556B60; font-size: 13px; line-height: 1.6;">
                If you didn't make this request, you can safely ignore this email. Your account is still secure.
              </p>
            </div>

            <div style="margin: 0 0 24px; padding: 14px 16px; border-radius: 14px; background: #FFF7E3; border: 1px solid #FFD78E;">
              <p style="margin: 0; color: #8A4B00; font-size: 13px; line-height: 1.6;">
                <strong style="display: inline-block; margin-right: 4px;">🛡 Security Tip</strong>
                Never share this code with anyone. LipaCart support will never ask for your verification code.
              </p>
            </div>

            ${renderStoreLinks()}
            ${renderSocialLinks()}

            <div style="margin-top: 28px; padding-top: 22px; border-top: 1px solid #E8EFE9; text-align: center;">
              <p style="margin: 0 0 6px; color: #93A39A; font-size: 11px;">
                © ${new Date().getFullYear()} LipaCart. Fresh groceries, delivered with care.
              </p>
              <p style="margin: 0 0 10px; color: #BAC5BF; font-size: 10px; line-height: 1.5;">
                This is an automated message. Please do not reply directly to this email.
              </p>
              <p style="margin: 0; color: #6B7A73; font-size: 11px;">Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color: #2E7D32; text-decoration: none; font-weight: 600;">${SUPPORT_EMAIL}</a></p>
            </div>
          </div>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'lipacart-forgot-password-logo.svg',
        content: FORGOT_PASSWORD_LOGO_SVG,
        contentType: 'image/svg+xml',
        cid: 'lipacart-forgot-password-logo',
      },
    ],
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
