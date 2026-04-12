import { factories } from '@strapi/strapi';

const defaultRecipePopulate = {
  image: true,
  ingredients: {
    populate: {
      product: {
        populate: { image: true },
      },
    },
  },
  instructions: true,
};

export default factories.createCoreController('api::recipe.recipe', () => ({
  async find(ctx) {
    ctx.query = ctx.query || {};
    if (!(ctx.query as any).populate) {
      (ctx.query as any).populate = defaultRecipePopulate as any;
    }

    return super.find(ctx);
  },

  async findOne(ctx) {
    ctx.query = ctx.query || {};
    if (!(ctx.query as any).populate) {
      (ctx.query as any).populate = defaultRecipePopulate as any;
    }

    return super.findOne(ctx);
  },
}));
