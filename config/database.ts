import path from 'path';

export default ({ env }) => {
  const client = env('DATABASE_CLIENT', 'postgres');

  const connections = {
    postgres: {
      connection: {
        connectionString: env('DATABASE_URL'),
        ssl: {
          rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', false),
        },
        schema: env('DATABASE_SCHEMA', 'public'),
      },
      pool: {
        // 4 warm connections by default — the app fires 8+ parallel queries
        // on startup so 2 (the old default) caused queuing on cold starts.
        min: env.int('DATABASE_POOL_MIN', 4),
        max: env.int('DATABASE_POOL_MAX', 10),
        // Evict idle connections after 8 min — before Railway/Supabase's
        // ~10 min server-side idle timeout kills them underneath Knex,
        // which is what causes the ETIMEDOUT errors on cron jobs.
        idleTimeoutMillis: env.int('DATABASE_POOL_IDLE_TIMEOUT', 480000),
        // Cap how long a query waits to acquire a connection from the pool.
        acquireTimeoutMillis: env.int('DATABASE_POOL_ACQUIRE_TIMEOUT', 30000),
        // How often (ms) Knex checks the pool for connections to evict.
        reapIntervalMillis: 1000,
      },
    },
    sqlite: {
      connection: {
        filename: path.join(__dirname, '..', '..', env('DATABASE_FILENAME', '.tmp/data.db')),
      },
      useNullAsDefault: true,
    },
  };

  return {
    connection: {
      client,
      ...connections[client],
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};
