export default {
  routes: [
    // Validate promo code (requires auth)
    {
      method: 'POST',
      path: '/promo-codes/validate',
      handler: 'promo-code.validate',
    },
    // Standard CRUD (for admin)
    { method: 'GET', path: '/promo-codes', handler: 'promo-code.find' },
    { method: 'GET', path: '/promo-codes/:id', handler: 'promo-code.findOne' },
    { method: 'POST', path: '/promo-codes', handler: 'promo-code.create' },
    { method: 'PUT', path: '/promo-codes/:id', handler: 'promo-code.update' },
    { method: 'DELETE', path: '/promo-codes/:id', handler: 'promo-code.delete' },
  ],
};
