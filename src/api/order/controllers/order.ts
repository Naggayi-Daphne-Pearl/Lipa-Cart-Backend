import { factories } from '@strapi/strapi';
import {
  notifyOrderStatusChange,
  notifyShoppersNewTask,
  notifyRidersNewDelivery,
} from '../../../services/notification';
import { sendOrderConfirmationEmail, sendDeliveryReceiptEmail } from '../../../services/email';
import { requireAuth, requireAdmin } from '../../../services/auth-helper';
import { checkServiceArea } from '../../../services/service-area';

async function resolveOrderByIdOrDocumentId(strapi: any, orderRef: string) {
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

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  /**
   * Authenticated customers create an order via POST /api/orders.
   *
   * Client cannot influence:
   * - status: always starts at 'pending'. The pending → payment_confirmed
   *   transition happens at the end of POST /api/order-items/bulk, after the
   *   line items have been validated and totals computed.
   * - customer: forced to the authenticated user.
   * - subtotal / service_fee / delivery_fee / total: zeroed; recomputed by
   *   bulkCreate from catalog prices.
   *
   * Restricting status here also closes the door on a customer adding items
   * after payment_confirmed via a second bulkCreate call: bulkCreate only
   * accepts pending orders, and orders can never be re-opened to pending.
   */
  async create(ctx: any) {
    try {
      const strapiUser = ctx.state.user;
      if (!strapiUser) {
        return ctx.unauthorized('Authentication required');
      }
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: strapiUser.username },
        populate: ['customer'],
      });
      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can create orders');
      }

      const body = (ctx.request.body?.data ?? {}) as any;

      if (!body.delivery_address) {
        strapi.log.warn(`[order.create] reject: delivery_address missing user=${customUser.id}`);
        return ctx.badRequest('delivery_address is required');
      }

      // Load the address so we can verify (a) the caller owns it and (b) it
      // sits inside the service area. Both checks must run server-side: a
      // malicious client could otherwise reference somebody else's address or
      // an out-of-area pin that the frontend warning was bypassed for.
      const addressRecord: any = await strapi.db.query('api::address.address').findOne({
        where: { id: body.delivery_address },
        populate: ['customer'],
      });
      if (!addressRecord) {
        strapi.log.warn(
          `[order.create] reject: address not found user=${customUser.id} delivery_address=${body.delivery_address}`,
        );
        return ctx.badRequest('delivery_address not found');
      }
      if (addressRecord.customer?.id !== customUser.customer?.id) {
        strapi.log.warn(
          `[order.create] reject: address ownership mismatch user=${customUser.id} customer=${customUser.customer?.id} address=${addressRecord.id} addressCustomer=${addressRecord.customer?.id}`,
        );
        return ctx.forbidden('You can only deliver to your own saved addresses');
      }

      const areaCheck = checkServiceArea(addressRecord.gps_lat, addressRecord.gps_lng);
      if (!areaCheck.ok) {
        strapi.log.warn(
          `[order.create] reject: service-area user=${customUser.id} address=${addressRecord.id} lat=${addressRecord.gps_lat} lng=${addressRecord.gps_lng} reason=${areaCheck.reason}`,
        );
        return ctx.badRequest(areaCheck.reason);
      }

      ctx.request.body = {
        data: {
          order_number: body.order_number,
          delivery_address: body.delivery_address,
          payment_method: body.payment_method,
          special_instructions: body.special_instructions,
          status: 'pending',
          customer: customUser.id,
          subtotal: 0,
          service_fee: 0,
          delivery_fee: 0,
          total: 0,
        },
      };

      return super.create(ctx);
    } catch (error) {
      console.error('ERROR: Failed to create order:', error);
      throw error;
    }
  },

  async find(ctx: any) {
    try {
      // Authenticate via the default auth middleware (route uses standard auth)
      // and resolve the caller's custom user record so we can apply role-based scoping.
      const strapiUser = ctx.state.user;
      if (!strapiUser) {
        return ctx.unauthorized('Authentication required');
      }
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: strapiUser.username },
      });
      if (!customUser) {
        return ctx.forbidden('User profile not found');
      }

      // Build a role-based filter so callers only see orders they're entitled to.
      // Shoppers/riders also see unassigned orders in their pickup pool so they can
      // discover and claim available work via the same endpoint.
      let scopeFilter: any = null;
      switch (customUser.user_type) {
        case 'admin':
          scopeFilter = null; // unrestricted
          break;
        case 'customer':
          scopeFilter = { customer: { id: { $eq: customUser.id } } };
          break;
        case 'shopper':
          scopeFilter = {
            $or: [
              { shopper: { id: { $eq: customUser.id } } },
              {
                $and: [
                  { status: { $eq: 'payment_confirmed' } },
                  { shopper: { id: { $null: true } } },
                ],
              },
            ],
          };
          break;
        case 'rider':
          scopeFilter = {
            $or: [
              { rider: { id: { $eq: customUser.id } } },
              {
                $and: [{ status: { $eq: 'ready_for_pickup' } }, { rider: { id: { $null: true } } }],
              },
            ],
          };
          break;
        default:
          return ctx.forbidden('Unknown user type');
      }

      if (scopeFilter) {
        const existingFilters = ctx.query.filters;
        ctx.query.filters = existingFilters
          ? { $and: [existingFilters, scopeFilter] }
          : scopeFilter;
      }

      // Override populate to always include all needed relations
      // This avoids complex query string parsing issues with Strapi v5
      ctx.query.populate = {
        order_items: {
          populate: {
            product: true,
          },
        },
        delivery_address: true,
        customer: true,
        shopper: true,
        rider: true,
        rating: true,
      };

      const result = await super.find(ctx);
      return result;
    } catch (error) {
      console.error('ERROR: Failed to find orders:', error);
      throw error;
    }
  },

  async findOne(ctx: any) {
    try {
      // Authenticate and resolve the caller's custom user record.
      const strapiUser = ctx.state.user;
      if (!strapiUser) {
        return ctx.unauthorized('Authentication required');
      }
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: strapiUser.username },
      });
      if (!customUser) {
        return ctx.forbidden('User profile not found');
      }

      // Pre-fetch the order with just the relations we need for the access check.
      // This is a small extra query but lets us reject IDOR attempts before exposing
      // any data via the populated response.
      const { id } = ctx.params;
      const orderForCheck: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['customer', 'shopper', 'rider'],
      });
      if (!orderForCheck) {
        return ctx.notFound('Order not found');
      }

      const isAuthorized =
        customUser.user_type === 'admin' ||
        (customUser.user_type === 'customer' && orderForCheck.customer?.id === customUser.id) ||
        (customUser.user_type === 'shopper' &&
          (orderForCheck.shopper?.id === customUser.id ||
            (!orderForCheck.shopper && orderForCheck.status === 'payment_confirmed'))) ||
        (customUser.user_type === 'rider' &&
          (orderForCheck.rider?.id === customUser.id ||
            (!orderForCheck.rider && orderForCheck.status === 'ready_for_pickup')));

      if (!isAuthorized) {
        return ctx.forbidden('You do not have access to this order');
      }

      // Ensure order_items are always populated
      if (!ctx.query.populate) {
        ctx.query.populate = {};
      }

      // If populate is a string, convert to object
      if (typeof ctx.query.populate === 'string') {
        const populateStr = ctx.query.populate;
        ctx.query.populate = {};
        populateStr.split(',').forEach((field: string) => {
          ctx.query.populate[field] = true;
        });
      }

      // Always include related data for tracking and order details
      if (typeof ctx.query.populate === 'object') {
        ctx.query.populate.order_items = {
          populate: {
            product: true,
            substitution_photo: true,
          },
        };
        ctx.query.populate.delivery_address = true;
        ctx.query.populate.customer = true;
        ctx.query.populate.shopper = true;
        ctx.query.populate.rider = true;
        ctx.query.populate.rating = true;
      }

      const result = await super.findOne(ctx);

      return result;
    } catch (error) {
      console.error('ERROR: Failed to find single order:', error);
      throw error;
    }
  },

  /**
   * Shopper claims an available order
   * POST /api/orders/:id/claim
   */
  async claimOrder(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params; // documentId of the order

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can claim orders');
      }

      // Verify shopper KYC is approved before allowing order claims
      let shopperRecord: any = null;
      try {
        const linkResult: any = await strapi.db.connection.raw(
          `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`,
          [customUser.id],
        );
        const rows = linkResult?.rows || linkResult;
        if (rows && rows.length > 0) {
          shopperRecord = await strapi.db.query('api::shopper.shopper').findOne({
            where: { id: rows[0].shopper_id },
          });
        }
      } catch (linkErr: any) {
        // Fallback: search all shoppers
        const allShoppers: any = await strapi.db.query('api::shopper.shopper').findMany({
          populate: ['user'],
          limit: 200,
        });
        shopperRecord = allShoppers.find(
          (s: any) => s.user?.id === customUser.id || s.user?.documentId === customUser.documentId,
        );
      }

      if (!shopperRecord || shopperRecord.kyc_status !== 'approved') {
        return ctx.forbidden('Your KYC must be approved before you can claim orders');
      }

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'payment_confirmed') {
        return ctx.badRequest('Order is not available for claiming');
      }

      if (order.shopper) {
        return ctx.badRequest('Order is already assigned to a shopper');
      }

      let claimConflict = false;
      await strapi.db.connection.transaction(async (trx: any) => {
        // Atomic claim: update status only if still 'payment_confirmed' to prevent race conditions
        const claimResult = await trx('orders')
          .where({ id: order.id, status: 'payment_confirmed' })
          .update({
            status: 'shopper_assigned',
            shopper_assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (claimResult === 0) {
          claimConflict = true;
          return;
        }

        // Insert the shopper link (Strapi v5 uses a link table for relations)
        await trx('orders_shopper_lnk').insert({
          order_id: order.id,
          user_id: customUser.id,
        });
      });

      if (claimConflict) {
        return ctx.conflict('Order was already claimed by another shopper');
      }

      // Fetch the updated order with full population
      const updated = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
        },
      });

      // Notify customer: shopper assigned
      notifyOrderStatusChange(strapi, order.id, 'shopper_assigned', order.order_number).catch(
        () => {},
      );

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Claim order error:', error);
      ctx.throw(500, 'Failed to claim order');
    }
  },

  /**
   * Shopper unclaims/cancels a claimed order (before shopping starts)
   * DELETE /api/orders/:id/claim
   */
  async unclaimOrder(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params;

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can unclaim orders');
      }

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['shopper'],
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.shopper?.id !== customUser.id) {
        return ctx.forbidden('You can only unclaim orders you have claimed');
      }

      if (order.status !== 'shopper_assigned') {
        return ctx.badRequest('Can only unclaim orders that have not started shopping yet');
      }

      await strapi.db.connection.transaction(async (trx: any) => {
        // Reset order status
        await trx('orders').where({ id: order.id }).update({
          status: 'payment_confirmed',
          shopper_assigned_at: null,
          updated_at: new Date().toISOString(),
        });

        // Remove shopper link
        await trx('orders_shopper_lnk').where({ order_id: order.id }).delete();
      });

      const updated = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
        },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Unclaim order error:', error);
      ctx.throw(500, 'Failed to unclaim order');
    }
  },

  /**
   * Shopper updates order status (shopping, ready_for_pickup)
   * PATCH /api/orders/:id/shopper-status
   */
  async updateShopperStatus(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params;
      const { status } = ctx.request.body;

      const allowedTransitions: Record<string, string[]> = {
        shopper_assigned: ['shopping'],
        shopping: ['ready_for_pickup'],
      };

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can update order status');
      }

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['shopper'],
      });

      if (!order) return ctx.notFound('Order not found');

      // Verify this shopper owns the order
      if (order.shopper?.id !== customUser.id) {
        return ctx.forbidden('You are not assigned to this order');
      }

      // Validate status transition
      const allowed = allowedTransitions[order.status];
      if (!allowed || !allowed.includes(status)) {
        return ctx.badRequest(`Cannot transition from '${order.status}' to '${status}'`);
      }

      // Build update data with timestamps
      const updateData: any = { status };
      if (status === 'shopping') updateData.shopping_started_at = new Date();
      if (status === 'ready_for_pickup') {
        // Recalculate total from order items. We REQUIRE every found item to have
        // an actual_price set — silently falling back to estimated_price (or 0)
        // lets shoppers send free items to the customer.
        let actualSubtotal = 0;
        try {
          const linkResult = await strapi.db.connection.raw(
            `SELECT order_item_id FROM order_items_order_lnk WHERE order_id = ?`,
            [order.id],
          );
          const linkRows = linkResult?.rows || linkResult || [];
          const itemIds = Array.isArray(linkRows) ? linkRows.map((r: any) => r.order_item_id) : [];

          if (itemIds.length === 0) {
            return ctx.badRequest('Cannot mark order ready: no items found');
          }

          const orderItems: any[] = await strapi.db.query('api::order-item.order-item').findMany({
            where: { id: { $in: itemIds } },
          });

          const missingPrice: string[] = [];
          for (const item of orderItems) {
            const isFound = item.found === true || item.found === 1;
            if (!isFound) continue;
            const price = Number(item.actual_price);
            if (!Number.isFinite(price) || price <= 0) {
              missingPrice.push(item.product_name || `item ${item.id}`);
              continue;
            }
            const qty = Number(item.quantity ?? 1);
            actualSubtotal += price * qty;
          }

          if (missingPrice.length > 0) {
            return ctx.badRequest(`Set an actual price for: ${missingPrice.join(', ')}`);
          }

          const serviceFeeRate = 0.05;
          const actualServiceFee = Math.round(actualSubtotal * serviceFeeRate);
          const deliveryFee = order.delivery_fee || 0;
          const actualTotal = actualSubtotal + actualServiceFee + deliveryFee;

          updateData.subtotal = actualSubtotal;
          updateData.service_fee = actualServiceFee;
          updateData.total = actualTotal;
        } catch (calcErr: any) {
          console.error('Failed to recalculate order total:', calcErr?.message);
          return ctx.throw(500, 'Failed to recalculate order total');
        }

        updateData.shopping_completed_at = new Date();
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: updateData,
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
        },
      });

      // Notify customer about status change
      notifyOrderStatusChange(strapi, order.id, status, order.order_number).catch(() => {});
      // When ready for pickup, notify online riders
      if (status === 'ready_for_pickup') {
        notifyRidersNewDelivery(strapi, order.order_number).catch(() => {});
      }

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Update shopper status error:', error);
      ctx.throw(500, 'Failed to update order status');
    }
  },

  /**
   * Admin confirms payment for a pending order
   * PATCH /api/orders/:id/confirm-payment
   */
  async confirmPayment(ctx: any) {
    try {
      // Gate on the Strapi role (source of truth for RBAC) rather than the
      // custom user_type enum, which is writable via other endpoints.
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params; // documentId of the order

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'pending') {
        return ctx.badRequest(`Order status is '${order.status}', expected 'pending'`);
      }

      // Confirm payment
      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          status: 'payment_confirmed',
          payment_confirmed_at: new Date(),
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
        },
      });

      // Notify customer: payment confirmed
      notifyOrderStatusChange(strapi, order.id, 'payment_confirmed', order.order_number).catch(
        () => {},
      );
      // Email: order confirmation
      sendOrderConfirmationEmail(strapi, order.id, order.order_number).catch(() => {});
      // Notify online shoppers: new task available
      notifyShoppersNewTask(strapi, order.order_number).catch(() => {});

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Confirm payment error:', error);
      ctx.throw(500, 'Failed to confirm payment');
    }
  },

  /**
   * Rider claims an order ready for pickup
   * POST /api/orders/:id/claim-delivery
   */
  async claimDelivery(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params; // documentId of the order

      if (!customUser || customUser.user_type !== 'rider') {
        return ctx.forbidden('Only riders can claim deliveries');
      }

      // Verify rider KYC is approved before allowing delivery claims
      let riderRecord: any = null;
      try {
        const linkResult: any = await strapi.db.connection.raw(
          `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`,
          [customUser.id],
        );
        const rows = linkResult?.rows || linkResult;
        if (rows && rows.length > 0) {
          riderRecord = await strapi.db.query('api::rider.rider').findOne({
            where: { id: rows[0].rider_id },
          });
        }
      } catch (linkErr: any) {
        // Fallback: search all riders
        const allRiders: any = await strapi.db.query('api::rider.rider').findMany({
          populate: ['user'],
          limit: 200,
        });
        riderRecord = allRiders.find(
          (r: any) => r.user?.id === customUser.id || r.user?.documentId === customUser.documentId,
        );
      }

      if (!riderRecord || riderRecord.kyc_status !== 'approved') {
        return ctx.forbidden('Your KYC must be approved before you can claim deliveries');
      }

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'ready_for_pickup') {
        return ctx.badRequest('Order is not ready for pickup');
      }

      if (order.rider) {
        return ctx.badRequest('Order is already assigned to a rider');
      }

      let claimConflict = false;
      await strapi.db.connection.transaction(async (trx: any) => {
        // Atomic claim: update status only if still 'ready_for_pickup' to prevent race conditions
        const claimResult = await trx('orders')
          .where({ id: order.id, status: 'ready_for_pickup' })
          .update({
            status: 'rider_assigned',
            rider_assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (claimResult === 0) {
          claimConflict = true;
          return;
        }

        // Insert the rider link (Strapi v5 uses a link table for relations)
        await trx('orders_rider_lnk').insert({
          order_id: order.id,
          user_id: customUser.id,
        });
      });

      if (claimConflict) {
        return ctx.conflict('Delivery was already claimed by another rider');
      }

      // Fetch the updated order with full population
      const updated = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
        },
      });

      // Notify customer: rider assigned
      notifyOrderStatusChange(strapi, order.id, 'rider_assigned', order.order_number).catch(
        () => {},
      );

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Claim delivery error:', error);
      ctx.throw(500, 'Failed to claim delivery');
    }
  },

  /**
   * Rider updates delivery status (in_transit, delivered)
   * PATCH /api/orders/:id/rider-status
   */
  async unclaimDelivery(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params;

      if (!customUser || customUser.user_type !== 'rider') {
        return ctx.forbidden('Only riders can cancel deliveries');
      }

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['rider'],
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.rider?.id !== customUser.id) {
        return ctx.forbidden('You are not assigned to this delivery');
      }

      // Riders can only cancel before pickup/transit starts.
      if (order.status !== 'rider_assigned') {
        return ctx.badRequest('You can only cancel a delivery before transit starts');
      }

      await strapi.db.connection.transaction(async (trx: any) => {
        await trx('orders').where({ id: order.id }).update({
          status: 'ready_for_pickup',
          rider_assigned_at: null,
          picked_up_at: null,
          updated_at: new Date().toISOString(),
        });

        await trx('orders_rider_lnk').where({ order_id: order.id }).delete();
      });

      const updated = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
        },
      });

      // Re-notify riders so the delivery can be re-claimed quickly.
      notifyRidersNewDelivery(strapi, order.order_number).catch(() => {});

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Unclaim delivery error:', error);
      ctx.throw(500, 'Failed to cancel delivery');
    }
  },

  /**
   * Rider updates delivery status (in_transit, delivered)
   * PATCH /api/orders/:id/rider-status
   */
  async updateRiderStatus(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params;
      const { status, delivery_proof_url } = ctx.request.body;

      const allowedTransitions: Record<string, string[]> = {
        rider_assigned: ['in_transit'],
        in_transit: ['delivered'],
      };

      if (!customUser || customUser.user_type !== 'rider') {
        return ctx.forbidden('Only riders can update delivery status');
      }

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['rider'],
      });

      if (!order) return ctx.notFound('Order not found');

      // Verify this rider owns the order
      if (order.rider?.id !== customUser.id) {
        return ctx.forbidden('You are not assigned to this delivery');
      }

      // Validate status transition
      const allowed = allowedTransitions[order.status];
      if (!allowed || !allowed.includes(status)) {
        return ctx.badRequest(`Cannot transition from '${order.status}' to '${status}'`);
      }

      // Build update data with timestamps
      const updateData: any = { status };
      if (status === 'in_transit') updateData.picked_up_at = new Date();
      if (status === 'delivered') {
        updateData.delivered_at = new Date();
        if (delivery_proof_url) updateData.delivery_proof_url = delivery_proof_url;
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: updateData,
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
        },
      });

      // Notify customer about status change (in_transit or delivered)
      notifyOrderStatusChange(strapi, order.id, status, order.order_number).catch(() => {});

      // Email: delivery receipt
      if (status === 'delivered') {
        sendDeliveryReceiptEmail(strapi, order.id, order.order_number).catch(() => {});
      }

      // When delivered, update shopper and rider stats
      if (status === 'delivered') {
        const commission = (order.total || 0) * 0.1; // 10% commission

        // Update shopper stats
        try {
          const shopperLink: any = await strapi.db.connection.raw(
            `SELECT user_id FROM orders_shopper_lnk WHERE order_id = ?`,
            [order.id],
          );
          const shopperRows = shopperLink?.rows || shopperLink;
          if (shopperRows && shopperRows.length > 0) {
            const shopperUserId = shopperRows[0].user_id;
            const sLink: any = await strapi.db.connection.raw(
              `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`,
              [shopperUserId],
            );
            const sRows = sLink?.rows || sLink;
            if (sRows && sRows.length > 0) {
              const shopperRecord: any = await strapi.db.query('api::shopper.shopper').findOne({
                where: { id: sRows[0].shopper_id },
              });
              if (shopperRecord) {
                await strapi.entityService.update('api::shopper.shopper', shopperRecord.id, {
                  data: {
                    total_earnings: (shopperRecord.total_earnings || 0) + commission,
                    total_orders_completed: (shopperRecord.total_orders_completed || 0) + 1,
                  },
                });
              }
            }
          }
        } catch (e: any) {
          console.error('Failed to update shopper stats:', e?.message);
        }

        // Update rider stats
        try {
          const riderLink: any = await strapi.db.connection.raw(
            `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`,
            [customUser.id],
          );
          const rRows = riderLink?.rows || riderLink;
          if (rRows && rRows.length > 0) {
            const riderRecord: any = await strapi.db.query('api::rider.rider').findOne({
              where: { id: rRows[0].rider_id },
            });
            if (riderRecord) {
              const deliveryFee = order.delivery_fee || 0;
              await strapi.entityService.update('api::rider.rider', riderRecord.id, {
                data: {
                  total_earnings: (riderRecord.total_earnings || 0) + deliveryFee,
                  total_deliveries_completed: (riderRecord.total_deliveries_completed || 0) + 1,
                },
              });
            }
          }
        } catch (e: any) {
          console.error('Failed to update rider stats:', e?.message);
        }
      }

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Update rider status error:', error);
      ctx.throw(500, 'Failed to update delivery status');
    }
  },

  async createGuestOrder(ctx: any) {
    // Pricing constants — must mirror frontend `AppConstants` so totals stay
    // consistent. Server is the source of truth: client-supplied totals are
    // ignored entirely to prevent tampering.
    const SERVICE_FEE_RATE = 0.05;
    const DELIVERY_FEE_FLAT = 3000;

    try {
      const { phone, name, address_line, city, landmark, items, gps_lat, gps_lng } =
        ctx.request.body;

      if (!phone || !address_line) {
        return ctx.badRequest('phone and address_line are required');
      }
      if (!Array.isArray(items) || items.length === 0) {
        return ctx.badRequest('items must be a non-empty array');
      }

      // Service area enforcement: guest orders MUST include GPS coordinates so
      // we can verify the drop point is inside the delivery zone. The frontend
      // captures these from the location picker; rejecting here closes the
      // door on a tampered/older client that omits them.
      const guestLat =
        typeof gps_lat === 'number' ? gps_lat : Number.parseFloat(String(gps_lat ?? ''));
      const guestLng =
        typeof gps_lng === 'number' ? gps_lng : Number.parseFloat(String(gps_lng ?? ''));
      const guestAreaCheck = checkServiceArea(
        Number.isFinite(guestLat) ? guestLat : null,
        Number.isFinite(guestLng) ? guestLng : null,
      );
      if (!guestAreaCheck.ok) {
        return ctx.badRequest(guestAreaCheck.reason);
      }

      // Resolve every product up-front so we can validate existence/availability
      // and compute the authoritative subtotal before persisting anything.
      const resolvedItems: Array<{
        product: any;
        quantity: number;
        unit: string;
        special_instructions?: string;
      }> = [];

      for (const raw of items) {
        const productRef = raw?.product;
        const quantity = Number(raw?.quantity);
        if (!productRef || !Number.isFinite(quantity) || quantity <= 0) {
          return ctx.badRequest('Each item requires a product and positive quantity');
        }
        const unit =
          typeof raw?.unit === 'string' && raw.unit.trim().length > 0 ? raw.unit.trim() : 'pcs';

        // Accept either documentId (string) or numeric id
        let product: any = await strapi.db.query('api::product.product').findOne({
          where: { documentId: String(productRef) },
        });
        if (!product) {
          const numericId = Number(productRef);
          if (Number.isFinite(numericId)) {
            product = await strapi.db.query('api::product.product').findOne({
              where: { id: numericId },
            });
          }
        }

        if (!product) {
          return ctx.badRequest(`Product ${productRef} not found`);
        }
        if (product.is_active === false) {
          return ctx.badRequest(`Product ${product.name} is not available`);
        }

        resolvedItems.push({
          product,
          quantity,
          unit,
          special_instructions: raw?.special_instructions,
        });
      }

      // Server-side total computation. Client cannot influence these values.
      const subtotal = resolvedItems.reduce(
        (sum, item) => sum + Number(item.product.estimated_price || 0) * item.quantity,
        0,
      );
      if (subtotal <= 0) {
        return ctx.badRequest('Order subtotal must be greater than zero');
      }
      const service_fee = Math.round(subtotal * SERVICE_FEE_RATE);
      const delivery_fee = DELIVERY_FEE_FLAT;
      const total = subtotal + service_fee + delivery_fee;

      // Find or create custom user by phone
      let customUser: any = await strapi.query('api::user.user').findOne({
        where: { phone },
      });

      if (!customUser) {
        customUser = await strapi.entityService.create('api::user.user', {
          data: {
            phone,
            name: name ?? null,
            user_type: 'customer',
            is_active: true,
          },
        });
      } else if (name && !customUser.name) {
        // Backfill name if we have one and the existing user doesn't.
        await strapi.entityService.update('api::user.user', customUser.id, {
          data: { name },
        });
      }

      // Create address record. Persist the GPS pin we just validated so future
      // dispatch / routing systems can route to the same coordinates.
      const address: any = await strapi.entityService.create('api::address.address', {
        data: {
          address_line,
          city: city ?? null,
          landmark: landmark ?? null,
          gps_lat: guestLat,
          gps_lng: guestLng,
        },
      });

      // Create order with server-computed totals.
      const orderNumber = `LC${Date.now().toString().slice(-8)}`;
      let order: any;
      try {
        order = await strapi.entityService.create('api::order.order', {
          data: {
            order_number: orderNumber,
            customer: customUser.id,
            delivery_address: address.id,
            subtotal,
            service_fee,
            delivery_fee,
            total,
            status: 'pending',
          },
        });
      } catch (orderErr) {
        console.error('Failed to persist guest order:', orderErr);
        // Roll back the orphan address so we don't accumulate junk records.
        await strapi.entityService.delete('api::address.address', address.id).catch(() => {});
        return ctx.throw(500, 'Failed to create guest order');
      }

      // Persist order_items. If any fail, roll back the order so the customer
      // doesn't end up with an order containing partial items.
      const createdItemIds: number[] = [];
      try {
        for (const item of resolvedItems) {
          const created: any = await strapi.entityService.create('api::order-item.order-item', {
            data: {
              order: order.id,
              product: item.product.id,
              product_name: item.product.name,
              quantity: item.quantity,
              unit: item.unit,
              estimated_price: item.product.estimated_price,
              special_instructions: item.special_instructions ?? null,
            },
          });
          createdItemIds.push(created.id);
        }
      } catch (itemErr) {
        console.error('Failed to persist guest order items, rolling back:', itemErr);
        for (const itemId of createdItemIds) {
          await strapi.entityService.delete('api::order-item.order-item', itemId).catch(() => {});
        }
        await strapi.entityService.delete('api::order.order', order.id).catch(() => {});
        await strapi.entityService.delete('api::address.address', address.id).catch(() => {});
        return ctx.throw(500, 'Failed to create guest order items');
      }

      // Re-fetch with full population so the client gets a complete order back.
      const fullOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: {
          order_items: { populate: { product: true } },
          delivery_address: true,
          customer: true,
        },
      });

      ctx.body = { data: fullOrder };
    } catch (error) {
      console.error('Guest order creation error:', error);
      ctx.throw(500, 'Failed to create guest order');
    }
  },

  /**
   * Customer cancels own order from early stages only.
   * PATCH /api/orders/:id/customer-cancel
   */
  async customerCancelOrder(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can cancel orders');
      }

      const { id } = ctx.params;
      const { cancellation_reason } = ctx.request.body;

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['customer'],
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.customer?.id !== customUser.id) {
        return ctx.forbidden('You can only cancel your own orders');
      }

      const cancellableStatuses = [
        'pending',
        'payment_processing',
        'payment_confirmed',
        'shopper_assigned',
      ];
      if (!cancellableStatuses.includes(order.status)) {
        return ctx.badRequest('Order can no longer be cancelled at this stage');
      }

      await strapi.db.connection.transaction(async (trx: any) => {
        await trx('orders')
          .where({ id: order.id })
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: cancellation_reason || 'Cancelled by customer',
            shopper_assigned_at: null,
            updated_at: new Date().toISOString(),
          });

        await trx('orders_shopper_lnk').where({ order_id: order.id }).delete();
        await trx('orders_rider_lnk').where({ order_id: order.id }).delete();
      });

      const updated = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
          rider: true,
        },
      });

      notifyOrderStatusChange(strapi, order.id, 'cancelled', order.order_number).catch(() => {});

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Customer cancel order error:', error);
      ctx.throw(500, 'Failed to cancel order');
    }
  },

  /**
   * Customer switches an unpaid mobile-money order to cash on delivery.
   * PATCH /api/orders/:id/switch-to-cod
   */
  async switchToCashOnDelivery(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can change payment method');
      }

      const { id } = ctx.params;
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['customer'],
      });

      if (!order) return ctx.notFound('Order not found');
      if (order.customer?.id !== customUser.id) {
        return ctx.forbidden('You can only update your own orders');
      }
      if (String(order.payment_method) !== 'mobileMoney') {
        return ctx.badRequest('Order is not using mobile money');
      }
      if (!['pending', 'payment_processing'].includes(String(order.status))) {
        return ctx.badRequest('Only unpaid mobile money orders can switch to cash on delivery');
      }

      const payment: any = await strapi.db.query('api::payment.payment').findOne({
        where: {
          order: { id: order.id },
          provider: 'pawapay',
        },
      });

      if (payment?.status === 'completed') {
        return ctx.badRequest('This order payment has already been completed');
      }

      if (payment) {
        await strapi.entityService.update('api::payment.payment', payment.id, {
          data: {
            status: 'failed',
            error_message: payment.error_message || 'Customer switched to cash on delivery',
          },
        });
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          payment_method: 'cashOnDelivery',
          status: 'payment_confirmed',
          payment_confirmed_at: new Date(),
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
          rider: true,
        },
      });

      notifyOrderStatusChange(strapi, order.id, 'payment_confirmed', order.order_number).catch(
        () => {},
      );
      notifyShoppersNewTask(strapi, order.order_number).catch(() => {});

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Switch to cash on delivery error:', error);
      ctx.throw(500, 'Failed to switch payment method');
    }
  },

  /**
   * Admin cancels an order from any status.
   * PATCH /api/orders/:id/admin-cancel
   */
  async adminCancelOrder(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const { cancellation_reason } = ctx.request.body;

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });
      if (!order) return ctx.notFound('Order not found');

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          status: 'cancelled',
          cancelled_at: new Date(),
          cancellation_reason: cancellation_reason || 'Cancelled by admin',
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
          rider: true,
        },
      });

      notifyOrderStatusChange(strapi, order.id, 'cancelled', order.order_number).catch(() => {});

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Admin cancel order error:', error);
      ctx.throw(500, 'Failed to cancel order');
    }
  },

  /**
   * Admin manually assigns a shopper to an unassigned order.
   * PATCH /api/orders/:id/assign-shopper  body: { shopper_id: <documentId> }
   * Order must be in payment_confirmed status. Use reassign-shopper to swap
   * a shopper that's already assigned/shopping.
   */
  async adminAssignShopper(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const shopperId = ctx.request.body?.shopper_id;
      if (!shopperId) {
        return ctx.badRequest('shopper_id is required');
      }

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });
      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'payment_confirmed') {
        return ctx.badRequest(
          `Order status is "${order.status}". Use reassign-shopper if a shopper is already assigned.`,
        );
      }

      const shopper: any = await strapi.db.query('api::shopper.shopper').findOne({
        where: { documentId: shopperId },
        populate: ['user'],
      });
      if (!shopper) return ctx.notFound('Shopper not found');
      if (shopper.kyc_status !== 'approved' || shopper.is_verified !== true) {
        return ctx.badRequest('Shopper is not approved for assignment');
      }
      if (!shopper.user?.id) {
        return ctx.badRequest('Shopper is missing linked user profile');
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          shopper: shopper.user.id,
          status: 'shopper_assigned',
          shopper_assigned_at: new Date(),
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
        },
      });

      notifyOrderStatusChange(strapi, order.id, 'shopper_assigned', order.order_number).catch(
        () => {},
      );

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Admin assign shopper error:', error);
      ctx.throw(500, 'Failed to assign shopper');
    }
  },

  /**
   * Admin manually assigns a rider to an order ready for pickup.
   * PATCH /api/orders/:id/assign-rider  body: { rider_id: <documentId> }
   */
  async adminAssignRider(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const riderId = ctx.request.body?.rider_id;
      if (!riderId) return ctx.badRequest('rider_id is required');

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });
      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'ready_for_pickup') {
        return ctx.badRequest(
          `Order status is "${order.status}". Use reassign-rider if a rider is already assigned.`,
        );
      }

      const rider: any = await strapi.db.query('api::rider.rider').findOne({
        where: { documentId: riderId },
        populate: ['user'],
      });
      if (!rider) return ctx.notFound('Rider not found');
      if (rider.kyc_status !== 'approved' || rider.is_verified !== true) {
        return ctx.badRequest('Rider is not approved for assignment');
      }
      if (!rider.user?.id) {
        return ctx.badRequest('Rider is missing linked user profile');
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          rider: rider.user.id,
          status: 'rider_assigned',
          rider_assigned_at: new Date(),
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
          rider: true,
        },
      });

      notifyOrderStatusChange(strapi, order.id, 'rider_assigned', order.order_number).catch(
        () => {},
      );

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Admin assign rider error:', error);
      ctx.throw(500, 'Failed to assign rider');
    }
  },

  /**
   * Admin reassigns shopper — removes current shopper, resets to payment_confirmed.
   * PATCH /api/orders/:id/reassign-shopper
   */
  async adminReassignShopper(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });
      if (!order) return ctx.notFound('Order not found');

      if (!['shopper_assigned', 'shopping'].includes(order.status)) {
        return ctx.badRequest('Order must be in shopper_assigned or shopping status to reassign');
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          status: 'payment_confirmed',
          shopper: null,
          shopper_assigned_at: null,
          shopping_started_at: null,
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
        },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Admin reassign shopper error:', error);
      ctx.throw(500, 'Failed to reassign shopper');
    }
  },

  /**
   * Admin reassigns rider — removes current rider, resets to ready_for_pickup.
   * PATCH /api/orders/:id/reassign-rider
   */
  async adminReassignRider(ctx: any) {
    try {
      const auth = await requireAdmin(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });
      if (!order) return ctx.notFound('Order not found');

      if (!['rider_assigned', 'in_transit'].includes(order.status)) {
        return ctx.badRequest('Order must be in rider_assigned or in_transit status to reassign');
      }

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          status: 'ready_for_pickup',
          rider: null,
          rider_assigned_at: null,
          picked_up_at: null,
        },
        populate: {
          order_items: { populate: { product: true, substitution_photo: true } },
          delivery_address: true,
          customer: true,
          shopper: true,
        },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Admin reassign rider error:', error);
      ctx.throw(500, 'Failed to reassign rider');
    }
  },

  /**
   * Verify delivery code for an order.
   * Rider calls this endpoint before marking the order as delivered.
   * POST /orders/{id}/verify-delivery-code
   * Body: { code: "1234", gps_lat?: number, gps_lng?: number, photo_url?: string }
   */
  async verifyDeliveryCode(ctx: any) {
    try {
      const { id } = ctx.params;
      const { code, gps_lat, gps_lng, photo_url } = ctx.request.body || {};

      if (!code || typeof code !== 'string') {
        return ctx.badRequest('Delivery code is required and must be a string');
      }

      const order: any = await resolveOrderByIdOrDocumentId(strapi, String(id));

      if (!order) {
        return ctx.notFound('Order not found');
      }

      // Check if code has already been verified
      if (order.delivery_code_verified_at) {
        return ctx.badRequest('Delivery code has already been verified for this order');
      }

      // Import the delivery code service functions
      const {
        validateDeliveryCode,
        checkCodeAttemptStatus,
        recordCodeAttempt,
        verifyDeliveryCode,
      } = await import('../../../services/delivery-code');

      // Check attempt limit first
      const attemptStatus = checkCodeAttemptStatus(order);
      if (attemptStatus.locked) {
        return ctx.forbidden(
          'Maximum code verification attempts exceeded. Please contact support.',
        );
      }

      // Record the attempt
      const newAttemptStatus = await recordCodeAttempt(strapi, id);

      // Validate the code
      const validation = validateDeliveryCode(order, code);
      if (!validation.valid) {
        return ctx.badRequest({
          message: validation.error,
          attempts_remaining: newAttemptStatus.remainingAttempts,
          locked: newAttemptStatus.locked,
        });
      }

      // Code is valid, record verification with evidence
      const evidence = {
        gps_lat: typeof gps_lat === 'number' ? gps_lat : undefined,
        gps_lng: typeof gps_lng === 'number' ? gps_lng : undefined,
        photo_url: typeof photo_url === 'string' ? photo_url : undefined,
      };

      await verifyDeliveryCode(strapi, id, evidence);

      // Return success — code is verified
      ctx.body = {
        data: {
          verified: true,
          message: 'Delivery code verified successfully',
          order_id: id,
        },
      };
    } catch (error: any) {
      console.error('Delivery code verification error:', error);
      ctx.throw(500, error?.message || 'Failed to verify delivery code');
    }
  },

  /**
   * Resend delivery code to customer.
   * Customer can call this to resend their code before delivery.
   * POST /orders/{id}/resend-delivery-code
   * Body: { method: 'sms' | 'push' | 'whatsapp' }
   */
  async resendDeliveryCode(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const { method = 'sms' } = ctx.request.body || {};

      if (!['sms', 'push', 'whatsapp'].includes(method)) {
        return ctx.badRequest("method must be 'sms', 'push', or 'whatsapp'");
      }

      const order: any = await resolveOrderByIdOrDocumentId(strapi, String(id));

      if (!order) {
        return ctx.notFound('Order not found');
      }

      // Verify ownership
      const customUser = auth.customUser;
      if (order.customer?.id !== customUser.id) {
        return ctx.forbidden('You can only resend code for your own orders');
      }

      const { resendDeliveryCode } = await import('../../../services/delivery-code');

      const result = await resendDeliveryCode(strapi, id, method);

      if (!result.success) {
        return ctx.badRequest(result.message);
      }

      ctx.body = { data: result };
    } catch (error: any) {
      console.error('Resend delivery code error:', error);
      ctx.throw(500, error?.message || 'Failed to resend code');
    }
  },

  /**
   * Forward delivery code to a third party (gift scenario).
   * Customer can forward their delivery code to someone else.
   * POST /orders/{id}/forward-delivery-code
   * Body: { recipient_phone: "+256701234567" }
   */
  async forwardDeliveryCode(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;

      const { id } = ctx.params;
      const { recipient_phone } = ctx.request.body || {};

      if (!recipient_phone || typeof recipient_phone !== 'string') {
        return ctx.badRequest('recipient_phone is required');
      }

      const order: any = await resolveOrderByIdOrDocumentId(strapi, String(id));

      if (!order) {
        return ctx.notFound('Order not found');
      }

      // Verify ownership
      const customUser = auth.customUser;
      if (order.customer?.id !== customUser.id) {
        return ctx.forbidden('You can only forward code for your own orders');
      }

      const { forwardDeliveryCode } = await import('../../../services/delivery-code');

      const result = await forwardDeliveryCode(strapi, id, recipient_phone);

      if (!result.success) {
        return ctx.badRequest(result.message);
      }

      ctx.body = { data: result };
    } catch (error: any) {
      console.error('Forward delivery code error:', error);
      ctx.throw(500, error?.message || 'Failed to forward code');
    }
  },
}));
