import { factories } from '@strapi/strapi';
import {
  sendPush,
  isFirebaseReady,
  notifyUserPromo,
  notifySystemAlert,
} from '../../../services/notification';
import { requireAdmin } from '../../../services/auth-helper';

function parseNotificationRef(ref: unknown): { id?: number; documentId?: string } {
  const value = String(ref ?? '').trim();
  if (!value) return {};
  if (/^\d+$/.test(value)) {
    return { id: Number(value) };
  }
  return { documentId: value };
}

export default factories.createCoreController('api::notification.notification', ({ strapi }) => ({
  /**
   * Test push notification — sends a test push to the authenticated user.
   * GET /api/notifications/test-push
   *
   * Use this to verify the full FCM pipeline works:
   *   1. Firebase is initialized on the backend
   *   2. User has an fcm_token stored
   *   3. The device receives the push
   */
  async testPush(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) return ctx.unauthorized('Authentication required');

      if (!isFirebaseReady()) {
        return ctx.badRequest(
          'Firebase is not initialized. Set FIREBASE_SERVICE_ACCOUNT_JSON env var and restart the backend.',
        );
      }

      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });

      if (!customUser) return ctx.notFound('User not found');

      if (!customUser.fcm_token) {
        return ctx.badRequest(
          `No FCM token stored for user ${customUser.phone}. Open the app, log in, and allow notifications first.`,
        );
      }

      const success = await sendPush(
        customUser.fcm_token,
        'LipaCart Test',
        'If you see this, push notifications are working!',
        { type: 'test' },
      );

      ctx.body = {
        ok: success,
        firebase_ready: true,
        fcm_token_present: true,
        fcm_token_prefix: customUser.fcm_token.slice(0, 20) + '...',
        message: success
          ? 'Push sent! Check your device.'
          : 'Push failed — token may be stale. Try logging out and back in.',
      };
    } catch (error) {
      console.error('Test push error:', error);
      ctx.throw(500, 'Test push failed');
    }
  },

  /**
   * Get notifications for the authenticated user.
   * GET /api/notifications/mine
   */
  async mine(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) return ctx.unauthorized('Authentication required');

      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });
      if (!customUser) return ctx.notFound('User not found');

      const page = parseInt(ctx.query.page || '1', 10);
      const pageSize = parseInt(ctx.query.pageSize || '25', 10);

      const [notifications, total] = await Promise.all([
        strapi.db.query('api::notification.notification').findMany({
          where: { user: customUser.id },
          orderBy: { createdAt: 'desc' },
          offset: (page - 1) * pageSize,
          limit: pageSize,
        }),
        strapi.db.query('api::notification.notification').count({
          where: { user: customUser.id },
        }),
      ]);

      const unreadCount = await strapi.db.query('api::notification.notification').count({
        where: { user: customUser.id, is_read: false },
      });

      ctx.body = {
        data: notifications,
        meta: {
          pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
          unreadCount,
        },
      };
    } catch (error) {
      console.error('Fetch notifications error:', error);
      ctx.throw(500, 'Failed to fetch notifications');
    }
  },

  /**
   * Mark a notification as read.
   * PATCH /api/notifications/:id/read
   */
  async markRead(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) return ctx.unauthorized('Authentication required');

      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });
      if (!customUser) return ctx.notFound('User not found');

      const { id } = ctx.params;

      const notificationRef = parseNotificationRef(id);
      if (!notificationRef.id && !notificationRef.documentId) {
        return ctx.badRequest('Invalid notification id');
      }

      const updated = await strapi.db.query('api::notification.notification').update({
        where: {
          ...notificationRef,
          user: customUser.id,
        },
        data: { is_read: true },
      });

      if (!updated) {
        return ctx.notFound('Notification not found');
      }

      ctx.body = { ok: true };
    } catch (error) {
      console.error('Mark read error:', error);
      ctx.throw(500, 'Failed to mark notification as read');
    }
  },

  /**
   * Mark all notifications as read for the authenticated user.
   * PATCH /api/notifications/read-all
   */
  async markAllRead(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) return ctx.unauthorized('Authentication required');

      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });
      if (!customUser) return ctx.notFound('User not found');

      await strapi.db.query('api::notification.notification').updateMany({
        where: { user: customUser.id, is_read: false },
        data: { is_read: true },
      });

      ctx.body = { ok: true };
    } catch (error) {
      console.error('Mark all read error:', error);
      ctx.throw(500, 'Failed to mark notifications as read');
    }
  },

  /**
   * Admin: send promo notification to one or more users.
   * POST /api/notifications/admin/send-promo
   */
  async sendPromo(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { title, body, route, userIds } = ctx.request.body ?? {};
      if (!title || !body) {
        return ctx.badRequest('title and body are required');
      }

      const normalizedUserIds = Array.isArray(userIds)
        ? userIds
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isInteger(id) && id > 0)
        : [];

      const targetUserIds: number[] =
        normalizedUserIds.length > 0
          ? normalizedUserIds
          : (
              await strapi.db.query('api::user.user').findMany({
                where: { user_type: 'customer', is_active: true },
                select: ['id'],
              })
            ).map((user: any) => user.id);

      await Promise.all(
        targetUserIds.map((userId) =>
          notifyUserPromo(
            strapi,
            userId,
            String(title),
            String(body),
            String(route || '/customer/home'),
          ),
        ),
      );

      ctx.body = { ok: true, deliveredTo: targetUserIds.length };
    } catch (error) {
      console.error('Send promo error:', error);
      ctx.throw(500, 'Failed to send promo notifications');
    }
  },

  /**
   * Admin: send system notification to one or more users.
   * POST /api/notifications/admin/send-system
   */
  async sendSystem(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { title, body, route, userIds } = ctx.request.body ?? {};
      if (!title || !body) {
        return ctx.badRequest('title and body are required');
      }

      const normalizedUserIds = Array.isArray(userIds)
        ? userIds
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isInteger(id) && id > 0)
        : [];

      const targetUserIds: number[] =
        normalizedUserIds.length > 0
          ? normalizedUserIds
          : (
              await strapi.db.query('api::user.user').findMany({
                where: { is_active: true },
                select: ['id'],
              })
            ).map((user: any) => user.id);

      await Promise.all(
        targetUserIds.map((userId) =>
          notifySystemAlert(
            strapi,
            userId,
            String(title),
            String(body),
            String(route || '/customer/home'),
          ),
        ),
      );

      ctx.body = { ok: true, deliveredTo: targetUserIds.length };
    } catch (error) {
      console.error('Send system error:', error);
      ctx.throw(500, 'Failed to send system notifications');
    }
  },
}));
