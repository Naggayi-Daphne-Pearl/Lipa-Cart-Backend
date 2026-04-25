import { factories } from '@strapi/strapi';

type Role = 'rider' | 'shopper';
type AnswerOption = 'a' | 'b' | 'c';

const PASS_MARK = 4;

function isRole(value: unknown): value is Role {
  return value === 'rider' || value === 'shopper';
}

function isAnswerOption(value: unknown): value is AnswerOption {
  return value === 'a' || value === 'b' || value === 'c';
}

async function getAuthenticatedCustomUser(strapi: any, ctx: any) {
  const authUser = ctx.state.user;
  if (!authUser?.username) return null;
  return strapi.db.query('api::user.user').findOne({
    where: { phone: authUser.username },
  });
}

export default factories.createCoreController(
  'api::training-attempt.training-attempt',
  ({ strapi }) => ({
    async submit(ctx: any) {
      const authUser = ctx.state.user;
      if (!authUser) {
        return ctx.unauthorized('Authentication required');
      }

      const customUser = await getAuthenticatedCustomUser(strapi, ctx);
      if (!customUser) {
        return ctx.notFound('User profile not found');
      }

      const body = ctx.request.body?.data ?? ctx.request.body ?? {};
      const role = body.role;
      const submittedAnswers = body.answers;

      if (!isRole(role)) {
        return ctx.badRequest('role must be "rider" or "shopper"');
      }
      if (customUser.user_type !== role) {
        return ctx.forbidden(
          `Cannot submit a ${role} attempt as a ${customUser.user_type ?? 'unknown'} user`,
        );
      }
      if (!submittedAnswers || typeof submittedAnswers !== 'object') {
        return ctx.badRequest('answers must be an object keyed by question id');
      }

      // Block re-submission once the user has already passed for this role.
      // Otherwise feedback (correctOption + explanation) becomes a free answer key.
      const existingPass: any = await strapi.db
        .query('api::training-attempt.training-attempt')
        .findOne({
          where: { user: customUser.id, role, passed: true },
          orderBy: { attempted_at: 'desc' },
        });
      if (existingPass) {
        return ctx.badRequest('You have already passed this training quiz.');
      }

      const questions: any[] = await strapi.db
        .query('api::training-question.training-question')
        .findMany({
          where: { role },
          orderBy: { order: 'asc' },
        });

      if (questions.length === 0) {
        return ctx.notFound(`No training questions seeded for role "${role}"`);
      }

      let score = 0;
      const feedback = questions.map((q) => {
        const submitted = submittedAnswers[q.id] ?? submittedAnswers[String(q.id)];
        const submittedNormalized = isAnswerOption(submitted) ? submitted : null;
        const correct = submittedNormalized === q.correct_option;
        if (correct) score += 1;
        return {
          questionId: q.id,
          submitted: submittedNormalized,
          correct,
          correctOption: q.correct_option,
          explanation: q.explanation,
        };
      });

      const total = questions.length;
      const passed = score >= PASS_MARK;

      const attempt: any = await strapi.db.query('api::training-attempt.training-attempt').create({
        data: {
          user: customUser.id,
          role,
          score,
          total,
          passed,
          answers: submittedAnswers,
          attempted_at: new Date(),
        },
      });

      if (passed) {
        try {
          const profile: any = await strapi.db.query(`api::${role}.${role}`).findOne({
            where: { user: customUser.id },
            select: ['id', 'training_completed_at'],
          });

          if (profile && !profile.training_completed_at) {
            await strapi.db.query(`api::${role}.${role}`).update({
              where: { id: profile.id },
              data: { training_completed_at: new Date() },
            });
          }
        } catch (err: any) {
          strapi.log.warn(
            `[training-attempt.submit] Could not flip training_completed_at for ${role} user ${customUser.id}: ${err?.message || err}`,
          );
        }
      }

      ctx.body = {
        data: {
          id: attempt.id,
          documentId: attempt.documentId,
          role,
          score,
          total,
          passed,
          passMark: PASS_MARK,
          feedback,
        },
      };
    },

    async status(ctx: any) {
      const authUser = ctx.state.user;
      if (!authUser) {
        return ctx.unauthorized('Authentication required');
      }

      const customUser = await getAuthenticatedCustomUser(strapi, ctx);
      if (!customUser) {
        return ctx.notFound('User profile not found');
      }

      const role = customUser.user_type;
      if (!isRole(role)) {
        ctx.body = { data: { passed: false, completed_at: null, role: role ?? null } };
        return;
      }

      const earliestPass: any = await strapi.db
        .query('api::training-attempt.training-attempt')
        .findOne({
          where: { user: customUser.id, role, passed: true },
          orderBy: { attempted_at: 'asc' },
        });

      ctx.body = {
        data: {
          role,
          passed: Boolean(earliestPass),
          completed_at: earliestPass?.attempted_at ?? null,
        },
      };
    },
  }),
);
