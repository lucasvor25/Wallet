import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
    PORT: Joi.number().default(3000),
    DATABASE_HOST: Joi.string().required(),
    DATABASE_PORT: Joi.number().default(5432),
    DATABASE_USER: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().required(),
    DATABASE_NAME: Joi.string().required(),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRES_IN: Joi.string().default('15m'),
    MAX_TRANSFER_CENTS: Joi.number().integer().positive().default(5_000_000),
    REVERSAL_WINDOW_HOURS: Joi.number().positive().default(72),
    IDEMPOTENCY_TTL_HOURS: Joi.number().positive().default(24),
    LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
});