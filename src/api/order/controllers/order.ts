import { factories } from '@strapi/strapi';
import {
  notifyOrderStatusChange,
  notifyShoppersNewTask,
  notifyRidersNewDelivery,
} from '../../../services/notification';
import { sendOrderConfirmationEmail, sendDeliveryReceiptEmail } from '../../../services/email';
import { requireAuth } from '../../../services/auth-helper';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async find(ctx: any) {
    try {
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
        shopper: {
          populate: {
            shopper: true,
          },
        },
        rider: {
          populate: {
            rider: true,
          },
        },
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
        ctx.query.populate.shopper = {
          populate: {
            shopper: true,
          },
        };
        ctx.query.populate.rider = {
          populate: {
            rider: true,
          },
        };
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

      // Atomic claim: update status only if still 'payment_confirmed' to prevent race conditions
      const claimResult = await strapi.db
        .connection('orders')
        .where({ id: order.id, status: 'payment_confirmed' })
        .update({
          status: 'shopper_assigned',
          shopper_assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (claimResult === 0) {
        return ctx.conflict('Order was already claimed by another shopper');
      }

      // Insert the shopper link (Strapi v5 uses a link table for relations)
      await strapi.db.connection('orders_shopper_lnk').insert({
        order_id: order.id,
        user_id: customUser.id,
      });

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
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'shopper_assigned') {
        return ctx.badRequest('Can only unclaim orders that have not started shopping yet');
      }

      // Reset order status
      await strapi.db.connection('orders').where({ id: order.id }).update({
        status: 'payment_confirmed',
        shopper_assigned_at: null,
        updated_at: new Date().toISOString(),
      });

      // Remove shopper link
      await strapi.db.connection('orders_shopper_lnk').where({ order_id: order.id }).delete();

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
        updateData.shopping_completed_at = new Date();

        // Recalculate total based on found items with actual prices
        try {
          const linkResult = await strapi.db.connection.raw(
            `SELECT order_item_id FROM order_items_order_lnk WHERE order_id = ?`,
            [order.id],
          );
          const linkRows = linkResult?.rows || linkResult || [];
          const itemIds = Array.isArray(linkRows) ? linkRows.map((r: any) => r.order_item_id) : [];

          const orderItems: any[] =
            itemIds.length > 0
              ? await strapi.db.query('api::order-item.order-item').findMany({
                  where: { id: { $in: itemIds } },
                })
              : [];

          let actualSubtotal = 0;
          for (const item of orderItems) {
            if (item.found === true || item.found === 1) {
              const price = item.actual_price ?? item.estimated_price ?? 0;
              const qty = item.quantity ?? 1;
              actualSubtotal += price * qty;
            }
          }

          const serviceFeeRate = 0.05;
          const actualServiceFee = actualSubtotal * serviceFeeRate;
          const deliveryFee = order.delivery_fee || 0;
          const actualTotal = actualSubtotal + actualServiceFee + deliveryFee;

          updateData.subtotal = actualSubtotal;
          updateData.service_fee = actualServiceFee;
          updateData.total = actualTotal;
        } catch (calcErr: any) {
          console.error('Failed to recalculate order total:', calcErr?.message);
          // Continue with status update even if recalculation fails
        }
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
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      const { id } = ctx.params; // documentId of the order

      if (!customUser || customUser.user_type !== 'admin') {
        return ctx.forbidden('Only admins can confirm payments');
      }

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

      // Atomic claim: update status only if still 'ready_for_pickup' to prevent race conditions
      const claimResult = await strapi.db
        .connection('orders')
        .where({ id: order.id, status: 'ready_for_pickup' })
        .update({
          status: 'rider_assigned',
          rider_assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (claimResult === 0) {
        return ctx.conflict('Delivery was already claimed by another rider');
      }

      // Insert the rider link (Strapi v5 uses a link table for relations)
      await strapi.db.connection('orders_rider_lnk').insert({
        order_id: order.id,
        user_id: customUser.id,
      });

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

      await strapi.db.connection('orders').where({ id: order.id }).update({
        status: 'ready_for_pickup',
        rider_assigned_at: null,
        picked_up_at: null,
        updated_at: new Date().toISOString(),
      });

      await strapi.db.connection('orders_rider_lnk').where({ order_id: order.id }).delete();

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
    try {
      const { phone, address_line, city, landmark, subtotal, service_fee, delivery_fee, total } =
        ctx.request.body;

      // Validate required fields
      if (!phone || !address_line) {
        return ctx.badRequest('phone and address_line are required');
      }

      // Find or create custom user by phone
      let customUser = await strapi.query('api::user.user').findOne({
        where: { phone },
      });

      if (!customUser) {
        customUser = await strapi.entityService.create('api::user.user', {
          data: {
            phone,
            user_type: 'customer',
            is_active: true,
          },
        });
      }

      // Create address record
      const address = await strapi.entityService.create('api::address.address', {
        data: {
          address_line,
          city: city ?? null,
          landmark: landmark ?? null,
        },
      });

      // Generate order number
      const orderNumber = `LC${Date.now().toString().slice(-8)}`;

      // Create order
      const order = await strapi.entityService.create('api::order.order', {
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
        populate: { delivery_address: true, customer: true },
      });

      ctx.body = { data: order };
    } catch (error) {
      console.error('Guest order creation error:', error);
      ctx.throw(500, 'Failed to create guest order');
    }
  },

  /**
   * Admin cancels an order from any status.
   * PATCH /api/orders/:id/admin-cancel
   */
  async adminCancelOrder(ctx: any) {
    try {
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let jwtUser: any;
      try {
        jwtUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch {
        return ctx.unauthorized('Invalid token');
      }
      // Verify admin role
      const strapiUser: any = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: jwtUser.id },
        populate: ['role'],
      });
      if (!strapiUser?.role || strapiUser.role.name !== 'Admin') {
        return ctx.forbidden('Only admins can cancel orders');
      }

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
   * Admin reassigns shopper — removes current shopper, resets to payment_confirmed.
   * PATCH /api/orders/:id/reassign-shopper
   */
  async adminReassignShopper(ctx: any) {
    try {
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let jwtUser: any;
      try {
        jwtUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch {
        return ctx.unauthorized('Invalid token');
      }
      const strapiUser: any = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: jwtUser.id },
        populate: ['role'],
      });
      if (!strapiUser?.role || strapiUser.role.name !== 'Admin') {
        return ctx.forbidden('Only admins can reassign shoppers');
      }

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
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let jwtUser: any;
      try {
        jwtUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch {
        return ctx.unauthorized('Invalid token');
      }
      const strapiUser: any = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: jwtUser.id },
        populate: ['role'],
      });
      if (!strapiUser?.role || strapiUser.role.name !== 'Admin') {
        return ctx.forbidden('Only admins can reassign riders');
      }

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
}));
