import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::shopper.shopper', ({ strapi }) => ({
  /**
   * Shopper submits their KYC documents
   * POST /api/shoppers/kyc/submit
   */
  async submitKyc(ctx: any) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      const { id_number, id_photo_url, face_photo_url } = ctx.request.body;

      // Validate required fields
      if (!id_number || !id_photo_url || !face_photo_url) {
        return ctx.badRequest('id_number, id_photo_url, and face_photo_url are required');
      }

      // Find the shopper record for this user
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: user.username },
      });

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can submit KYC');
      }

      const shopper: any = await strapi.db.query('api::shopper.shopper').findOne({
        where: { user: customUser.id },
      });

      if (!shopper) {
        return ctx.notFound('Shopper profile not found');
      }

      // Update shopper with KYC data
      const updated = await strapi.entityService.update('api::shopper.shopper', shopper.id, {
        data: {
          id_number,
          kyc_status: 'pending_review',
          kyc_submitted_at: new Date(),
        },
      });

      ctx.body = {
        data: {
          id: updated.id,
          documentId: updated.documentId,
          kyc_status: updated.kyc_status,
          kyc_submitted_at: updated.kyc_submitted_at,
        },
      };
    } catch (error) {
      console.error('KYC submission error:', error);
      ctx.throw(500, 'Failed to submit KYC');
    }
  },

  /**
   * Admin reviews and approves/rejects shopper KYC
   * PATCH /api/shoppers/:id/kyc
   */
  async reviewKyc(ctx: any) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      // Check if user is admin (you may need to adjust this based on your role implementation)
      // For now, we'll allow any authenticated user; enforce this via RBAC in routes.ts

      const { id } = ctx.params;
      const { action, rejection_reason } = ctx.request.body;

      if (!action || !['approve', 'reject'].includes(action)) {
        return ctx.badRequest('action must be "approve" or "reject"');
      }

      // Find shopper by documentId or id
      const shopper: any = await strapi.db.query('api::shopper.shopper').findOne({
        where: { documentId: id },
      });

      if (!shopper) {
        return ctx.notFound('Shopper not found');
      }

      // Update based on action
      const updateData: any = { kyc_reviewed_at: new Date() };
      if (action === 'approve') {
        updateData.kyc_status = 'approved';
        updateData.is_verified = true;
      } else {
        updateData.kyc_status = 'rejected';
        updateData.kyc_rejection_reason = rejection_reason || 'No reason provided';
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
        },
      };
    } catch (error) {
      console.error('KYC review error:', error);
      ctx.throw(500, 'Failed to review KYC');
    }
  },
}));
