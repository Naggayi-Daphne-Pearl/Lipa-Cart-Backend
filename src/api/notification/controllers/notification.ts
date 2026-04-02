import { factories } from '@strapi/strapi';
import { sendPush, isFirebaseReady } from '../../../services/notification';

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
          'Firebase is not initialized. Set FIREBASE_SERVICE_ACCOUNT_JSON env var and restart the backend.'
        );
      }

      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });

      if (!customUser) return ctx.notFound('User not found');

      if (!customUser.fcm_token) {
        return ctx.badRequest(
          `No FCM token stored for user ${customUser.phone}. Open the app, log in, and allow notifications first.`
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

      const { id } = ctx.params;

      await strapi.db.query('api::notification.notification').update({
        where: { documentId: id },
        data: { is_read: true },
      });

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
}));
