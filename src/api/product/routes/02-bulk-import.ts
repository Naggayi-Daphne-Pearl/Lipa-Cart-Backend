/**
 * Custom routes that live alongside the default core router. Strapi auto-loads
 * every routes file in this directory, so the core CRUD remains intact.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/products/xlsx-template',
      handler: 'product.xlsxTemplate',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/products/xlsx-export',
      handler: 'product.xlsxExport',
      config: { policies: [] },
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
