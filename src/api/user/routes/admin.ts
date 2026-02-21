export default {
  routes: [
    {
      method: 'GET',
      path: '/admin/users',
      handler: 'admin.findAll',
    },
    {
      method: 'PUT',
      path: '/admin/users/:userId/role',
      handler: 'admin.updateRole',
    },
    {
      method: 'PATCH',
      path: '/admin/users/:userId/status',
      handler: 'admin.toggleStatus',
    },
  ],
};
