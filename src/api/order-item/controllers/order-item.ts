import { factories } from '@strapi/strapi';
import { sendPush, saveNotification, isFirebaseReady } from '../../../services/notification';
import { requireAuth } from '../../../services/auth-helper';
import { calculatePawaPayCharge } from '../../../services/pawapay';
import { generateDeliveryCode } from '../../../services/delivery-code';

// Maximum multiplier of the catalog estimated_price that a shopper is allowed
// to set as actual_price. Catches order-of-magnitude tampering / fat-fingers
// while leaving room for real grocery price variance.
const MAX_PRICE_MULTIPLIER = 3;

/**
 * Validates a shopper-supplied actual_price against the catalog price for the
 * linked product. Returns an error message if the price is unacceptable, or
 * null if it's fine. Items with no linked product (free-text items) are not
 * capped — there's no catalog price to compare against.
 */
async function validateActualPrice(
  strapi: any,
  item: any,
  actualPrice: any,
): Promise<string | null> {
  if (actualPrice === undefined || actualPrice === null) return null;
  const price = Number(actualPrice);
  if (!Number.isFinite(price) || price < 0) {
    return 'actual_price must be a non-negative number';
  }
  // Look up the linked product (if any) to compare against catalog price.
  let productId: number | null = null;
  if (item?.product?.id) {
    productId = item.product.id;
  } else {
    const linkRow: any = await strapi.db.connection
      .raw(`SELECT product_id FROM order_items_product_lnk WHERE order_item_id = ? LIMIT 1`, [
        item.id,
      ])
      .catch(() => null);
    const rows = linkRow?.rows || linkRow;
    if (rows && rows.length > 0) {
      productId = rows[0].product_id;
    }
  }
  if (!productId) return null; // free-text item, nothing to compare
  const product: any = await strapi.db.query('api::product.product').findOne({
    where: { id: productId },
  });
  if (!product || !Number.isFinite(Number(product.estimated_price))) return null;
  const catalogPrice = Number(product.estimated_price);
  const ceiling = catalogPrice * MAX_PRICE_MULTIPLIER;
  if (price > ceiling) {
    return `actual_price ${price} exceeds ${MAX_PRICE_MULTIPLIER}x catalog price (${catalogPrice}) for ${product.name}`;
  }
  return null;
}

export default factories.createCoreController('api::order-item.order-item', ({ strapi }) => ({
  async create(ctx: any) {
    try {
      const result = await super.create(ctx);
      return result;
    } catch (error) {
      console.error('ERROR: Failed to create order item:', error);
      throw error;
    }
  },

  /**
   * Shopper updates an order item (mark found, set actual price)
   * PATCH /api/order-items/:id/shopper-update
   */
  async shopperUpdate(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;
      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can update order items');
      }

      const { id } = ctx.params; // documentId of the order item
      const { found, actual_price } = ctx.request.body;

      // Find the order item with the assigned shopper so we can verify ownership.
      const item: any = await strapi.db.query('api::order-item.order-item').findOne({
        where: { documentId: id },
        populate: { order: { populate: ['shopper'] } },
      });

      if (!item) return ctx.notFound('Order item not found');

      if (item.order?.shopper?.id !== customUser.id) {
        return ctx.forbidden('You are not assigned to this order');
      }

      // Cap actual_price against the catalog price for linked products.
      const priceError = await validateActualPrice(strapi, item, actual_price);
      if (priceError) {
        return ctx.badRequest(priceError);
      }

      // Build update data
      const updateData: any = {};
      if (typeof found === 'boolean') updateData.found = found;
      if (actual_price !== undefined) updateData.actual_price = actual_price;

      const updated = await strapi.entityService.update('api::order-item.order-item', item.id, {
        data: updateData,
        populate: { product: true, order: true },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Shopper update item error:', error);
      ctx.throw(500, 'Failed to update order item');
    }
  },

  /**
   * Shopper batch-updates multiple order items at once
   * PATCH /api/order-items/batch-update
   */
  async batchUpdate(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;
      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can update order items');
      }

      const { items } = ctx.request.body;
      if (!items || !Array.isArray(items)) {
        return ctx.badRequest('items array is required');
      }

      const results = [];
      const failed = [];
      const newSubstitutes = [];

      for (const itemUpdate of items) {
        try {
          const { documentId, found, actual_price, shopper_notes, substitution_approved } =
            itemUpdate;

          // Support both documentId (string) and numeric id lookups,
          // populating order.shopper so we can verify the caller owns this item.
          let item: any = null;
          const isNumericId = /^\d+$/.test(String(documentId));
          if (isNumericId) {
            item = await strapi.db.query('api::order-item.order-item').findOne({
              where: { id: Number(documentId) },
              populate: { order: { populate: ['shopper'] } },
            });
          }
          if (!item) {
            item = await strapi.db.query('api::order-item.order-item').findOne({
              where: { documentId },
              populate: { order: { populate: ['shopper'] } },
            });
          }

          if (!item) {
            failed.push({ documentId, error: 'Not found' });
            continue;
          }

          if (item.order?.shopper?.id !== customUser.id) {
            failed.push({ documentId, error: 'Not your assigned order' });
            continue;
          }

          // Cap actual_price against catalog price.
          const priceError = await validateActualPrice(strapi, item, actual_price);
          if (priceError) {
            failed.push({ documentId, error: priceError });
            continue;
          }

          const isNewSubstituteSuggestion =
            typeof shopper_notes === 'string' &&
            shopper_notes.startsWith('SUBSTITUTE:') &&
            item.shopper_notes !== shopper_notes;

          if (isNewSubstituteSuggestion) {
            newSubstitutes.push({
              documentId: String(documentId),
              shopper_notes,
            });
          }

          const updateData: any = {};
          if (typeof found === 'boolean') updateData.found = found;
          if (actual_price !== undefined) updateData.actual_price = actual_price;
          if (shopper_notes !== undefined) updateData.shopper_notes = shopper_notes;
          if (typeof substitution_approved === 'boolean') {
            updateData.substitution_approved = substitution_approved;
          }

          // Auto-populate structured substitution fields from legacy notes
          if (isNewSubstituteSuggestion) {
            updateData.is_substituted = true;
            const nameMatch = shopper_notes
              .replace('SUBSTITUTE: ', '')
              .replace(/\s*\(UGX\s*[\d,]+\)\s*$/, '')
              .trim();
            if (nameMatch) updateData.substitute_name = nameMatch;
            const priceMatch = shopper_notes.match(/UGX\s*([\d,]+)/);
            if (priceMatch) {
              const parsed = parseFloat(priceMatch[1].replace(/,/g, ''));
              if (!isNaN(parsed)) updateData.substitute_price = parsed;
            }
            updateData.substitution_approved = null; // reset for new suggestion
          }

          const updated = await strapi.entityService.update('api::order-item.order-item', item.id, {
            data: updateData,
          });
          results.push(updated);
        } catch (e) {
          failed.push({ documentId: itemUpdate.documentId, error: e.message });
        }
      }

      // Send notification only for brand-new substitute suggestions
      const substitutes = newSubstitutes;
      if (substitutes.length > 0) {
        try {
          // Find the order for these items to get the customer
          const firstItem: any = await strapi.db.query('api::order-item.order-item').findOne({
            where: { documentId: substitutes[0].documentId },
            populate: ['order'],
          });
          if (firstItem?.order) {
            const order: any = await strapi.db.query('api::order.order').findOne({
              where: { id: firstItem.order.id },
              populate: ['customer'],
            });
            if (order?.customer) {
              const customer: any = await strapi.db.query('api::user.user').findOne({
                where: { id: order.customer.id },
              });
              if (customer?.fcm_token && isFirebaseReady()) {
                const subNames = substitutes
                  .map((s: any) => s.shopper_notes.replace('SUBSTITUTE: ', ''))
                  .join(', ');
                await sendPush(
                  customer.fcm_token,
                  'Substitute Suggested',
                  `Your shopper suggested: ${subNames}. Review it before shopping is completed.`,
                  {
                    type: 'substitute_suggestion',
                    orderId: String(order.documentId ?? order.id),
                    route: '/customer/orders',
                  },
                ).catch(() => {});
              }
              await saveNotification(
                strapi,
                order.customer.id,
                'Substitute Suggested',
                `${substitutes.length} item(s) unavailable — your shopper suggested substitutes.`,
                'substitute_suggestion',
                order.order_number,
                {
                  type: 'substitute_suggestion',
                  route: '/customer/orders',
                  orderId: String(order.documentId ?? order.id),
                },
              ).catch(() => {});
            }
          }
        } catch (notifErr) {
          // Non-blocking — don't fail the batch update
        }
      }

      ctx.body = {
        data: results,
        meta: { updated: results.length, failed: failed.length },
      };
    } catch (error) {
      console.error('Batch update error:', error);
      ctx.throw(500, 'Failed to batch update items');
    }
  },

  /**
   * Customer approves or rejects a suggested substitute during shopping.
   * PATCH /api/order-items/:id/substitution-response
   */
  async respondToSubstitution(ctx: any) {
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
      });
      if (!strapiUser) return ctx.unauthorized('User not found');

      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: strapiUser.username },
      });
      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can respond to substitute suggestions');
      }

      const { id } = ctx.params;
      const { approved, rejection_reason } = ctx.request.body;
      if (typeof approved !== 'boolean') {
        return ctx.badRequest('approved must be a boolean');
      }

      const item: any = await strapi.db.query('api::order-item.order-item').findOne({
        where: { documentId: id },
        populate: {
          order: {
            populate: ['customer', 'shopper'],
          },
        },
      });

      if (!item) return ctx.notFound('Order item not found');
      // Accept response if item has structured substitution OR legacy notes
      if (
        !item.is_substituted &&
        (!item.shopper_notes || !String(item.shopper_notes).startsWith('SUBSTITUTE:'))
      ) {
        return ctx.badRequest('This item does not have a pending substitute suggestion');
      }

      const order = item.order;
      if (!order || order.customer?.id !== customUser.id) {
        return ctx.forbidden('You do not have permission to respond to this substitute');
      }

      // Block substitution responses on terminal-state orders so we don't trigger
      // ghost notifications or mutate items on completed/cancelled orders.
      const inactiveStatuses = ['delivered', 'cancelled', 'refunded'];
      if (inactiveStatuses.includes(order.status)) {
        return ctx.badRequest('This order is no longer active');
      }

      const updatePayload: any = {
        substitution_approved: approved,
      };
      if (!approved && rejection_reason && typeof rejection_reason === 'string') {
        // Store rejection reason for the shopper to see what customer wants
        updatePayload.special_instructions = `REJECTION: ${rejection_reason.trim()}`;
      } else if (approved) {
        // Clear any stale rejection reason when customer approves
        const currentInstructions = item.special_instructions || '';
        if (currentInstructions.startsWith('REJECTION:')) {
          updatePayload.special_instructions = null;
        }
      }

      const updated = await strapi.entityService.update('api::order-item.order-item', item.id, {
        data: updatePayload,
        populate: {
          product: true,
          order: {
            populate: ['customer', 'shopper'],
          },
        },
      });

      const shopperUserId = order.shopper?.id;
      if (shopperUserId) {
        const shopperUser: any = await strapi.db.query('api::user.user').findOne({
          where: { id: shopperUserId },
        });

        if (shopperUser) {
          const title = approved ? 'Substitute Approved' : 'Substitute Rejected';
          const body = approved
            ? `Customer approved your substitute for ${item.product_name}.`
            : `Customer rejected your substitute for ${item.product_name}.`;
          const data = {
            type: 'substitute_response',
            route: '/shopper/active-tasks',
            orderId: String(order.documentId ?? order.id),
            itemId: String(item.documentId ?? item.id),
            approved: String(approved),
          };

          await saveNotification(
            strapi,
            shopperUser.id,
            title,
            body,
            'substitute_response',
            order.order_number,
            data,
          ).catch(() => {});

          if (shopperUser.fcm_token && isFirebaseReady()) {
            await sendPush(shopperUser.fcm_token, title, body, data).catch(() => {});
          }
        }
      }

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Respond to substitution error:', error);
      ctx.throw(500, 'Failed to update substitute response');
    }
  },

  /**
   * Shopper suggests a structured substitute for an unavailable item.
   * POST /api/order-items/:id/suggest-substitute
   */
  async suggestSubstitute(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;
      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can suggest substitutes');
      }

      const { id } = ctx.params; // documentId of the order item
      const { substitute_name, substitute_price } = ctx.request.body;

      if (!substitute_name || typeof substitute_name !== 'string') {
        return ctx.badRequest('substitute_name is required');
      }

      const item: any = await strapi.db.query('api::order-item.order-item').findOne({
        where: { documentId: id },
        populate: { order: { populate: ['shopper'] } },
      });
      if (!item) return ctx.notFound('Order item not found');

      if (item.order?.shopper?.id !== customUser.id) {
        return ctx.forbidden('You are not assigned to this order');
      }

      // Build backward-compat shopper_notes
      const priceLabel = substitute_price ? ` (UGX ${Math.round(substitute_price)})` : '';
      const shopperNotes = `SUBSTITUTE: ${substitute_name}${priceLabel}`;

      // Clear stale rejection reason from previous round
      const currentInstructions = item.special_instructions || '';
      const cleanedInstructions = currentInstructions.startsWith('REJECTION:')
        ? null
        : currentInstructions || null;

      const updateData: any = {
        is_substituted: true,
        substitute_name: substitute_name.trim(),
        shopper_notes: shopperNotes,
        substitution_approved: null, // reset approval for new suggestion
        found: false,
        special_instructions: cleanedInstructions, // clear old rejection reason
      };
      if (substitute_price !== undefined && substitute_price !== null) {
        updateData.substitute_price = substitute_price;
      }

      const updated = await strapi.entityService.update('api::order-item.order-item', item.id, {
        data: updateData,
        populate: { product: true, order: true },
      });

      // Notify customer about the substitute suggestion
      try {
        if (item.order) {
          const order: any = await strapi.db.query('api::order.order').findOne({
            where: { id: item.order.id },
            populate: ['customer'],
          });
          if (order?.customer) {
            const customer: any = await strapi.db.query('api::user.user').findOne({
              where: { id: order.customer.id },
            });
            if (customer?.fcm_token && isFirebaseReady()) {
              await sendPush(
                customer.fcm_token,
                'Substitute Suggested',
                `Your shopper suggested ${substitute_name} as a substitute. Review it before shopping is completed.`,
                {
                  type: 'substitute_suggestion',
                  orderId: String(order.documentId ?? order.id),
                  route: '/customer/orders',
                },
              ).catch(() => {});
            }
            await saveNotification(
              strapi,
              order.customer.id,
              'Substitute Suggested',
              `Your shopper suggested ${substitute_name} as a substitute for ${item.product_name}.`,
              'substitute_suggestion',
              order.order_number,
              {
                type: 'substitute_suggestion',
                route: '/customer/orders',
                orderId: String(order.documentId ?? order.id),
              },
            ).catch(() => {});
          }
        }
      } catch {
        // Non-blocking
      }

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Suggest substitute error:', error);
      ctx.throw(500, 'Failed to suggest substitute');
    }
  },

  async bulkCreate(ctx: any) {
    // Server-owned validation limits
    const MAX_ITEMS_PER_ORDER = 100;
    const MAX_QTY_PER_ITEM = 100;
    const MIN_ORDER_SUBTOTAL = 5000; // UGX — matches frontend free-delivery progress UI expectations
    const SERVICE_FEE_RATE = 0.05;
    const DELIVERY_FEE_FLAT = 3000;

    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;
      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can add items to an order');
      }

      const { items } = ctx.request.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return ctx.badRequest('items must be a non-empty array');
      }
      if (items.length > MAX_ITEMS_PER_ORDER) {
        return ctx.badRequest(`Too many items in one request (max ${MAX_ITEMS_PER_ORDER})`);
      }

      // All items in a single call must target the same order. Resolve and
      // authorise it once, then validate every line item against it.
      const firstOrderRef = items[0]?.order;
      if (!firstOrderRef) {
        return ctx.badRequest('Each item must reference an order');
      }
      const orderRecord: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: String(firstOrderRef) },
        populate: ['customer'],
      });
      if (!orderRecord) {
        return ctx.notFound('Order not found');
      }
      if (orderRecord.customer?.id !== customUser.id) {
        return ctx.forbidden('You can only add items to your own orders');
      }
      // Items can only be added to a brand-new pending order. Once we
      // transition to payment_confirmed (at the end of this handler), the
      // contents and total are locked in — a second bulkCreate call would be
      // rejected here, preventing customers from changing items after the
      // total has been agreed.
      if (orderRecord.status !== 'pending') {
        return ctx.badRequest(`Cannot add items to an order in '${orderRecord.status}' state`);
      }

      const createdItems: any[] = [];
      const failedItems: any[] = [];

      // Free-text shopping-list items come in with no product reference or a
      // `custom_*` stub id. Since there's no catalog to anchor the price to,
      // we trust the client's estimated_price but cap it to prevent absurd
      // values; the shopper still sets actual_price during shopping.
      const MAX_CUSTOM_ITEM_PRICE = 1_000_000;

      for (const itemData of items) {
        try {
          const { order: orderDocId, product: productDocId, ...scalarData } = itemData;

          if (!orderDocId || String(orderDocId) !== String(firstOrderRef)) {
            failedItems.push({ item: itemData, error: 'All items must target the same order' });
            continue;
          }

          const quantity = Number(scalarData.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            failedItems.push({ item: itemData, error: 'Quantity must be positive' });
            continue;
          }
          if (quantity > MAX_QTY_PER_ITEM) {
            failedItems.push({
              item: itemData,
              error: `Quantity exceeds max of ${MAX_QTY_PER_ITEM}`,
            });
            continue;
          }

          const isCustomStub = !productDocId || String(productDocId).startsWith('custom_');

          let productRecord: any = null;
          if (!isCustomStub) {
            productRecord = await strapi.db.query('api::product.product').findOne({
              where: { documentId: String(productDocId) },
            });
            if (!productRecord) {
              const numericId = Number(productDocId);
              if (Number.isFinite(numericId)) {
                productRecord = await strapi.db.query('api::product.product').findOne({
                  where: { id: numericId },
                });
              }
            }
            if (!productRecord) {
              failedItems.push({ item: itemData, error: 'Product not found' });
              continue;
            }
            if (productRecord.is_active === false) {
              failedItems.push({
                item: itemData,
                error: `Product ${productRecord.name} is unavailable`,
              });
              continue;
            }
          }

          // Catalog items: force estimated_price to the catalog value.
          // Free-text items: trust the client's price but cap it.
          let estimatedPrice: number;
          if (productRecord) {
            estimatedPrice = Number(productRecord.estimated_price ?? 0);
          } else {
            const clientPrice = Number(scalarData.estimated_price ?? 0);
            if (!Number.isFinite(clientPrice) || clientPrice < 0) {
              failedItems.push({
                item: itemData,
                error: 'estimated_price must be a non-negative number',
              });
              continue;
            }
            if (clientPrice > MAX_CUSTOM_ITEM_PRICE) {
              failedItems.push({
                item: itemData,
                error: `estimated_price exceeds max of ${MAX_CUSTOM_ITEM_PRICE} for free-text items`,
              });
              continue;
            }
            if (!scalarData.product_name || typeof scalarData.product_name !== 'string') {
              failedItems.push({
                item: itemData,
                error: 'product_name required for free-text items',
              });
              continue;
            }
            estimatedPrice = clientPrice;
          }

          const orderItem: any = await strapi.entityService.create('api::order-item.order-item', {
            data: {
              ...scalarData,
              quantity,
              estimated_price: estimatedPrice,
              order: orderRecord.id,
              ...(productRecord ? { product: productRecord.id } : {}),
            },
          });

          createdItems.push(orderItem);
        } catch (error: any) {
          failedItems.push({ item: itemData, error: error.message });
        }
      }

      if (createdItems.length === 0) {
        return ctx.badRequest('No valid items to add', { failedItems });
      }

      // Recompute totals against ALL items currently attached to this order
      // (not just the ones in this batch). This is defensive: bulkCreate is
      // already restricted to brand-new pending orders so there shouldn't be
      // existing items, but querying authoritatively means we can't be
      // tricked by stale rows or future flow changes.
      const linkResult: any = await strapi.db.connection.raw(
        `SELECT order_item_id FROM order_items_order_lnk WHERE order_id = ?`,
        [orderRecord.id],
      );
      const linkRows = linkResult?.rows || linkResult || [];
      const itemIds = Array.isArray(linkRows) ? linkRows.map((r: any) => r.order_item_id) : [];
      const allOrderItems: any[] =
        itemIds.length > 0
          ? await strapi.db.query('api::order-item.order-item').findMany({
              where: { id: { $in: itemIds } },
            })
          : [];

      const subtotal = allOrderItems.reduce((sum, item) => {
        const price = Number(item.estimated_price ?? 0);
        const qty = Number(item.quantity ?? 1);
        return sum + price * qty;
      }, 0);

      if (subtotal < MIN_ORDER_SUBTOTAL) {
        // Roll back the items we just created so we don't leave a
        // half-populated order behind.
        for (const item of createdItems) {
          await strapi.entityService.delete('api::order-item.order-item', item.id).catch(() => {});
        }
        return ctx.badRequest(`Minimum order value is UGX ${MIN_ORDER_SUBTOTAL.toLocaleString()}`);
      }

      const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
      const deliveryFee = DELIVERY_FEE_FLAT;

      const paymentMethod = String(orderRecord.payment_method || 'mobileMoney');
      const pawaPayCharge = paymentMethod === 'mobileMoney' ? calculatePawaPayCharge(subtotal) : 0;
      const total = subtotal + serviceFee + deliveryFee + pawaPayCharge;
      const shouldAutoConfirm = paymentMethod === 'cashOnDelivery';
      const nextStatus = shouldAutoConfirm ? 'payment_confirmed' : 'payment_processing';

      // Single update: persist the recomputed totals AND transition the
      // order from pending to payment_confirmed in one step. After this the
      // order is locked — bulkCreate's status guard will reject any further
      // attempts to mutate items, and shoppers can claim the order.
      try {
        const deliveryCode = generateDeliveryCode();

        await strapi.entityService.update('api::order.order', orderRecord.id, {
          data: {
            subtotal,
            service_fee: serviceFee,
            delivery_fee: deliveryFee,
            total,
            status: nextStatus,
            payment_confirmed_at: shouldAutoConfirm ? new Date() : null,
            delivery_code: deliveryCode,
          },
        });

        // Create a payment record for online methods so the gateway flow has
        // a persisted payment entity to update via polling/webhooks.
        if (!shouldAutoConfirm) {
          await strapi.entityService.create('api::payment.payment', {
            data: {
              order: orderRecord.id,
              method: paymentMethod === 'card' ? 'card' : 'mobile_money',
              provider: paymentMethod === 'mobileMoney' ? 'pawapay' : 'manual',
              amount: total,
              currency: 'UGX',
              status: 'processing',
            },
          });
        }
      } catch (updateErr: any) {
        // The items are already in the DB but the order metadata didn't
        // land. Roll back the new items so the customer can retry from a
        // clean slate rather than ending up with a bricked half-order.
        for (const item of createdItems) {
          await strapi.entityService.delete('api::order-item.order-item', item.id).catch(() => {});
        }
        console.error('ERROR: Failed to finalize order after bulkCreate:', updateErr);
        return ctx.throw(500, 'Failed to finalize order');
      }

      ctx.body = {
        data: createdItems,
        meta: {
          count: createdItems.length,
          failed: failedItems.length,
          subtotal,
          service_fee: serviceFee,
          delivery_fee: deliveryFee,
          total,
          status: nextStatus,
        },
      };
    } catch (error: any) {
      console.error('ERROR: Bulk create failed:', error);
      ctx.throw(500, 'Failed to create order items in bulk');
    }
  },
}));
