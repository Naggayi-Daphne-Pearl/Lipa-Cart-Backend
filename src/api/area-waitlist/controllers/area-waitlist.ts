/**
 * area-waitlist controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::area-waitlist.area-waitlist', ({ strapi }) => ({
  // Join waitlist - customer requests service in their area
  async joinWaitlist(ctx) {
    try {
      const user = ctx.state.user;

      if (!user) {
        return ctx.badRequest('You must be logged in');
      }

      const { area_name, region, latitude, longitude, phone_number, email } = ctx.request.body;

      if (!area_name || !region) {
        return ctx.badRequest('area_name and region are required');
      }

      // Check if customer already joined this area
      const existing = await strapi.db.query('api::area-waitlist.area-waitlist').findOne({
        where: {
          user: {
            id: user.id,
          },
          area_name: area_name,
          region: region,
          status: {
            $ne: 'service_started',
          },
        },
      });

      if (existing) {
        return ctx.badRequest('You already joined the waitlist for this area');
      }

      // Get customer data
      const customer = await strapi.db.query('api::customer.customer').findOne({
        where: {
          user: {
            id: user.id,
          },
        },
      });

      const entry = await strapi.db.query('api::area-waitlist.area-waitlist').create({
        data: {
          customer: customer?.id,
          user: user.id,
          area_name,
          region,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          phone_number: phone_number || user.phone_number,
          email: email || user.email,
          status: 'waitlisted',
          area_priority: 'medium',
        },
      });

      ctx.created(entry);
    } catch (error) {
      ctx.internalServerError('Error joining waitlist');
    }
  },

  // Get my waitlist entries
  async getMyWaitlist(ctx) {
    try {
      const user = ctx.state.user;

      if (!user) {
        return ctx.badRequest('You must be logged in');
      }

      const entries = await strapi.db.query('api::area-waitlist.area-waitlist').findMany({
        where: {
          user: {
            id: user.id,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      ctx.send(entries);
    } catch (error) {
      ctx.internalServerError('Error fetching waitlist');
    }
  },

  // Admin: Get all waitlist entries grouped by area
  async getAllWaitlist(ctx) {
    try {
      // Check if user is admin
      const isAdmin = ctx.state.user?.role?.name === 'admin';

      if (!isAdmin) {
        return ctx.forbidden('Only admins can view all waitlist entries');
      }

      const entries = await strapi.db.query('api::area-waitlist.area-waitlist').findMany({
        where: {
          status: {
            $ne: 'service_started',
          },
        },
        populate: ['user', 'customer'],
        orderBy: { createdAt: 'desc' },
      });

      // Group by area
      const grouped = {};
      entries.forEach((entry) => {
        const key = `${entry.region}_${entry.area_name}`;
        if (!grouped[key]) {
          grouped[key] = {
            region: entry.region,
            area_name: entry.area_name,
            count: 0,
            priority: 'low',
            entries: [],
          };
        }
        grouped[key].count++;
        grouped[key].entries.push(entry);

        // Update priority based on count
        if (grouped[key].count > 10) {
          grouped[key].priority = 'high';
        } else if (grouped[key].count > 5) {
          grouped[key].priority = 'medium';
        }
      });

      ctx.send(Object.values(grouped));
    } catch (error) {
      ctx.internalServerError('Error fetching waitlist');
    }
  },

  // Admin: Mark area as service started - notify all
  async notifyArea(ctx) {
    try {
      const isAdmin = ctx.state.user?.role?.name === 'admin';

      if (!isAdmin) {
        return ctx.forbidden('Only admins can notify areas');
      }

      const { region, area_name } = ctx.request.body;

      if (!region || !area_name) {
        return ctx.badRequest('region and area_name are required');
      }

      // Get all waitlisted entries for this area
      const entries = await strapi.db.query('api::area-waitlist.area-waitlist').findMany({
        where: {
          region,
          area_name,
          status: 'waitlisted',
        },
        populate: ['user'],
      });

      // Send notification to each user
      for (const entry of entries) {
        try {
          // Create notification
          await strapi.db.query('api::notification.notification').create({
            data: {
              title: `Lipa-Cart now available in ${area_name}!`,
              body: `Great news! We've just launched service in ${area_name}. Start shopping now!`,
              type: 'system',
              user: entry.user.id,
              is_read: false,
              data: {
                region,
                area_name,
              },
            },
          });

          // Update entry status
          await strapi.db.query('api::area-waitlist.area-waitlist').update({
            where: { id: entry.id },
            data: {
              status: 'notified',
              notification_sent_at: new Date(),
            },
          });
        } catch (notifError) {
          console.error(`Failed to notify user ${entry.user.id}`, notifError);
        }
      }

      ctx.send({
        message: `Notified ${entries.length} customers in ${area_name}`,
        count: entries.length,
      });
    } catch (error) {
      ctx.internalServerError('Error notifying area');
    }
  },

  // Remove from waitlist
  async removeFromWaitlist(ctx) {
    try {
      const { id } = ctx.params;
      const user = ctx.state.user;

      // Get the entry
      const entry = await strapi.db.query('api::area-waitlist.area-waitlist').findOne({
        where: { id },
      });

      // Check ownership or admin
      if (entry.user !== user.id && user.role?.name !== 'admin') {
        return ctx.forbidden('You can only remove your own entries');
      }

      await strapi.db.query('api::area-waitlist.area-waitlist').update({
        where: { id },
        data: { status: 'inactive' },
      });

      ctx.send({ message: 'Removed from waitlist' });
    } catch (error) {
      ctx.internalServerError('Error removing from waitlist');
    }
  },
}));
