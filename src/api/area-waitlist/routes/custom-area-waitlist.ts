/**
 * area-waitlist custom routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/area-waitlist/join',
      handler: 'area-waitlist.joinWaitlist',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/area-waitlist/my-entries',
      handler: 'area-waitlist.getMyWaitlist',
      config: {},
    },
    {
      method: 'GET',
      path: '/area-waitlist/admin/all',
      handler: 'area-waitlist.getAllWaitlist',
      config: {},
    },
    {
      method: 'POST',
      path: '/area-waitlist/admin/notify',
      handler: 'area-waitlist.notifyArea',
      config: {},
    },
    {
      method: 'DELETE',
      path: '/area-waitlist/:id/remove',
      handler: 'area-waitlist.removeFromWaitlist',
      config: {},
    },
  ],
};
