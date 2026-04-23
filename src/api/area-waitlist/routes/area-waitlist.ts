/**
 * area-waitlist router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::area-waitlist.area-waitlist', {
  config: {
    create: {
      policies: ['api::area-waitlist.is-authenticated'],
    },
    update: {
      policies: ['api::area-waitlist.is-authenticated'],
    },
    delete: {
      policies: ['api::area-waitlist.is-authenticated'],
    },
  },
});
