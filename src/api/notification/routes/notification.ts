export default {
  routes: [
    // Test push notification (requires auth)
    {
      method: 'GET',
      path: '/notifications/test-push',
      handler: 'notification.testPush',
    },
    // Get current user's notifications (requires auth)
    {
      method: 'GET',
      path: '/notifications/mine',
      handler: 'notification.mine',
    },
    // Mark single notification as read (requires auth)
    {
      method: 'PATCH',
      path: '/notifications/:id/read',
      handler: 'notification.markRead',
    },
    // Mark all notifications as read (requires auth)
    {
      method: 'PATCH',
      path: '/notifications/read-all',
      handler: 'notification.markAllRead',
    },
    // Standard CRUD (for admin)
    { method: 'GET', path: '/notifications', handler: 'notification.find' },
    { method: 'GET', path: '/notifications/:id', handler: 'notification.findOne' },
    { method: 'POST', path: '/notifications', handler: 'notification.create' },
    { method: 'DELETE', path: '/notifications/:id', handler: 'notification.delete' },
  ],
};
