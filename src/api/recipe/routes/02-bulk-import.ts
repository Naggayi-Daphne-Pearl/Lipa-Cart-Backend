export default {
  routes: [
    {
      method: 'GET',
      path: '/recipes/xlsx-template',
      handler: 'recipe.xlsxTemplate',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/recipes/xlsx-export',
      handler: 'recipe.xlsxExport',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/recipes/bulk-import',
      handler: 'recipe.bulkImport',
      config: { policies: [] },
    },
  ],
};
