import type { Core } from '@strapi/strapi';

/**
 * Role-Based Access Control (RBAC) Setup
 * Defines permissions for each user type: Customer, Shopper, Rider, Admin
 */

interface RolePermission {
  action: string;
  contentType: string;
}

interface RoleDefinition {
  name: string;
  description: string;
  permissions: RolePermission[];
}

/**
 * Permission definitions for each role
 */
const ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
  customer: {
    name: 'Customer',
    description: 'Customers can browse products, place orders, manage addresses and profiles',
    permissions: [
      // Read-only catalog access
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
      { action: 'create', contentType: 'api::shopping-list.shopping-list' },
      { action: 'update', contentType: 'api::shopping-list.shopping-list' },
      { action: 'delete', contentType: 'api::shopping-list.shopping-list' },

      // Own profile management
      { action: 'find', contentType: 'api::user.user' },
      { action: 'findOne', contentType: 'api::user.user' },
      { action: 'update', contentType: 'api::user.user' },
      { action: 'find', contentType: 'api::customer.customer' },
      { action: 'findOne', contentType: 'api::customer.customer' },
      { action: 'create', contentType: 'api::customer.customer' },
      { action: 'update', contentType: 'api::customer.customer' },

      // Address management
      { action: 'find', contentType: 'api::address.address' },
      { action: 'findOne', contentType: 'api::address.address' },
      { action: 'create', contentType: 'api::address.address' },
      { action: 'update', contentType: 'api::address.address' },
      { action: 'delete', contentType: 'api::address.address' },

      // Order management
      { action: 'find', contentType: 'api::order.order' },
      { action: 'findOne', contentType: 'api::order.order' },
      { action: 'create', contentType: 'api::order.order' },
      { action: 'update', contentType: 'api::order.order' }, // For cancellation
      { action: 'find', contentType: 'api::order-item.order-item' },
      { action: 'findOne', contentType: 'api::order-item.order-item' },
      { action: 'create', contentType: 'api::order-item.order-item' },

      // Payment management
      { action: 'find', contentType: 'api::payment.payment' },
      { action: 'findOne', contentType: 'api::payment.payment' },
      { action: 'create', contentType: 'api::payment.payment' },

      // Rating management
      { action: 'find', contentType: 'api::rating.rating' },
      { action: 'findOne', contentType: 'api::rating.rating' },
      { action: 'create', contentType: 'api::rating.rating' },

      // View shoppers and riders (for order context)
      { action: 'find', contentType: 'api::shopper.shopper' },
      { action: 'findOne', contentType: 'api::shopper.shopper' },
      { action: 'find', contentType: 'api::rider.rider' },
      { action: 'findOne', contentType: 'api::rider.rider' },

      // Upload media (profile image, future attachments)
      { action: 'upload', contentType: 'plugin::upload.content-api' },
    ],
  },

  shopper: {
    name: 'Shopper',
    description: 'Shoppers can view assigned orders, update shopping status, manage substitutions',
    permissions: [
      // Read-only catalog access
      { action: 'find', contentType: 'api::category.category' },
      { action: 'findOne', contentType: 'api::category.category' },
      { action: 'find', contentType: 'api::subcategory.subcategory' },
      { action: 'findOne', contentType: 'api::subcategory.subcategory' },
      { action: 'find', contentType: 'api::product.product' },
      { action: 'findOne', contentType: 'api::product.product' },

      // Own profile management
      { action: 'find', contentType: 'api::user.user' },
      { action: 'findOne', contentType: 'api::user.user' },
      { action: 'update', contentType: 'api::user.user' },
      { action: 'find', contentType: 'api::shopper.shopper' },
      { action: 'findOne', contentType: 'api::shopper.shopper' },
      { action: 'create', contentType: 'api::shopper.shopper' },
      { action: 'update', contentType: 'api::shopper.shopper' }, // Update location, online status

      // Assigned orders management
      { action: 'find', contentType: 'api::order.order' },
      { action: 'findOne', contentType: 'api::order.order' },
      { action: 'update', contentType: 'api::order.order' }, // Update status, add photos
      { action: 'find', contentType: 'api::order-item.order-item' },
      { action: 'findOne', contentType: 'api::order-item.order-item' },
      { action: 'update', contentType: 'api::order-item.order-item' }, // Update found status, actual price, substitutions
      { action: 'create', contentType: 'api::order-item.order-item' }, // Create substitutes

      // View customer info (for contact during shopping)
      { action: 'find', contentType: 'api::customer.customer' },
      { action: 'findOne', contentType: 'api::customer.customer' },
      { action: 'find', contentType: 'api::address.address' },
      { action: 'findOne', contentType: 'api::address.address' },

      // View own ratings
      { action: 'find', contentType: 'api::rating.rating' },
      { action: 'findOne', contentType: 'api::rating.rating' },

      // Payment info (view only)
      { action: 'find', contentType: 'api::payment.payment' },
      { action: 'findOne', contentType: 'api::payment.payment' },

      // Upload media (KYC documents, substitute photos)
      { action: 'upload', contentType: 'plugin::upload.content-api' },
    ],
  },

  rider: {
    name: 'Rider',
    description: 'Riders can view delivery assignments, update delivery status, track locations',
    permissions: [
      // Own profile management
      { action: 'find', contentType: 'api::user.user' },
      { action: 'findOne', contentType: 'api::user.user' },
      { action: 'update', contentType: 'api::user.user' },
      { action: 'find', contentType: 'api::rider.rider' },
      { action: 'findOne', contentType: 'api::rider.rider' },
      { action: 'create', contentType: 'api::rider.rider' },
      { action: 'update', contentType: 'api::rider.rider' }, // Update location, online status

      // Assigned deliveries management
      { action: 'find', contentType: 'api::order.order' },
      { action: 'findOne', contentType: 'api::order.order' },
      { action: 'update', contentType: 'api::order.order' }, // Update delivery status, add delivery photos

      // View order items (for delivery context)
      { action: 'find', contentType: 'api::order-item.order-item' },
      { action: 'findOne', contentType: 'api::order-item.order-item' },

      // View customer and delivery address
      { action: 'find', contentType: 'api::customer.customer' },
      { action: 'findOne', contentType: 'api::customer.customer' },
      { action: 'find', contentType: 'api::address.address' },
      { action: 'findOne', contentType: 'api::address.address' },

      // View shopper (for pickup coordination)
      { action: 'find', contentType: 'api::shopper.shopper' },
      { action: 'findOne', contentType: 'api::shopper.shopper' },

      // View own ratings
      { action: 'find', contentType: 'api::rating.rating' },
      { action: 'findOne', contentType: 'api::rating.rating' },

      // Payment info (view only)
      { action: 'find', contentType: 'api::payment.payment' },
      { action: 'findOne', contentType: 'api::payment.payment' },

      // Upload media (KYC documents, delivery proof photos)
      { action: 'upload', contentType: 'plugin::upload.content-api' },
    ],
  },

  admin: {
    name: 'Admin',
    description:
      'Admins have full access to manage all operations, view analytics, handle disputes',
    permissions: [
      // Full catalog access
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

      // Full user management
      { action: 'find', contentType: 'api::user.user' },
      { action: 'findOne', contentType: 'api::user.user' },
      { action: 'create', contentType: 'api::user.user' },
      { action: 'update', contentType: 'api::user.user' },
      { action: 'delete', contentType: 'api::user.user' },

      { action: 'find', contentType: 'api::customer.customer' },
      { action: 'findOne', contentType: 'api::customer.customer' },
      { action: 'update', contentType: 'api::customer.customer' },
      { action: 'delete', contentType: 'api::customer.customer' },

      { action: 'find', contentType: 'api::shopper.shopper' },
      { action: 'findOne', contentType: 'api::shopper.shopper' },
      { action: 'update', contentType: 'api::shopper.shopper' },
      { action: 'delete', contentType: 'api::shopper.shopper' },

      { action: 'find', contentType: 'api::rider.rider' },
      { action: 'findOne', contentType: 'api::rider.rider' },
      { action: 'update', contentType: 'api::rider.rider' },
      { action: 'delete', contentType: 'api::rider.rider' },

      { action: 'find', contentType: 'api::admin-user.admin-user' },
      { action: 'findOne', contentType: 'api::admin-user.admin-user' },
      { action: 'update', contentType: 'api::admin-user.admin-user' },

      // Full address management
      { action: 'find', contentType: 'api::address.address' },
      { action: 'findOne', contentType: 'api::address.address' },
      { action: 'update', contentType: 'api::address.address' },
      { action: 'delete', contentType: 'api::address.address' },

      // Full order management
      { action: 'find', contentType: 'api::order.order' },
      { action: 'findOne', contentType: 'api::order.order' },
      { action: 'create', contentType: 'api::order.order' },
      { action: 'update', contentType: 'api::order.order' },
      { action: 'delete', contentType: 'api::order.order' },
      { action: 'find', contentType: 'api::order-item.order-item' },
      { action: 'findOne', contentType: 'api::order-item.order-item' },
      { action: 'update', contentType: 'api::order-item.order-item' },
      { action: 'delete', contentType: 'api::order-item.order-item' },

      // Full payment management
      { action: 'find', contentType: 'api::payment.payment' },
      { action: 'findOne', contentType: 'api::payment.payment' },
      { action: 'create', contentType: 'api::payment.payment' },
      { action: 'update', contentType: 'api::payment.payment' },
      { action: 'delete', contentType: 'api::payment.payment' },

      // Full rating management
      { action: 'find', contentType: 'api::rating.rating' },
      { action: 'findOne', contentType: 'api::rating.rating' },
      { action: 'update', contentType: 'api::rating.rating' },
      { action: 'delete', contentType: 'api::rating.rating' },

      // Full upload / media management
      { action: 'upload', contentType: 'plugin::upload.content-api' },
      { action: 'find', contentType: 'plugin::upload.content-api' },
      { action: 'findOne', contentType: 'plugin::upload.content-api' },
      { action: 'destroy', contentType: 'plugin::upload.content-api' },
    ],
  },
};

/**
 * Create or update roles with their permissions
 */
export default async function setupRoles(strapi: Core.Strapi) {
  console.log('🔐 Setting up user roles and permissions...');

  for (const [roleType, roleDef] of Object.entries(ROLE_DEFINITIONS)) {
    try {
      // Find or create role
      let role = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: roleType } });

      if (!role) {
        console.log(`   Creating role: ${roleDef.name}`);
        role = await strapi.query('plugin::users-permissions.role').create({
          data: {
            name: roleDef.name,
            type: roleType,
            description: roleDef.description,
          },
        });
      } else {
        console.log(`   Updating role: ${roleDef.name}`);
        await strapi.query('plugin::users-permissions.role').update({
          where: { id: role.id },
          data: {
            name: roleDef.name,
            description: roleDef.description,
          },
        });
      }

      // Batch-load all existing permissions for this role in one query
      const existingPerms: any[] = await strapi
        .query('plugin::users-permissions.permission')
        .findMany({ where: { role: role.id }, limit: 500 });
      const enabledSet = new Set(existingPerms.filter((p) => p.enabled).map((p) => p.action));
      const disabledMap = new Map(
        existingPerms.filter((p) => !p.enabled).map((p) => [p.action, p.id]),
      );

      const toCreate: string[] = [];
      const toEnable: number[] = [];

      for (const { action, contentType } of roleDef.permissions) {
        const permissionAction = `${contentType}.${action}`;
        if (enabledSet.has(permissionAction)) continue;
        const disabledId = disabledMap.get(permissionAction);
        if (disabledId !== undefined) {
          toEnable.push(disabledId);
        } else {
          toCreate.push(permissionAction);
        }
      }

      // Create missing permissions
      await Promise.all(
        toCreate.map((permissionAction) =>
          strapi.query('plugin::users-permissions.permission').create({
            data: { action: permissionAction, role: role.id, enabled: true },
          }),
        ),
      );

      // Re-enable any disabled permissions
      await Promise.all(
        toEnable.map((id) =>
          strapi.query('plugin::users-permissions.permission').update({
            where: { id },
            data: { enabled: true },
          }),
        ),
      );

      console.log(
        `   ✓ ${roleDef.name} role configured with ${roleDef.permissions.length} permissions` +
          (toCreate.length > 0 ? ` (${toCreate.length} new)` : '') +
          (toEnable.length > 0 ? ` (${toEnable.length} re-enabled)` : ''),
      );
    } catch (error) {
      console.error(`   ✗ Error setting up ${roleDef.name} role:`, error);
    }
  }

  console.log('✅ Role setup complete!\n');
}

/**
 * Helper function to assign role to user based on user_type
 */
export async function assignRoleToUser(
  strapi: Core.Strapi,
  userId: number,
  userType: 'customer' | 'shopper' | 'rider' | 'admin',
) {
  const role = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: userType } });

  if (role) {
    await strapi.query('plugin::users-permissions.user').update({
      where: { id: userId },
      data: { role: role.id },
    });
  }
}
