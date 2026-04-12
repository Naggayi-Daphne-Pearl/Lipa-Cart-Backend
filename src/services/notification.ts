import * as admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

/**
 * Notification message templates keyed by order status.
 */
const ORDER_STATUS_MESSAGES: Record<
  string,
  { title: string; body: (orderNumber: string) => string }
> = {
  payment_confirmed: {
    title: 'Payment Confirmed',
    body: (n) => `Order #${n} payment has been confirmed. A shopper will be assigned soon.`,
  },
  shopper_assigned: {
    title: 'Shopper Assigned',
    body: (n) => `A personal shopper has been assigned to your order #${n}.`,
  },
  shopping: {
    title: 'Shopping In Progress',
    body: (n) => `Your personal shopper is now picking items for order #${n}.`,
  },
  ready_for_pickup: {
    title: 'Ready for Delivery',
    body: (n) => `Order #${n} has been packed and is ready for a rider to pick up.`,
  },
  rider_assigned: {
    title: 'Rider Assigned',
    body: (n) => `A rider has been assigned to deliver your order #${n}.`,
  },
  in_transit: {
    title: 'On The Way!',
    body: (n) => `Your order #${n} is on its way to you.`,
  },
  delivered: {
    title: 'Order Delivered',
    body: (n) => `Order #${n} has been delivered. Enjoy your groceries!`,
  },
  cancelled: {
    title: 'Order Cancelled',
    body: (n) => `Order #${n} has been cancelled.`,
  },
};

/** Notification for shoppers when a new task is available. */
const SHOPPER_NEW_TASK = {
  title: 'New Order Available',
  body: (n: string) => `Order #${n} is ready to be shopped. Claim it now!`,
};

/** Notification for riders when a delivery is available. */
const RIDER_NEW_DELIVERY = {
  title: 'New Delivery Available',
  body: (n: string) => `Order #${n} is ready for pickup. Claim it now!`,
};

/**
 * Initialize Firebase Admin SDK. Call once at server startup.
 * Reads credentials from environment variables.
 */
export function initFirebase(): boolean {
  if (firebaseApp) return true;

  // Bypass SSL cert check in dev (Node.js can't verify Google's OAuth2 cert on some systems)
  if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  try {
    let credential: admin.credential.Credential | undefined;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(serviceAccount);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      credential = admin.credential.cert(serviceAccount);
    }

    if (!credential) {
      console.warn(
        '[notifications] Firebase credentials not configured — push notifications disabled',
      );
      return false;
    }

    firebaseApp = admin.initializeApp({ credential });
    console.log('[notifications] Firebase Admin initialized');
    return true;
  } catch (err: any) {
    console.error('[notifications] Failed to initialize Firebase Admin:', err?.message);
    return false;
  }
}

/** Whether Firebase is ready to send messages. */
export function isFirebaseReady(): boolean {
  return firebaseApp !== null;
}

/**
 * Send a push notification to a single device token.
 * Silently skips if Firebase is not configured or the token is empty.
 */
/**
 * FCM error codes that are worth retrying. These are transient network or
 * backend blips — not token-stale errors, which we should fail fast on since
 * retries will never succeed.
 */
const RETRYABLE_FCM_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'messaging/timeout',
]);

const PUSH_MAX_ATTEMPTS = 3;
const PUSH_BASE_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  if (!firebaseApp || !fcmToken) return false;

  const route = data?.route || '/';
  const payload = {
    token: fcmToken,
    notification: { title, body },
    data: { ...(data ?? {}), title, body },
    android: {
      priority: 'high' as const,
      notification: { channelId: 'lipacart_orders', sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        title,
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
        requireInteraction: true,
      },
      fcmOptions: {
        link: route,
      },
    },
  };

  const tokenPreview = fcmToken.slice(0, 12);
  for (let attempt = 1; attempt <= PUSH_MAX_ATTEMPTS; attempt++) {
    try {
      await admin.messaging(firebaseApp).send(payload);
      if (attempt > 1) {
        console.info(`[notifications] Push to ${tokenPreview}... succeeded on attempt ${attempt}`);
      }
      return true;
    } catch (err: any) {
      const code = err?.errorInfo?.code || err?.code;
      const retryable = RETRYABLE_FCM_CODES.has(code);
      if (!retryable || attempt === PUSH_MAX_ATTEMPTS) {
        console.error(
          `[notifications] Push to ${tokenPreview}... failed after ${attempt} attempt(s) (code=${code}):`,
          err?.message,
        );
        return false;
      }
      // Exponential backoff: 250ms, 500ms
      const delay = PUSH_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `[notifications] Push to ${tokenPreview}... transient failure (code=${code}), retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  return false;
}

/**
 * Save a notification record to the database for the in-app inbox.
 */
export async function saveNotification(
  strapi: any,
  userId: number,
  title: string,
  body: string,
  type: string,
  orderNumber?: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    await strapi.entityService.create('api::notification.notification', {
      data: {
        title,
        body,
        type,
        is_read: false,
        user: userId,
        order_number: orderNumber ?? null,
        data: data ?? null,
      },
    });
  } catch (err: any) {
    strapi?.log?.error(
      `[notifications] Failed to save notification record for user ${userId}: ${err?.message}`,
    );
  }
}

/**
 * Notify the customer about an order status change.
 * Sends a push notification AND saves a record for the in-app inbox.
 */
export async function notifyOrderStatusChange(
  strapi: any,
  orderId: number,
  newStatus: string,
  orderNumber: string,
): Promise<void> {
  const template = ORDER_STATUS_MESSAGES[newStatus];
  if (!template) return;

  try {
    // Get the customer user ID from the order link table
    const customerLink: any = await strapi.db.connection.raw(
      `SELECT user_id FROM orders_customer_lnk WHERE order_id = ?`,
      [orderId],
    );
    const rows = customerLink?.rows || customerLink;
    if (!rows || rows.length === 0) return;

    const customerUser: any = await strapi.db.query('api::user.user').findOne({
      where: { id: rows[0].user_id },
    });
    if (!customerUser) return;

    const title = template.title;
    const body = template.body(orderNumber);
    const data = {
      type: 'order_status',
      orderId: String(orderId),
      status: newStatus,
      route: '/customer/orders',
    };

    // Save to inbox (always, even if push fails)
    await saveNotification(strapi, customerUser.id, title, body, 'order_status', orderNumber, data);

    // Send push (only if Firebase is ready and token exists)
    if (isFirebaseReady() && customerUser.fcm_token) {
      console.log(
        `[notifications] Sending push to user ${customerUser.id}, token: ${customerUser.fcm_token.slice(0, 20)}...`,
      );
      const sent = await sendPush(customerUser.fcm_token, title, body, data);
      console.log(`[notifications] Push ${sent ? 'sent successfully' : 'FAILED'}`);
    } else {
      console.warn(
        `[notifications] Skipping push — firebase=${isFirebaseReady()}, token=${!!customerUser.fcm_token}`,
      );
    }
  } catch (err: any) {
    strapi?.log?.error(
      `[notifications] notifyOrderStatusChange(order=${orderId}, status=${newStatus}) failed: ${err?.message}`,
    );
  }
}

/**
 * Notify online shoppers that a new order is available.
 */
export async function notifyShoppersNewTask(strapi: any, orderNumber: string): Promise<void> {
  try {
    const shoppers: any[] = await strapi.db.query('api::shopper.shopper').findMany({
      where: { is_online: true, kyc_status: 'approved' },
      populate: ['user'],
    });

    const title = SHOPPER_NEW_TASK.title;
    const body = SHOPPER_NEW_TASK.body(orderNumber);
    const data = {
      type: 'new_task',
      orderNumber,
      route: '/shopper/available-tasks',
    };

    for (const shopper of shoppers) {
      const userId = shopper.user?.id;
      if (!userId) continue;

      const user: any = await strapi.db.query('api::user.user').findOne({
        where: { id: userId },
      });
      if (!user) continue;

      // Save to inbox
      await saveNotification(strapi, user.id, title, body, 'new_task', orderNumber, data);

      // Send push
      if (isFirebaseReady() && user.fcm_token) {
        await sendPush(user.fcm_token, title, body, data);
      }
    }
  } catch (err: any) {
    strapi?.log?.error(
      `[notifications] notifyShoppersNewTask(order=${orderNumber}) failed: ${err?.message}`,
    );
  }
}

/**
 * Notify online riders that a new delivery is ready for pickup.
 */
export async function notifyRidersNewDelivery(strapi: any, orderNumber: string): Promise<void> {
  try {
    const riders: any[] = await strapi.db.query('api::rider.rider').findMany({
      where: { is_online: true, kyc_status: 'approved' },
      populate: ['user'],
    });

    const title = RIDER_NEW_DELIVERY.title;
    const body = RIDER_NEW_DELIVERY.body(orderNumber);
    const data = {
      type: 'new_delivery',
      orderNumber,
      route: '/rider/available-deliveries',
    };

    for (const rider of riders) {
      const userId = rider.user?.id;
      if (!userId) continue;

      const user: any = await strapi.db.query('api::user.user').findOne({
        where: { id: userId },
      });
      if (!user) continue;

      // Save to inbox
      await saveNotification(strapi, user.id, title, body, 'new_delivery', orderNumber, data);

      // Send push
      if (isFirebaseReady() && user.fcm_token) {
        await sendPush(user.fcm_token, title, body, data);
      }
    }
  } catch (err: any) {
    strapi?.log?.error(
      `[notifications] notifyRidersNewDelivery(order=${orderNumber}) failed: ${err?.message}`,
    );
  }
}
