/**
 * Custom routes that live alongside the default core router. Strapi auto-loads
 * every routes file in this directory, so the core CRUD remains intact.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/products/csv-template',
      handler: 'product.csvTemplate',
      config: { auth: false, policies: [] },
    },
    {
      method: 'GET',
      path: '/products/category-options',
      handler: 'product.categoryOptions',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/products/bulk-import',
      handler: 'product.bulkImport',
      config: { policies: [] },
    },
  ],
};
