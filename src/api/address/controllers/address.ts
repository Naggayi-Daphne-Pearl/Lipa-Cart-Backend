import { factories } from '@strapi/strapi';
import { checkServiceArea } from '../../../services/service-area';

/**
 * Reject *create* payloads that would silently break checkout downstream.
 *
 * The order.create flow (and the service-area middleware) requires every
 * address to have non-empty text + valid GPS coordinates inside the delivery
 * zone. Strapi's schema-level `required: true` only checks presence, not
 * non-empty strings, and gps_lat/gps_lng aren't required at the schema level
 * because we sometimes seed addresses without them. Enforce the full contract
 * here so a partially-filled form can never produce an unusable record.
 *
 * Returns null when valid; otherwise an error message ready for ctx.badRequest.
 */
function validateAddressPayload(data: any): string | null {
  const addressLine = typeof data?.address_line === 'string' ? data.address_line.trim() : '';
  if (addressLine.length === 0) {
    return 'address_line is required';
  }
  const city = typeof data?.city === 'string' ? data.city.trim() : '';
  if (city.length === 0) {
    return 'city is required';
  }

  const lat =
    typeof data?.gps_lat === 'number'
      ? data.gps_lat
      : Number.parseFloat(String(data?.gps_lat ?? ''));
  const lng =
    typeof data?.gps_lng === 'number'
      ? data.gps_lng
      : Number.parseFloat(String(data?.gps_lng ?? ''));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'gps_lat and gps_lng are required — drop a map pin before saving the address';
  }

  const areaCheck = checkServiceArea(lat, lng);
  if (!areaCheck.ok) {
    return areaCheck.reason;
  }
  return null;
}

/**
 * Reject *update* patches that would silently break a previously-valid record
 * — but only on fields the caller actually touched.
 *
 * Validating the merged record (existing + patch) on every PATCH would lock
 * customers out of legacy addresses created before this validator existed:
 * any record missing city or GPS would become un-editable for unrelated
 * fields like label / landmark / delivery_instructions. Patch-only validation
 * preserves the "no silent hollowing-out" intent (can't blank out
 * address_line, can't null-out one of the two GPS coords) without trapping
 * users on legacy data they didn't create.
 *
 * Returns null when valid; otherwise an error message.
 */
function validateAddressPatch(patch: any): string | null {
  if (patch == null) return null;

  if ('address_line' in patch) {
    const v = typeof patch.address_line === 'string' ? patch.address_line.trim() : '';
    if (v.length === 0) {
      return 'address_line cannot be empty';
    }
  }

  if ('city' in patch) {
    const v = typeof patch.city === 'string' ? patch.city.trim() : '';
    if (v.length === 0) {
      return 'city cannot be empty';
    }
  }

  // GPS is a pair: touching either coord requires both to be valid and inside
  // the service area, so we never end up with a half-pinned record.
  const touchesLat = 'gps_lat' in patch;
  const touchesLng = 'gps_lng' in patch;
  if (touchesLat || touchesLng) {
    const lat =
      typeof patch.gps_lat === 'number'
        ? patch.gps_lat
        : Number.parseFloat(String(patch.gps_lat ?? ''));
    const lng =
      typeof patch.gps_lng === 'number'
        ? patch.gps_lng
        : Number.parseFloat(String(patch.gps_lng ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return 'gps_lat and gps_lng must both be valid numbers when updating the map pin';
    }
    const areaCheck = checkServiceArea(lat, lng);
    if (!areaCheck.ok) {
      return areaCheck.reason;
    }
  }
  return null;
}

// Module-level helpers — kept outside the controller object so they don't have
// to conform to Strapi's `(ctx) => Promise` controller handler signature.
async function resolveCustomer(strapi: any, ctx: any) {
  const user = ctx.state.user;
  if (!user) {
    return null;
  }

  const userProfiles: any = await strapi.entityService.findMany('api::user.user', {
    filters: { phone: user.username },
    limit: 1,
  });

  if (!userProfiles || userProfiles.length === 0) {
    return null;
  }

  const customUserProfile = userProfiles[0];

  const customers: any = await strapi.entityService.findMany('api::customer.customer', {
    filters: { user: customUserProfile.id } as any,
    limit: 1,
  });

  if (!customers || customers.length === 0) {
    return null;
  }

  return customers[0];
}

async function findAddressRecord(strapi: any, idOrDocumentId: string) {
  const byDocumentId: any = await strapi.db.query('api::address.address').findOne({
    where: { documentId: idOrDocumentId },
    populate: ['customer'],
  });

  if (byDocumentId) {
    return byDocumentId;
  }

  const asNumericId = Number.parseInt(idOrDocumentId, 10);
  if (Number.isFinite(asNumericId)) {
    return strapi.db.query('api::address.address').findOne({
      where: { id: asNumericId },
      populate: ['customer'],
    });
  }

  return null;
}

export default factories.createCoreController('api::address.address', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in to create an address');
    }

    const roleType = user.role?.type;
    if (roleType !== 'customer' && roleType !== 'admin') {
      return ctx.forbidden('Only customers can manage addresses');
    }

    const validationError = validateAddressPayload(ctx.request.body?.data);
    if (validationError) {
      strapi.log.warn(`[address.create] reject: ${validationError} user=${user.id}`);
      return ctx.badRequest(validationError);
    }

    if (roleType === 'admin') {
      return super.create(ctx);
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    ctx.request.body.data.customer = customer.id;

    return super.create(ctx);
  },

  async find(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to view addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.find(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can view their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existingFilters = (ctx.query.filters || {}) as Record<string, any>;
    ctx.query.filters = {
      ...existingFilters,
      customer: { id: { $eq: customer.id } },
    };

    return super.find(ctx);
  },

  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to view addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.findOne(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can view their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    if (existing.customer?.id !== customer.id) {
      return ctx.forbidden('You can only access your own address');
    }

    return super.findOne(ctx);
  },

  async update(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to update addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.update(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can update their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    if (existing.customer?.id !== customer.id) {
      return ctx.forbidden('You can only update your own address');
    }

    if (!ctx.request.body.data) {
      ctx.request.body.data = {};
    }
    ctx.request.body.data.customer = customer.id;

    // Patch-level validation: only inspect fields the caller submitted. This
    // preserves the "no silent hollowing-out" intent (can't blank out
    // address_line, can't half-pin GPS) while letting customers edit unrelated
    // fields on legacy records that pre-date the GPS-required contract.
    const validationError = validateAddressPatch(ctx.request.body.data);
    if (validationError) {
      strapi.log.warn(
        `[address.update] reject: ${validationError} user=${user.id} address=${existing.id}`,
      );
      return ctx.badRequest(validationError);
    }

    return super.update(ctx);
  },

  async setDefault(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to set a default address');
    }

    const roleType = user.role?.type;
    if (roleType !== 'customer' && roleType !== 'admin') {
      return ctx.forbidden('Only customers can set a default address');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    // Determine whose defaults to flip. Customers only act on their own
    // addresses; admins scope the transaction to the address's owning
    // customer (admins don't have a customer profile themselves, so we
    // can't and shouldn't call resolveCustomer for them).
    let customerId: number | null = null;
    if (roleType === 'admin') {
      customerId = existing.customer?.id ?? null;
      if (!customerId) {
        return ctx.badRequest('Address is not linked to a customer');
      }
    } else {
      const customer = await resolveCustomer(strapi, ctx);
      if (!customer) {
        return ctx.badRequest('No customer profile found for this user');
      }
      if (existing.customer?.id !== customer.id) {
        return ctx.forbidden('You can only set your own address as default');
      }
      customerId = customer.id;
    }

    // Atomically flip the default flag: clear all of this customer's defaults
    // and set the target one inside a single transaction so partial failures
    // can't leave the customer with zero or two defaults.
    try {
      const ownedAddresses: any[] = await strapi.db.query('api::address.address').findMany({
        where: { customer: customerId },
        select: ['id'],
      });
      const otherIds = ownedAddresses.map((a) => a.id).filter((id) => id !== existing.id);

      await strapi.db.connection.transaction(async (trx: any) => {
        if (otherIds.length > 0) {
          await trx('addresses')
            .whereIn('id', otherIds)
            .update({ is_default: false, updated_at: new Date().toISOString() });
        }
        await trx('addresses')
          .where({ id: existing.id })
          .update({ is_default: true, updated_at: new Date().toISOString() });
      });
    } catch (err: any) {
      strapi.log.error(`[address] setDefault failed: ${err?.message}`);
      return ctx.internalServerError('Failed to set default address');
    }

    const updated: any = await strapi.entityService.findOne('api::address.address', existing.id, {
      populate: { customer: true },
    });

    return { data: updated };
  },

  async delete(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to delete addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.delete(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can delete their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    if (existing.customer?.id !== customer.id) {
      return ctx.forbidden('You can only delete your own address');
    }

    return super.delete(ctx);
  },
}));
