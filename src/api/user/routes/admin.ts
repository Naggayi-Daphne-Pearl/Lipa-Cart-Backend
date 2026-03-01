export default {
  routes: [
    {
      method: 'GET',
      path: '/admin/users',
      handler: 'admin.findAll',
      config: {
        auth: false, // CRITICAL: Disable default middleware to allow manual JWT verification
      },
    },
    {
      method: 'PUT',
      path: '/admin/users/:userId/role',
      handler: 'admin.updateRole',
      config: {
        auth: false, // CRITICAL: Disable default middleware to allow manual JWT verification
      },
    },
    {
      method: 'PATCH',
      path: '/admin/users/:userId/status',
      handler: 'admin.toggleStatus',
      config: {
        auth: false, // CRITICAL: Disable default middleware to allow manual JWT verification
      },
    },
  ],
};
