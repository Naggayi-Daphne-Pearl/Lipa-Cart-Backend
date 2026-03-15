import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::rider.rider', ({ strapi }) => ({
  /**
   * Rider submits their KYC documents
   * POST /api/riders/kyc/submit
   */
  async submitKyc(ctx: any) {
    try {
      // Manual JWT verification
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let user;
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
      } catch (err) {
        return ctx.unauthorized('Invalid or expired token');
      }
      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      const {
        id_number, id_photo_url, face_photo_url,
        vehicle_type, vehicle_make, vehicle_plate,
        license_number, license_photo_url,
        mobile_money_provider, mobile_money_number,
        bank_name, bank_account_name, bank_account_number,
        emergency_contact_name, emergency_contact_phone,
      } = ctx.request.body;

      // Validate required fields
      if (!id_number || !id_photo_url || !face_photo_url) {
        return ctx.badRequest('id_number, id_photo_url, and face_photo_url are required');
      }

      if (!vehicle_type || !license_number) {
        return ctx.badRequest('vehicle_type and license_number are required');
      }

      console.log('Rider KYC submit - JWT user:', { id: user.id, username: user.username });

      // Find the custom user record
      let customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: user.username },
      });

      if (!customUser) {
        customUser = await strapi.db.query('api::user.user').findOne({
          where: { phone: user.email },
        });
      }

      if (!customUser || customUser.user_type !== 'rider') {
        return ctx.forbidden(`Only riders can submit rider KYC. User type: ${customUser?.user_type || 'not found'}`);
      }

      // Find rider record via link table
      let rider: any = null;
      try {
        const linkResult: any = await strapi.db.connection.raw(
          `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`,
          [customUser.id]
        );
        const rows = linkResult?.rows || linkResult;
        if (rows && rows.length > 0) {
          rider = await strapi.db.query('api::rider.rider').findOne({
            where: { id: rows[0].rider_id },
          });
        }
      } catch (linkErr: any) {
        console.log('Rider KYC submit - link table query failed:', linkErr?.message);
      }

      // Fallback: populate and match
      if (!rider) {
        const allRiders: any = await strapi.db.query('api::rider.rider').findMany({
          populate: ['user'],
          limit: 200,
        });
        rider = allRiders.find((r: any) =>
          r.user?.id === customUser.id ||
          r.user?.documentId === customUser.documentId
        );
      }

      if (!rider) {
        // Auto-create rider record
        console.log('Rider KYC submit - creating rider record for:', customUser.documentId);
        try {
          rider = await strapi.entityService.create('api::rider.rider', {
            data: {
              user: customUser.documentId,
              kyc_status: 'not_submitted',
            } as any,
          });
        } catch (createErr: any) {
          console.error('Rider KYC submit - failed to create rider:', createErr?.message);
          return ctx.badRequest(`Failed to create rider profile: ${createErr?.message}`);
        }
      }

      // Build update data
      const kycUpdateData: any = {
        id_number,
        id_photo_url,
        face_photo_url,
        vehicle_type,
        license_number,
        kyc_status: 'pending_review',
        kyc_submitted_at: new Date(),
      };
      if (vehicle_make) kycUpdateData.vehicle_make = vehicle_make;
      if (vehicle_plate) kycUpdateData.vehicle_plate = vehicle_plate;
      if (license_photo_url) kycUpdateData.license_photo_url = license_photo_url;
      if (mobile_money_provider) kycUpdateData.mobile_money_provider = mobile_money_provider;
      if (mobile_money_number) kycUpdateData.mobile_money_number = mobile_money_number;
      if (bank_name) kycUpdateData.bank_name = bank_name;
      if (bank_account_name) kycUpdateData.bank_account_name = bank_account_name;
      if (bank_account_number) kycUpdateData.bank_account_number = bank_account_number;
      if (emergency_contact_name) kycUpdateData.emergency_contact_name = emergency_contact_name;
      if (emergency_contact_phone) kycUpdateData.emergency_contact_phone = emergency_contact_phone;

      const riderDocId = rider.documentId || rider.id;

      try {
        const updated = await strapi.documents('api::rider.rider').update({
          documentId: riderDocId,
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
        console.error('Rider KYC submit - update failed:', updateErr?.message);
        try {
          const updated = await strapi.entityService.update('api::rider.rider', rider.id, {
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
          console.error('Rider KYC submit - fallback also failed:', fallbackErr?.message);
          return ctx.badRequest(`Failed to update KYC: ${fallbackErr?.message}`);
        }
      }
    } catch (error: any) {
      console.error('Rider KYC submission error:', error?.message || error);
      ctx.throw(500, `Failed to submit KYC: ${error?.message || 'Unknown error'}`);
    }
  },

  /**
   * Admin reviews and approves/rejects rider KYC
   * PATCH /api/riders/:id/kyc
   */
  async reviewKyc(ctx: any) {
    try {
      // Manual JWT verification
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let reviewUser: any;
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        reviewUser = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
        if (!reviewUser) return ctx.unauthorized('Authentication required');
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
      const { action, rejection_reason } = ctx.request.body;

      if (!action || !['approve', 'reject'].includes(action)) {
        return ctx.badRequest('action must be "approve" or "reject"');
      }

      const rider: any = await strapi.db.query('api::rider.rider').findOne({
        where: { documentId: id },
      });

      if (!rider) {
        return ctx.notFound('Rider not found');
      }

      const updateData: any = { kyc_reviewed_at: new Date() };
      if (action === 'approve') {
        updateData.kyc_status = 'approved';
        updateData.is_verified = true;
      } else {
        updateData.kyc_status = 'rejected';
        updateData.kyc_rejection_reason = rejection_reason || 'No reason provided';
      }

      const updated = await strapi.entityService.update('api::rider.rider', rider.id, {
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
      console.error('Rider KYC review error:', error);
      ctx.throw(500, 'Failed to review rider KYC');
    }
  },
}));
