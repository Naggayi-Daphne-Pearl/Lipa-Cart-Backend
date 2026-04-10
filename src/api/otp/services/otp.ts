import type { Core } from '@strapi/strapi';
import { sendOtpSms, isSmsReady } from '../../../services/sms';
import { sendEmail, isEmailReady } from '../../../services/email';

interface OtpEntry {
  otp: string;
  expiresAt: Date;
}

/**
 * OTP Service - In-memory OTP storage and validation
 * Stores OTPs with 5-minute expiry.
 * Sends via Africa's Talking SMS when configured, falls back to console logging.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  // In-memory store: Map<phone, { otp, expiresAt }>
  otpStore: new Map<string, OtpEntry>(),

  /**
   * Generate and store OTP for a phone number.
   *
   * Delivery priority:
   *   1. SMS via Africa's Talking (if configured)
   *   2. Email (if an email address is provided and SMTP is configured)
   *   3. Console log (demo / local dev fallback)
   *
   * Returns `{ otp, deliveredVia }` so the caller can tell the user
   * where to look for the code.
   */
  async generateOtp(
    phone: string,
    email?: string | null,
  ): Promise<{ otp: string; deliveredVia: 'sms' | 'email' | 'console' }> {
    // Generate 6-digit random OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Set 5-minute expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Store in memory
    this.otpStore.set(phone, { otp, expiresAt });

    // 1. Try SMS
    if (isSmsReady()) {
      const sent = await sendOtpSms(phone, otp);
      if (sent) return { otp, deliveredVia: 'sms' };
      console.warn(`[otp] SMS failed for ${phone}, trying email fallback`);
    }

    // 2. Try email
    if (email && isEmailReady()) {
      const sent = await sendEmail(
        email,
        'Your LipaCart verification code',
        `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #15874B; font-size: 24px; margin: 0 0 8px;">LipaCart</h1>
          <p style="color: #6B6660; margin: 0 0 24px;">Your verification code</p>
          <div style="background: #F5F2ED; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2D2D2D;">${otp}</span>
          </div>
          <p style="color: #6B6660; font-size: 14px; margin: 0;">This code expires in <strong>5 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #EDE9E3; margin: 24px 0;" />
          <p style="color: #8F8A82; font-size: 12px; text-align: center;">LipaCart — Fresh groceries delivered across East Africa</p>
        </div>
        `,
      );
      if (sent) return { otp, deliveredVia: 'email' };
      console.warn(`[otp] Email also failed for ${phone}`);
    }

    // 3. Console fallback (demo mode)
    console.log(`[otp] Demo mode — OTP for ${phone}: ${otp}`);
    return { otp, deliveredVia: 'console' };
  },

  /**
   * Verify OTP for phone number
   * Returns true if valid and not expired, false otherwise
   * Deletes OTP after verification (single-use)
   */
  verifyOtp(phone: string, otp: string): boolean {
    const entry = this.otpStore.get(phone);

    if (!entry) {
      return false;
    }

    const now = new Date();
    if (now > entry.expiresAt) {
      this.otpStore.delete(phone);
      return false;
    }

    if (entry.otp !== otp) {
      return false;
    }

    // Valid OTP - delete it (single-use)
    this.otpStore.delete(phone);
    return true;
  },

  /**
   * Clear expired OTPs (can be called periodically)
   */
  cleanupExpiredOtps(): void {
    const now = new Date();
    let removed = 0;

    this.otpStore.forEach((entry, phone) => {
      if (now > entry.expiresAt) {
        this.otpStore.delete(phone);
        removed++;
      }
    });

    if (removed > 0) {
      // Expired OTP entries cleaned up
    }
  },
});
