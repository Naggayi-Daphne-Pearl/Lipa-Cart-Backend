/**
 * Delivery Code Service
 * Handles generation, validation, and verification of 4-digit codes for order delivery confirmation.
 */

import crypto from 'crypto';

/**
 * Generate a random 4-digit delivery code.
 * Returns a string like "1234", "0821", etc.
 */
export function generateDeliveryCode(): string {
  const num = crypto.randomInt(0, 10000);
  return String(num).padStart(4, '0');
}

/**
 * Validate a user-entered code against the order's stored code.
 * Returns { valid: boolean, error?: string }
 */
export function validateDeliveryCode(
  order: any,
  userEnteredCode: string,
): { valid: boolean; error?: string } {
  if (!order) {
    return { valid: false, error: 'Order not found' };
  }

  if (!order.delivery_code) {
    return { valid: false, error: 'No delivery code assigned to this order' };
  }

  // Normalize input
  const storedCode = String(order.delivery_code).trim();
  const enteredCode = String(userEnteredCode || '').trim();

  if (enteredCode.length !== 4 || !/^\d{4}$/.test(enteredCode)) {
    return { valid: false, error: 'Code must be exactly 4 digits' };
  }

  if (storedCode === enteredCode) {
    return { valid: true };
  }

  return { valid: false, error: 'Incorrect code. Please try again.' };
}

/**
 * Check if the order has exceeded the attempt limit (3 attempts).
 * Returns { locked: boolean, remainingAttempts: number }
 */
export function checkCodeAttemptStatus(order: any): {
  locked: boolean;
  remainingAttempts: number;
} {
  const attempts = Number(order?.delivery_code_attempts ?? 0);
  const maxAttempts = 3;
  const remaining = Math.max(0, maxAttempts - attempts);

  return {
    locked: attempts >= maxAttempts,
    remainingAttempts: remaining,
  };
}

/**
 * Record a code entry attempt (called before validation on each try).
 * Returns { locked: boolean, remainingAttempts: number }
 */
export async function recordCodeAttempt(
  strapi: any,
  orderId: string | number,
): Promise<{ locked: boolean; remainingAttempts: number }> {
  const order: any = await strapi.db.query('api::order.order').findOne({ where: { id: orderId } });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const currentAttempts = Number(order.delivery_code_attempts ?? 0);
  const maxAttempts = 3;

  if (currentAttempts >= maxAttempts) {
    return { locked: true, remainingAttempts: 0 };
  }

  const newAttemptCount = currentAttempts + 1;
  const firstAttemptAt = order.delivery_code_first_attempt_at || new Date().toISOString();

  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      delivery_code_attempts: newAttemptCount,
      delivery_code_first_attempt_at: firstAttemptAt,
    },
  });

  return {
    locked: newAttemptCount >= maxAttempts,
    remainingAttempts: Math.max(0, maxAttempts - newAttemptCount),
  };
}

/**
 * Mark a delivery code as verified and invalidate it.
 * Records evidence: timestamp, GPS, optional photo.
 */
export async function verifyDeliveryCode(
  strapi: any,
  orderId: string | number,
  evidence?: {
    gps_lat?: number;
    gps_lng?: number;
    photo_url?: string;
  },
): Promise<void> {
  const now = new Date();
  const verifiedAt = now.toISOString();

  const evidencePayload = {
    verified_at: verifiedAt,
    gps_lat: evidence?.gps_lat,
    gps_lng: evidence?.gps_lng,
    photo_url: evidence?.photo_url,
  };

  // Remove nul values
  Object.keys(evidencePayload).forEach(
    (key) => (evidencePayload as any)[key] === undefined && delete (evidencePayload as any)[key],
  );

  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      delivery_code_verified_at: verifiedAt,
      code_verification_evidence: evidencePayload,
      // Note: code itself is not cleared; can be kept for audit trail
    },
  });
}

/**
 * Invalidate a delivery code (called on order cancellation or timeout).
 */
export async function invalidateDeliveryCode(strapi: any, orderId: string | number): Promise<void> {
  await strapi.entityService.update('api::order.order', orderId, {
    data: {
      delivery_code: null,
      delivery_code_attempts: 0,
      delivery_code_first_attempt_at: null,
    },
  });
}

/**
 * Resend code should be called when customer or rider requests resend.
 * Placeholder for SMS/push integration.
 * In MVP, just records the action in audit trail.
 */
export async function resendDeliveryCode(
  strapi: any,
  orderId: string | number,
  method: 'sms' | 'push' | 'whatsapp',
): Promise<{ success: boolean; message: string }> {
  const order: any = await strapi.db.query('api::order.order').findOne({
    where: { id: orderId },
    populate: ['customer'],
  });

  if (!order) {
    return { success: false, message: 'Order not found' };
  }

  if (!order.delivery_code) {
    return { success: false, message: 'No delivery code to resend' };
  }

  // TODO: Integrate SMS/push providers here
  // For now, just log the action
  strapi.log.info(
    `[DELIVERY_CODE] Resend code via ${method} for order ${orderId}: ${order.delivery_code}`,
  );

  // In future, would call:
  // - Twilio for SMS
  // - Firebase for push
  // - WhatsApp business API

  return {
    success: true,
    message: `Code resent via ${method}`,
  };
}

/**
 * Forward code to third party (gift scenario).
 * Logs audit trail and placeholder for SMS/WhatsApp integration.
 */
export async function forwardDeliveryCode(
  strapi: any,
  orderId: string | number,
  recipientPhone: string,
): Promise<{ success: boolean; message: string }> {
  const order: any = await strapi.db.query('api::order.order').findOne({ where: { id: orderId } });

  if (!order) {
    return { success: false, message: 'Order not found' };
  }

  if (!order.delivery_code) {
    return { success: false, message: 'No delivery code to forward' };
  }

  // TODO: Audit trail — log who forwarded the code and to whom
  strapi.log.info(`[DELIVERY_CODE] Code forwarded for order ${orderId} to ${recipientPhone}`);

  // TODO: Send via SMS/WhatsApp

  return {
    success: true,
    message: `Code forwarded to ${recipientPhone}`,
  };
}
