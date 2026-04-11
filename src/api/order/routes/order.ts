export default {
  routes: [
    // Public guest order endpoint (no JWT required)
    {
      method: 'POST',
      path: '/orders/guest',
      handler: 'order.createGuestOrder',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Shopper workflow endpoints (auth: false — JWT verified manually in handler)
    {
      method: 'POST',
      path: '/orders/:id/claim',
      handler: 'order.claimOrder',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/orders/:id/claim',
      handler: 'order.unclaimOrder',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/orders/:id/shopper-status',
      handler: 'order.updateShopperStatus',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Rider workflow endpoints (auth: false — JWT verified manually in handler)
    {
      method: 'POST',
      path: '/orders/:id/claim-delivery',
      handler: 'order.claimDelivery',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/orders/:id/rider-status',
      handler: 'order.updateRiderStatus',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Admin confirms payment (auth: false — JWT verified manually in handler)
    {
      method: 'PATCH',
      path: '/orders/:id/confirm-payment',
      handler: 'order.confirmPayment',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Admin management endpoints (auth: false — JWT verified manually in handler)
    {
      method: 'PATCH',
      path: '/orders/:id/admin-cancel',
      handler: 'order.adminCancelOrder',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/orders/:id/reassign-shopper',
      handler: 'order.adminReassignShopper',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/orders/:id/reassign-rider',
      handler: 'order.adminReassignRider',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Standard core CRUD routes (authenticated by default)
    { method: 'GET', path: '/orders', handler: 'order.find' },
    { method: 'GET', path: '/orders/:id', handler: 'order.findOne' },
    { method: 'POST', path: '/orders', handler: 'order.create' },
    { method: 'PUT', path: '/orders/:id', handler: 'order.update' },
    { method: 'DELETE', path: '/orders/:id', handler: 'order.delete' },
  ],
};
