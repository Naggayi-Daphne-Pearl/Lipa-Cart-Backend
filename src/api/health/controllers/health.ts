import packageJson from '../../../../package.json';
import { getEmailDiagnostics, isEmailReady, sendEmail } from '../../../services/email';

export default {
  async check(ctx: any) {
    let database = 'error';

    try {
      // Run a lightweight query to verify the DB connection is alive
      await strapi.db.connection.raw('SELECT 1');
      database = 'connected';
    } catch {
      // database remains "error"
    }

    ctx.body = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database,
      version: packageJson.version,
    };
  },

  async testEmail(ctx: any) {
    if (process.env.NODE_ENV === 'production') {
      return ctx.forbidden('Email test endpoint is disabled in production');
    }

    const to =
      String(ctx.query?.to || ctx.request?.body?.to || '').trim() ||
      process.env.EMAIL_TEST_TO ||
      process.env.SMTP_USER ||
      '';

    const smtpConfigured =
      Boolean(process.env.SMTP_HOST) &&
      Boolean(process.env.SMTP_USER) &&
      Boolean(process.env.SMTP_PASS);
    const emailDiagnostics = getEmailDiagnostics();
    const rawPass = String(process.env.SMTP_PASS || '');
    const isGmail = String(process.env.SMTP_HOST || '').includes('gmail.com');
    const normalizedPass = isGmail ? rawPass.replace(/[^a-zA-Z0-9]/g, '') : rawPass.trim();
    const smtpEnvDiagnostics = {
      smtpHost: process.env.SMTP_HOST || null,
      smtpPort: process.env.SMTP_PORT || null,
      smtpUser: process.env.SMTP_USER || null,
      smtpFrom: process.env.SMTP_FROM || null,
      smtpPassLength: process.env.SMTP_PASS ? String(process.env.SMTP_PASS).length : 0,
      smtpPassHasWhitespace: /\s/.test(rawPass),
      smtpPassNormalizedLength: normalizedPass.length,
      smtpUsingGmailNormalization: isGmail,
    };

    if (!to) {
      return ctx.badRequest(
        'Missing recipient. Use /email/test?to=you@example.com or set EMAIL_TEST_TO in env.',
      );
    }

    if (!smtpConfigured || !isEmailReady()) {
      ctx.body = {
        success: false,
        message: 'Email service is not ready',
        diagnostics: {
          smtpHostSet: Boolean(process.env.SMTP_HOST),
          smtpUserSet: Boolean(process.env.SMTP_USER),
          smtpPassSet: Boolean(process.env.SMTP_PASS),
          smtpEnv: smtpEnvDiagnostics,
          emailServiceReady: isEmailReady(),
          emailServiceVerified: emailDiagnostics.verified,
          lastEmailError: emailDiagnostics.lastError,
          attemptedTo: to,
        },
      };
      return;
    }

    const sent = await sendEmail({
      to,
      subject: 'LipaCart Email Test',
      text: 'This is a test email from LipaCart local backend.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 8px; color: #15874B;">LipaCart Email Test</h2>
          <p style="margin: 0 0 12px; color: #333;">This is a test email from your local backend.</p>
          <p style="margin: 0; color: #666; font-size: 13px;">Sent at ${new Date().toISOString()}</p>
        </div>
      `,
      headers: {
        'X-Entity-Ref-ID': `email-test-${Date.now()}`,
      },
    });

    ctx.body = {
      success: sent,
      message: sent
        ? `Test email sent to ${to}. Check inbox and spam/junk folders.`
        : `Email send failed for ${to}. Check backend logs for SMTP error details.`,
      diagnostics: {
        smtpEnv: smtpEnvDiagnostics,
        emailServiceReady: isEmailReady(),
        emailServiceVerified: emailDiagnostics.verified,
        lastEmailError: getEmailDiagnostics().lastError,
        attemptedTo: to,
      },
    };
  },
} as any;
