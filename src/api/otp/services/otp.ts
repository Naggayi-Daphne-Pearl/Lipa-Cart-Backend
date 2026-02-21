import type { Core } from '@strapi/strapi';

interface OtpEntry {
  otp: string;
  expiresAt: Date;
}

/**
 * OTP Service - In-memory OTP storage and validation
 * Stores OTPs with 5-minute expiry
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  // In-memory store: Map<phone, { otp, expiresAt }>
  otpStore: new Map<string, OtpEntry>(),

  /**
   * Generate and store OTP for phone number
   * Returns the generated OTP (for logging/testing)
   */
  generateOtp(phone: string): string {
    // Generate 6-digit random OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Set 5-minute expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Store in memory
    this.otpStore.set(phone, { otp, expiresAt });

    // Log OTP to console (mock SMS)
    console.log(`\n🔐 OTP for ${phone}: ${otp}`);
    console.log(`⏰ Expires at: ${expiresAt.toLocaleTimeString()}\n`);

    return otp;
  },

  /**
   * Verify OTP for phone number
   * Returns true if valid and not expired, false otherwise
   * Deletes OTP after verification (single-use)
   */
  verifyOtp(phone: string, otp: string): boolean {
    const entry = this.otpStore.get(phone);

    if (!entry) {
      console.log(`❌ No OTP found for ${phone}`);
      return false;
    }

    const now = new Date();
    if (now > entry.expiresAt) {
      console.log(`❌ OTP expired for ${phone}`);
      this.otpStore.delete(phone);
      return false;
    }

    if (entry.otp !== otp) {
      console.log(`❌ Invalid OTP for ${phone}`);
      return false;
    }

    // Valid OTP - delete it (single-use)
    this.otpStore.delete(phone);
    console.log(`✅ OTP verified for ${phone}`);
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
      console.log(`🧹 Cleaned up ${removed} expired OTP entries`);
    }
  },
});
