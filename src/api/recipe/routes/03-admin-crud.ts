export default {
  routes: [
    {
      method: 'GET',
      path: '/admin/recipes',
      handler: 'recipe.adminList',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin/recipes/:id',
      handler: 'recipe.adminFindOne',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin/recipes',
      handler: 'recipe.adminCreate',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin/recipes/:id',
      handler: 'recipe.adminUpdate',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin/recipes/:id',
      handler: 'recipe.adminDelete',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
