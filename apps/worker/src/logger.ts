import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'nosion-worker' },
  redact: { paths: ['password', '*.password', 'token', '*.token'], censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
