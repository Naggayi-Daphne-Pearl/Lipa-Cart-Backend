/**
 * Delivery Code Service
 * Handles generation, validation, and verification of 4-digit codes for order delivery confirmation.
 */

import crypto from 'crypto';
import { sendPush, saveNotification } from './notification';
import { sendSms } from './sms';

function normalizePhoneForSms(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const raw = phone.trim();
  if (!raw) return null;

  const digitsOnly = raw.replace(/\D/g, '');
  if (!digitsOnly) return null;

  if (raw.startsWith('+') && /^\+\d{10,15}$/.test(raw)) {
    return raw;
  }

  if (/^256\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  if (/^254\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  if (/^0\d{9}$/.test(digitsOnly)) {
    return `+256${digitsOnly.slice(1)}`;
  }

  return null;
}

function buildDeliveryCodeSmsMessage(orderNumber: string, deliveryCode: string): string {
  return `LipaCart delivery code for order #${orderNumber}: ${deliveryCode}. Share it with your rider only at handoff.`;
}

async function loadOrderWithCustomer(strapi: any, orderId: string | number): Promise<any> {
  const orderRef = String(orderId);
  const numericId = Number(orderRef);

  if (Number.isFinite(numericId) && String(numericId) === orderRef) {
    const byId = await strapi.db.query('api::order.order').findOne({
      where: { id: numericId },
      populate: ['customer'],
    });
    if (byId) return byId;
  }

  return strapi.db.query('api::order.order').findOne({
    where: { documentId: orderRef },
    populate: ['customer'],
  });
}

async function ensureDeliveryCode(strapi: any, order: any): Promise<{ code: string; order: any }> {
  if (order?.delivery_code) {
    return { code: String(order.delivery_code), order };
  }

  const generatedCode = generateDeliveryCode();
  await strapi.entityService.update('api::order.order', order.id, {
    data: {
      delivery_code: generatedCode,
      delivery_code_attempts: 0,
      delivery_code_first_attempt_at: null,
    },
  });

  const refreshedOrder = await loadOrderWithCustomer(strapi, order.id);
  return {
    code: generatedCode,
    order: refreshedOrder ?? { ...order, delivery_code: generatedCode },
  };
}

async function sendCodeToPhone(
  phone: unknown,
  orderNumber: string,
  deliveryCode: string,
): Promise<boolean> {
  const normalizedPhone = normalizePhoneForSms(phone);
  if (!normalizedPhone) return false;

  const smsMessage = buildDeliveryCodeSmsMessage(orderNumber, deliveryCode);
  return sendSms(normalizedPhone, smsMessage);
}

async function sendCodePush(
  customer: any,
  orderId: string | number,
  deliveryCode: string,
): Promise<boolean> {
  const fcmToken = typeof customer?.fcm_token === 'string' ? customer.fcm_token.trim() : '';
  if (!fcmToken) return false;

  return sendPush(
    fcmToken,
    'Delivery Code Ready',
    `Your 4-digit delivery code is ${deliveryCode}`,
    {
      type: 'delivery_code',
      orderId: String(orderId),
      route: '/customer/orders',
    },
  );
}

export async function dispatchDeliveryCodeToCustomer(
  strapi: any,
  orderId: string | number,
): Promise<{ success: boolean; message: string }> {
  const initialOrder = await loadOrderWithCustomer(strapi, orderId);
  let order = initialOrder;
  if (!order) {
    return { success: false, message: 'Order not found' };
  }

  const ensured = await ensureDeliveryCode(strapi, order);
  order = ensured.order;

  const customer = order.customer;
  if (!customer) {
    return { success: false, message: 'Order has no customer to notify' };
  }

  const orderNumber = String(order.order_number || order.id);
  const deliveryCode = ensured.code;

  if (customer.id) {
    await saveNotification(
      strapi,
      customer.id,
      'Delivery Code Ready',
      `Your 4-digit delivery code is ${deliveryCode}. Share it only at handoff.`,
      'delivery_code',
      orderNumber,
      {
        type: 'delivery_code',
        orderId: String(order.id),
        route: '/customer/orders',
      },
    );
  }

  const [smsSent, pushSent] = await Promise.all([
    sendCodeToPhone(customer.phone, orderNumber, deliveryCode),
    sendCodePush(customer, order.id, deliveryCode),
  ]);

  if (!smsSent && !pushSent) {
    return {
      success: false,
      message: 'Delivery code could not be sent (no valid SMS/push channel)',
    };
  }

  return {
    success: true,
    message:
      smsSent && pushSent
        ? 'Delivery code sent via SMS and push'
        : smsSent
          ? 'Delivery code sent via SMS'
          : 'Delivery code sent via push',
  };
}

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
  const order: any = await loadOrderWithCustomer(strapi, orderId);

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

  await strapi.entityService.update('api::order.order', order.id, {
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
  const order = await loadOrderWithCustomer(strapi, orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

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

  await strapi.entityService.update('api::order.order', order.id, {
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
  const order = await loadOrderWithCustomer(strapi, orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  await strapi.entityService.update('api::order.order', order.id, {
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
  const initialOrder = await loadOrderWithCustomer(strapi, orderId);
  let order = initialOrder;

  if (!order) {
    return { success: false, message: 'Order not found' };
  }

  const ensured = await ensureDeliveryCode(strapi, order);
  order = ensured.order;

  const customer = order.customer;
  if (!customer) {
    return { success: false, message: 'Order has no customer to notify' };
  }

  const orderNumber = String(order.order_number || order.id);
  const deliveryCode = ensured.code;

  if (method === 'push') {
    const pushSent = await sendCodePush(customer, order.id, deliveryCode);
    if (!pushSent) {
      return { success: false, message: 'Push token not available or push delivery failed' };
    }
    return { success: true, message: 'Code resent via push' };
  }

  const smsSent = await sendCodeToPhone(customer.phone, orderNumber, deliveryCode);
  if (!smsSent) {
    return { success: false, message: 'SMS delivery failed or customer phone is invalid' };
  }

  if (method === 'whatsapp') {
    strapi.log.info(
      `[DELIVERY_CODE] WhatsApp not configured, fell back to SMS for order ${orderId}`,
    );
    return { success: true, message: 'WhatsApp not configured, code sent via SMS instead' };
  }

  return { success: true, message: 'Code resent via SMS' };
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
  const initialOrder: any = await loadOrderWithCustomer(strapi, orderId);
  let order = initialOrder;

  if (!order) {
    return { success: false, message: 'Order not found' };
  }

  const ensured = await ensureDeliveryCode(strapi, order);
  order = ensured.order;

  const normalizedRecipient = normalizePhoneForSms(recipientPhone);
  if (!normalizedRecipient) {
    return { success: false, message: 'Recipient phone number is invalid' };
  }

  const orderNumber = String(order.order_number || order.id);
  const deliveryCode = ensured.code;
  const smsMessage = buildDeliveryCodeSmsMessage(orderNumber, deliveryCode);
  const sent = await sendSms(normalizedRecipient, smsMessage);

  if (!sent) {
    return { success: false, message: 'Failed to send code to recipient phone' };
  }

  strapi.log.info(`[DELIVERY_CODE] Code forwarded for order ${orderId} to ${normalizedRecipient}`);
  return { success: true, message: `Code forwarded to ${normalizedRecipient}` };
}
