import packageJson from '../../../../package.json';

export default {
  async check(ctx: any) {
    let database = 'error';

    try {
      // Run a lightweight query to verify the DB connection is alive
      await strapi.db.connection.raw('SELECT 1');
      database = 'connected';
    } catch {
      // database remains "error"
    }

    ctx.body = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database,
      version: packageJson.version,
    };
  },
} as any;
