export default {
  routes: [
    {
      method: 'POST',
      path: '/shopping-lists/:listId/items',
      handler: 'shopping-list.addItem',
      config: {
        auth: false,
      },
    },
    {
      method: 'DELETE',
      path: '/shopping-lists/:listId/items/:itemIndex',
      handler: 'shopping-list.removeItem',
      config: {
        auth: false,
      },
    },
    {
      method: 'PATCH',
      path: '/shopping-lists/:listId/items/:itemIndex',
      handler: 'shopping-list.updateItem',
      config: {
        auth: false,
      },
    },
    {
      method: 'PATCH',
      path: '/shopping-lists/:listId/items/:itemIndex/toggle',
      handler: 'shopping-list.toggleItemChecked',
      config: {
        auth: false,
      },
    },
  ],
};
