import type { Core } from '@strapi/strapi';
import { sendOtpSms, isSmsReady } from '../../../services/sms';
import { sendOtpEmail, sendForgotPasswordOtpEmail, isEmailReady } from '../../../services/email';

interface ForgotPasswordTemplateData {
  name?: string | null;
  resetUrl?: string | null;
}

interface OtpEntry {
  otp: string;
  expiresAt: string; // ISO string — survives JSON serialisation in strapi.store
  createdAt: string;
  [key: string]: any;
}

const OTP_STORE_TYPE = 'plugin' as const;
const OTP_STORE_NAME = 'lipa-cart-otp';

function storeKey(channelKey: string): string {
  // Prefix to avoid collisions with other plugin store entries
  return `otp:${channelKey}`;
}

/**
 * OTP Service — DB-backed OTP storage and validation.
 * Uses strapi.store (backed by strapi_core_store_settings table) so OTPs
 * survive process restarts and work correctly in multi-instance deployments.
 * Stores OTPs with 5-minute expiry.
 * Sends via Africa's Talking SMS when configured, falls back to email, then
 * console (dev/demo only — never in production).
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  _store() {
    return strapi.store({ type: OTP_STORE_TYPE, name: OTP_STORE_NAME });
  },

  /**
   * Generate and persist OTP for a channel key (phone or email).
   *
   * Delivery priority:
   *   1. SMS via Africa's Talking (if configured)
   *   2. Email (if an email address is provided and SMTP is configured)
   *   3. Console log (dev / demo fallback — disabled in production)
   *
   * Returns `{ otp, deliveredVia }` so the caller can tell the user
   * where to look for the code.
   */
  async generateOtp(
    channelKey: string,
    email?: string | null,
    template: 'login' | 'forgot-password' = 'login',
    templateData?: ForgotPasswordTemplateData,
  ): Promise<{ otp: string; deliveredVia: 'sms' | 'email' | 'console' }> {
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    const createdAt = new Date();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const entry: OtpEntry = {
      otp,
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
    };

    await this._store().set({ key: storeKey(channelKey), value: entry });

    const canSendSms = /^\+256\d{9}$/.test(channelKey);

    // 1. Try SMS
    if (canSendSms && isSmsReady()) {
      const sent = await sendOtpSms(channelKey, otp);
      if (sent) return { otp, deliveredVia: 'sms' };
      console.warn(`[otp] SMS failed for ${channelKey}, trying email fallback`);
    }

    // 2. Try email
    if (email && isEmailReady()) {
      const sent =
        template === 'forgot-password'
          ? await sendForgotPasswordOtpEmail(email, otp, templateData)
          : await sendOtpEmail(email, otp);
      if (sent) return { otp, deliveredVia: 'email' };
      console.warn(`[otp] Email also failed for ${channelKey}`);
    }

    // 3. Console fallback — dev/demo only
    if (process.env.NODE_ENV === 'production') {
      console.error(`[otp] All delivery channels failed for ${channelKey} in production`);
      throw new Error('OTP delivery failed — please try again later');
    }
    console.log(`[otp] Demo mode — OTP for ${channelKey}: ${otp}`);
    return { otp, deliveredVia: 'console' };
  },

  /**
   * Verify OTP for a channel key.
   * Returns true if valid and not expired, false otherwise.
   * Deletes OTP on successful verification (single-use).
   */
  async verifyOtp(channelKey: string, otp: string): Promise<boolean> {
    const entry = (await this._store().get({ key: storeKey(channelKey) })) as OtpEntry | null;

    if (!entry) return false;

    const now = new Date();
    if (now > new Date(entry.expiresAt)) {
      await this._store().delete({ key: storeKey(channelKey) });
      return false;
    }

    if (entry.otp !== otp) return false;

    await this._store().delete({ key: storeKey(channelKey) });
    return true;
  },

  /**
   * Get OTP entry without verifying or consuming it.
   * Used for rate-limit checks and expiry inspection.
   * Returns null if missing or expired (and cleans up on expiry).
   */
  async getOtp(channelKey: string): Promise<OtpEntry | null> {
    const entry = (await this._store().get({ key: storeKey(channelKey) })) as OtpEntry | null;
    if (!entry) return null;

    const now = new Date();
    if (now > new Date(entry.expiresAt)) {
      await this._store().delete({ key: storeKey(channelKey) });
      return null;
    }

    return entry;
  },

  /**
   * Explicitly clear an OTP entry (e.g. after successful password reset).
   */
  async clearOtp(channelKey: string): Promise<void> {
    await this._store().delete({ key: storeKey(channelKey) });
  },

  /**
   * No-op kept for interface compatibility — DB store has no in-process
   * cache to clean; expired entries are lazily evicted on access.
   */
  cleanupExpiredOtps(): void {
    // No-op: DB-backed store entries are evicted lazily in getOtp/verifyOtp
  },
});
