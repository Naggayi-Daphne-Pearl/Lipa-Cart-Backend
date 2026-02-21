export default {
  routes: [
    // Custom endpoint: Get current user profile (requires auth)
    {
      method: 'GET',
      path: '/user/me',
      handler: 'user.me',
    },
    // Admin endpoints: User management (require authentication)
    { method: 'GET', path: '/admin/users', handler: 'admin.findAll' },
    { method: 'PUT', path: '/admin/users/:userId/role', handler: 'admin.updateRole' },
    { method: 'PATCH', path: '/admin/users/:userId/status', handler: 'admin.toggleStatus' },
    // Standard core CRUD routes (authenticated by default)
    { method: 'GET', path: '/users', handler: 'user.find' },
    { method: 'GET', path: '/users/:id', handler: 'user.findOne' },
    { method: 'POST', path: '/users', handler: 'user.create' },
    { method: 'PUT', path: '/users/:id', handler: 'user.update' },
    { method: 'DELETE', path: '/users/:id', handler: 'user.delete' },
  ],
};
