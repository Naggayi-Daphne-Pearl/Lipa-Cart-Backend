export default {
  routes: [
    // Public routes (no auth required)
    {
      method: 'POST',
      path: '/auth/signup',
      handler: 'auth.signup',
      config: {
        auth: false, // No JWT required
      },
    },
    {
      method: 'POST',
      path: '/auth/login',
      handler: 'auth.login',
      config: {
        auth: false, // No JWT required
      },
    },
    {
      method: 'POST',
      path: '/auth/admin/login',
      handler: 'auth.adminLogin',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/google-auth/signin',
      handler: 'auth.google',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/google-auth/complete-profile',
      handler: 'auth.completeCustomerProfile',
      config: {
        auth: false,
      },
    },
    // Password reset (no auth required)
    {
      method: 'POST',
      path: '/auth/forgot-password',
      handler: 'auth.forgotPassword',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/auth/reset-password',
      handler: 'auth.resetPassword',
      config: { auth: false },
    },
    // Auth routes require valid JWT (default auth behavior)
    { method: 'POST', path: '/auth/refresh', handler: 'auth.refresh', config: { auth: false } },
    { method: 'POST', path: '/auth/logout', handler: 'auth.logout', config: { auth: false } },
    { method: 'GET', path: '/auth/me', handler: 'auth.me', config: { auth: false } },
  ],
};
