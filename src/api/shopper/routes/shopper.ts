export default {
  routes: [
    // Custom KYC endpoints MUST come before :id routes to avoid conflicts
    {
      method: 'POST',
      path: '/shoppers/kyc/submit',
      handler: 'shopper.submitKyc',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'PATCH',
      path: '/shoppers/:id/kyc',
      handler: 'shopper.reviewKyc',
      config: {
        auth: false,
        policies: [],
      },
    },
    // Standard core CRUD routes
    { method: 'GET', path: '/shoppers', handler: 'shopper.find' },
    { method: 'GET', path: '/shoppers/:id', handler: 'shopper.findOne' },
    { method: 'POST', path: '/shoppers', handler: 'shopper.create' },
    { method: 'PUT', path: '/shoppers/:id', handler: 'shopper.update' },
    { method: 'DELETE', path: '/shoppers/:id', handler: 'shopper.delete' },
  ],
};
