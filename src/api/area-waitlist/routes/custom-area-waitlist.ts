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
        policies: ['is-authenticated'],
      },
    },
    {
      method: 'GET',
      path: '/area-waitlist/my-entries',
      handler: 'area-waitlist.getMyWaitlist',
      config: {
        policies: ['is-authenticated'],
      },
    },
    {
      method: 'GET',
      path: '/area-waitlist/admin/all',
      handler: 'area-waitlist.getAllWaitlist',
      config: {
        policies: ['is-authenticated'],
      },
    },
    {
      method: 'POST',
      path: '/area-waitlist/admin/notify',
      handler: 'area-waitlist.notifyArea',
      config: {
        policies: ['is-authenticated'],
      },
    },
    {
      method: 'DELETE',
      path: '/area-waitlist/:id/remove',
      handler: 'area-waitlist.removeFromWaitlist',
      config: {
        policies: ['is-authenticated'],
      },
    },
  ],
};
