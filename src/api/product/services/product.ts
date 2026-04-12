import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ApplicationError } = errors;

export default factories.createCoreService('api::product.product', ({ strapi }) => ({
  async delete(entityId: any, opts = {}) {
    const numericId = Number(entityId);

    // Check recipe ingredients that still reference this product.
    const recipes = await strapi.entityService.findMany('api::recipe.recipe', {
      populate: {
        ingredients: {
          populate: { product: true },
        },
      },
      limit: 1000,
    } as any);

    const recipeRefs = (recipes as any[]).filter((recipe) => {
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      return ingredients.some((ing: any) => {
        const p = ing?.product;
        const pid = typeof p === 'object' ? p?.id : p;
        return Number(pid) === numericId;
      });
    });

    if (recipeRefs.length > 0) {
      throw new ApplicationError(
        `Cannot delete product: it is used in ${recipeRefs.length} recipe(s). Remove it from recipes first.`,
      );
    }

    // Check shopping-list items that still reference this product.
    const shoppingLists = await strapi.entityService.findMany('api::shopping-list.shopping-list', {
      populate: {
        items: {
          populate: { product: true },
        },
      },
      limit: 1000,
    } as any);

    const listRefs = (shoppingLists as any[]).filter((list) => {
      const items = Array.isArray(list.items) ? list.items : [];
      return items.some((item: any) => {
        const p = item?.product;
        const pid = typeof p === 'object' ? p?.id : p;
        return Number(pid) === numericId;
      });
    });

    if (listRefs.length > 0) {
      throw new ApplicationError(
        `Cannot delete product: it is used in ${listRefs.length} shopping list(s). Remove it from lists first.`,
      );
    }

    return super.delete(entityId, opts);
  },
}));
