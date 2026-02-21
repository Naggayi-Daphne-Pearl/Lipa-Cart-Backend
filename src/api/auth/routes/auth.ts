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
    // Auth routes require valid JWT (default auth behavior)
    { method: 'POST', path: '/auth/refresh', handler: 'auth.refresh' },
    { method: 'GET', path: '/auth/me', handler: 'auth.me' },
  ],
};
