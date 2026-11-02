import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('60m'),
  MAX_TRANSFER_CENTS: Joi.number().integer().positive().default(5_000_000),
  REVERSAL_WINDOW_HOURS: Joi.number().positive().default(72),
  IDEMPOTENCY_TTL_HOURS: Joi.number().positive().default(24),
  SEED_USER_PASSWORD: Joi.string().optional(),
  THROTTLE_TTL_MS: Joi.number().integer().positive().default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),
  LOG_PRETTY: Joi.boolean().default(false),
  THROTTLE_DISABLED: Joi.boolean()
    .default(false)
    .when('NODE_ENV', { is: 'production', then: Joi.boolean().valid(false) }),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
});
