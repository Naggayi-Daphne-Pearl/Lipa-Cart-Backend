import type { Core } from '@strapi/strapi';
import * as Sentry from '@sentry/node';
import seed from '../scripts/seed';
import setupRoles from '../scripts/setup-roles';
import { initFirebase } from './services/notification';
import { initEmail } from './services/email';
import { initSms } from './services/sms';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {
    if (process.env.SENTRY_DSN_BACKEND) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN_BACKEND,
        environment: process.env.SENTRY_ENV || 'development',
        enableLogs: true,
        tracesSampleRate: 1.0,
        sendDefaultPii: true,
      });
    }

    // Initialize communication services
    initFirebase();
    initEmail();
    initSms();
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Setup roles first
    await setupRoles(strapi);

    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (!publicRole) return;

    const publicPermissions = [
      // Catalog content
      { action: 'find', contentType: 'api::category.category' },
      { action: 'findOne', contentType: 'api::category.category' },
      { action: 'find', contentType: 'api::subcategory.subcategory' },
      { action: 'findOne', contentType: 'api::subcategory.subcategory' },
      { action: 'find', contentType: 'api::product.product' },
      { action: 'findOne', contentType: 'api::product.product' },
      { action: 'find', contentType: 'api::recipe.recipe' },
      { action: 'findOne', contentType: 'api::recipe.recipe' },
      { action: 'find', contentType: 'api::shopping-list.shopping-list' },
      { action: 'findOne', contentType: 'api::shopping-list.shopping-list' },

      // Users & Profiles
      { action: 'find', contentType: 'api::user.user' },
      { action: 'findOne', contentType: 'api::user.user' },
      { action: 'find', contentType: 'api::customer.customer' },
      { action: 'findOne', contentType: 'api::customer.customer' },
      { action: 'find', contentType: 'api::shopper.shopper' },
      { action: 'findOne', contentType: 'api::shopper.shopper' },
      { action: 'find', contentType: 'api::rider.rider' },
      { action: 'findOne', contentType: 'api::rider.rider' },

      // Notifications
      { action: 'find', contentType: 'api::notification.notification' },
      { action: 'findOne', contentType: 'api::notification.notification' },

      // Orders & Related
      { action: 'find', contentType: 'api::order.order' },
      { action: 'findOne', contentType: 'api::order.order' },
      { action: 'find', contentType: 'api::order-item.order-item' },
      { action: 'findOne', contentType: 'api::order-item.order-item' },
      { action: 'find', contentType: 'api::payment.payment' },
      { action: 'findOne', contentType: 'api::payment.payment' },
      { action: 'find', contentType: 'api::rating.rating' },
      { action: 'findOne', contentType: 'api::rating.rating' },
    ];

    for (const { action, contentType } of publicPermissions) {
      const existing = await strapi.query('plugin::users-permissions.permission').findOne({
        where: {
          action: `${contentType}.${action}`,
          role: publicRole.id,
        },
      });

      if (!existing) {
        await strapi.query('plugin::users-permissions.permission').create({
          data: {
            action: `${contentType}.${action}`,
            role: publicRole.id,
            enabled: true,
          },
        });
      }
    }

    await seed(strapi);
  },
};
