import * as Sentry from '@sentry/node';

export default (_config: any, _opts: any) => {
  return async (ctx: any, next: any) => {
    try {
      await next();
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  };
};
