import { factories } from '@strapi/strapi';

type Role = 'rider' | 'shopper';

function isRole(value: unknown): value is Role {
  return value === 'rider' || value === 'shopper';
}

export default factories.createCoreController(
  'api::training-question.training-question',
  ({ strapi }) => ({
    async findForRole(ctx: any) {
      const role = ctx.query?.role;
      if (!isRole(role)) {
        return ctx.badRequest('role query param must be "rider" or "shopper"');
      }

      const questions: any[] = await strapi.db
        .query('api::training-question.training-question')
        .findMany({
          where: { role },
          orderBy: { order: 'asc' },
        });

      ctx.body = {
        data: questions.map((q) => ({
          id: q.id,
          documentId: q.documentId,
          order: q.order,
          prompt: q.prompt,
          options: {
            a: q.option_a,
            b: q.option_b,
            c: q.option_c,
          },
        })),
        meta: { count: questions.length, role },
      };
    },
  }),
);
