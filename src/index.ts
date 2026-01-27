import type { Core } from '@strapi/strapi';
import seed from '../scripts/seed';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (!publicRole) return;

    const publicPermissions = [
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

    // Seed sample data on first run
    await seed(strapi);
  },
};
