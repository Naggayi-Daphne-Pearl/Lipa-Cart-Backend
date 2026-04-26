import { factories } from '@strapi/strapi';
import { firstInvalidUrl } from '../../../services/upload-url-allowlist';

export default factories.createCoreController('api::shopper.shopper', ({ strapi }) => ({
  /**
   * Shopper submits their KYC documents
   * POST /api/shoppers/kyc/submit
   */
  async submitKyc(ctx: any) {
    try {
      // Manual JWT verification (auth: false on route)
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let user;
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        user = await strapi
          .query('plugin::users-permissions.user')
          .findOne({ where: { id: payload.id } });
      } catch (err) {
        return ctx.unauthorized('Invalid or expired token');
      }
      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      const {
        id_number,
        id_photo_url,
        face_photo_url,
        mobile_money_provider,
        mobile_money_number,
        bank_name,
        bank_account_name,
        bank_account_number,
        emergency_contact_name,
        emergency_contact_phone,
      } = ctx.request.body;

      // Validate required fields
      if (!id_number || !id_photo_url || !face_photo_url) {
        return ctx.badRequest('id_number, id_photo_url, and face_photo_url are required');
      }

      const badField = firstInvalidUrl({ id_photo_url, face_photo_url });
      if (badField) {
        return ctx.badRequest(`${badField} must be a Cloudinary URL uploaded through this app`);
      }

      // Find the custom user record for this user
      // Try matching by phone (username) first, then by email
      let customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: user.username },
      });

      // If not found by phone, try by email or other identifiers
      if (!customUser) {
        customUser = await strapi.db.query('api::user.user').findOne({
          where: { phone: user.email },
        });
      }

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden(
          `Only shoppers can submit KYC. User type: ${customUser?.user_type || 'not found'}`,
        );
      }

      // Find shopper record via the link table (Strapi v5 uses shoppers_user_lnk)
      let shopper: any = null;
      try {
        // Query the link table directly to find the shopper_id for this user
        const linkResult: any = await strapi.db.connection.raw(
          `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`,
          [customUser.id],
        );
        const rows = linkResult?.rows || linkResult;
        if (rows && rows.length > 0) {
          const shopperId = rows[0].shopper_id;
          shopper = await strapi.db.query('api::shopper.shopper').findOne({
            where: { id: shopperId },
          });
        }
      } catch (linkErr: any) {}

      // Fallback: query all shoppers with populate and match
      if (!shopper) {
        const allShoppers: any = await strapi.db.query('api::shopper.shopper').findMany({
          populate: ['user'],
          limit: 200,
        });
        shopper = allShoppers.find(
          (s: any) => s.user?.id === customUser.id || s.user?.documentId === customUser.documentId,
        );
      }

      if (!shopper) {
        // Auto-create shopper record if it doesn't exist
        try {
          const newShopper = await strapi.entityService.create('api::shopper.shopper', {
            data: {
              user: customUser.documentId,
              kyc_status: 'not_submitted',
            } as any,
          });
          shopper = newShopper;
        } catch (createErr: any) {
          console.error('KYC submit - failed to create shopper:', createErr?.message || createErr);
          return ctx.badRequest(
            `Failed to create shopper profile: ${createErr?.message || 'Unknown error'}`,
          );
        }
      }

      // Update shopper with KYC data using documentId (Strapi v5 requirement)
      const shopperDocId = shopper.documentId || shopper.id;

      // Build update data with optional payment & contact fields
      const kycUpdateData: any = {
        id_number,
        id_photo_url,
        face_photo_url,
        kyc_status: 'pending_review',
        kyc_submitted_at: new Date(),
      };
      if (mobile_money_provider) kycUpdateData.mobile_money_provider = mobile_money_provider;
      if (mobile_money_number) kycUpdateData.mobile_money_number = mobile_money_number;
      if (bank_name) kycUpdateData.bank_name = bank_name;
      if (bank_account_name) kycUpdateData.bank_account_name = bank_account_name;
      if (bank_account_number) kycUpdateData.bank_account_number = bank_account_number;
      if (emergency_contact_name) kycUpdateData.emergency_contact_name = emergency_contact_name;
      if (emergency_contact_phone) kycUpdateData.emergency_contact_phone = emergency_contact_phone;

      try {
        const updated = await strapi.documents('api::shopper.shopper').update({
          documentId: shopperDocId,
          data: kycUpdateData,
        });

        ctx.body = {
          data: {
            id: updated.id,
            documentId: updated.documentId,
            kyc_status: updated.kyc_status,
            kyc_submitted_at: updated.kyc_submitted_at,
          },
        };
      } catch (updateErr: any) {
        console.error('KYC submit - update failed:', updateErr?.message || updateErr);
        // Fallback: try entityService.update with numeric id
        try {
          const updated = await strapi.entityService.update('api::shopper.shopper', shopper.id, {
            data: kycUpdateData,
          });

          ctx.body = {
            data: {
              id: updated.id,
              documentId: updated.documentId,
              kyc_status: updated.kyc_status,
              kyc_submitted_at: updated.kyc_submitted_at,
            },
          };
        } catch (fallbackErr: any) {
          console.error(
            'KYC submit - fallback update also failed:',
            fallbackErr?.message || fallbackErr,
          );
          return ctx.badRequest(`Failed to update KYC: ${fallbackErr?.message || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      console.error('KYC submission error:', error?.message || error);
      ctx.throw(500, `Failed to submit KYC: ${error?.message || 'Unknown error'}`);
    }
  },

  /**
   * Admin reviews and approves/rejects shopper KYC
   * PATCH /api/shoppers/:id/kyc
   */
  async reviewKyc(ctx: any) {
    try {
      // Manual JWT verification (auth: false on route)
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let reviewUser: any;
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        reviewUser = await strapi
          .query('plugin::users-permissions.user')
          .findOne({ where: { id: payload.id } });
        if (!reviewUser) {
          return ctx.unauthorized('Authentication required');
        }
      } catch (err) {
        return ctx.unauthorized('Invalid or expired token');
      }

      // Verify the user is an admin
      const adminUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: reviewUser.username },
      });

      if (!adminUser || adminUser.user_type !== 'admin') {
        return ctx.forbidden('Only admins can review KYC submissions');
      }

      const { id } = ctx.params;
      const { action, rejection_reason, admin_notes, fields_to_resubmit } = ctx.request.body ?? {};

      const ALLOWED_ACTIONS = ['approve', 'reject', 'request_more_info'];
      if (!action || !ALLOWED_ACTIONS.includes(action)) {
        return ctx.badRequest('action must be "approve", "reject", or "request_more_info"');
      }

      if (action === 'request_more_info') {
        if (!Array.isArray(fields_to_resubmit) || fields_to_resubmit.length === 0) {
          return ctx.badRequest(
            'fields_to_resubmit (non-empty array) is required for request_more_info',
          );
        }
      }

      const shopper: any = await strapi.db.query('api::shopper.shopper').findOne({
        where: { documentId: id },
        populate: ['user'],
      });

      if (!shopper) {
        return ctx.notFound('Shopper not found');
      }

      const updateData: any = { kyc_reviewed_at: new Date() };
      if (action === 'approve') {
        updateData.kyc_status = 'approved';
        updateData.is_verified = true;
        updateData.kyc_rejection_reason = null;
        updateData.kyc_more_info_requested_fields = null;
      } else if (action === 'reject') {
        updateData.kyc_status = 'rejected';
        updateData.is_verified = false;
        updateData.kyc_rejection_reason = rejection_reason || 'No reason provided';
        updateData.kyc_more_info_requested_fields = null;
      } else {
        updateData.kyc_status = 'more_info_requested';
        updateData.is_verified = false;
        updateData.kyc_rejection_reason = rejection_reason || null;
        updateData.kyc_more_info_requested_fields = fields_to_resubmit;
      }

      if (typeof admin_notes === 'string') {
        updateData.kyc_admin_notes = admin_notes;
      }

      const updated = await strapi.entityService.update('api::shopper.shopper', shopper.id, {
        data: updateData,
      });

      ctx.body = {
        data: {
          id: updated.id,
          documentId: updated.documentId,
          kyc_status: updated.kyc_status,
          is_verified: updated.is_verified,
          kyc_reviewed_at: updated.kyc_reviewed_at,
          kyc_rejection_reason: updated.kyc_rejection_reason ?? null,
          kyc_more_info_requested_fields: updated.kyc_more_info_requested_fields ?? null,
        },
      };
    } catch (error) {
      console.error('KYC review error:', error);
      ctx.throw(500, 'Failed to review KYC');
    }
  },
}));
