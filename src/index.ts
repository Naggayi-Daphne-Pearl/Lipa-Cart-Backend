import type { Core } from '@strapi/strapi';
import seed from '../scripts/seed';
import setupRoles from '../scripts/setup-roles';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

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
      
      // Orders & Related
      { action: 'find', contentType: 'api::order.order' },
      { action: 'findOne', contentType: 'api::order.order' },
      { action: 'find', contentType: 'api::order-item.order-item' },
      { action: 'findOne', contentType: 'api::order-item.order-item' },
      { action: 'find', contentType: 'api::payment.payment' },
      { action: 'findOne', contentType: 'api::payment.payment' },
      { action: 'find', contentType: 'api::rating.rating' },
      { action: 'findOne', contentType: 'api::rating.rating' },
      { action: 'find', contentType: 'api::address.address' },
      { action: 'findOne', contentType: 'api::address.address' },
    ];

    for (const { action, contentType } of publicPermissions) {
      const existing = await strapi
        .query('plugin::users-permissions.permission')
        .findOne({
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
