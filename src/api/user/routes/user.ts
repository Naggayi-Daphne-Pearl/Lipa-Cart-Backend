export default {
  routes: [
    // Register FCM device token for push notifications (manual JWT check)
    {
      method: 'POST',
      path: '/user/register-device',
      handler: 'user.registerDevice',
      config: { auth: false },
    },
    // Delete user account (manual JWT check)
    {
      method: 'DELETE',
      path: '/user/delete-account',
      handler: 'user.deleteAccount',
      config: { auth: false },
    },
    // Change phone number with OTP verification (manual JWT check)
    {
      method: 'POST',
      path: '/user/change-phone',
      handler: 'user.changePhone',
      config: { auth: false },
    },
    // Get current user profile (manual JWT check)
    {
      method: 'GET',
      path: '/user/me',
      handler: 'user.me',
      config: { auth: false },
    },
    // Admin endpoints: User management (manually check auth inside handler)
    {
      method: 'GET',
      path: '/admin/users',
      handler: 'admin.findAll',
      config: {
        auth: false, // Manual auth check in handler
      },
    },
    {
      method: 'PUT',
      path: '/admin/users/:userId',
      handler: 'admin.updateUser',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/admin/users/:userId/role',
      handler: 'admin.updateRole',
      config: {
        auth: false,
      },
    },
    {
      method: 'PATCH',
      path: '/admin/users/:userId/status',
      handler: 'admin.toggleStatus',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/admin/stats',
      handler: 'admin.getStats',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/admin/create-staff',
      handler: 'admin.createStaff',
      config: {
        auth: false,
      },
    },
    // Standard core CRUD routes (authenticated by default)
    { method: 'GET', path: '/users', handler: 'user.find' },
    { method: 'GET', path: '/users/:id', handler: 'user.findOne' },
    { method: 'POST', path: '/users', handler: 'user.create' },
    { method: 'PUT', path: '/users/:id', handler: 'user.update' },
    { method: 'DELETE', path: '/users/:id', handler: 'user.delete' },
  ],
};
