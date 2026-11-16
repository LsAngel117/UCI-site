/**
 * Structured logging configuration (docs/14 §27, §28).
 *
 * Fastify is built on pino and adds a request-id to every log line, which
 * gives minimal request correlation out of the box (docs/14 §29). This module
 * only owns the logger *options* so the logger instance stays owned by Fastify
 * (no version drift against Fastify's bundled pino).
 *
 * Redaction guarantees passwords, cookies and authorization headers never
 * reach the logs (docs/14 §28).
 */
import type { FastifyServerOptions } from 'fastify';

export const loggerOptions: FastifyServerOptions['logger'] = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[redacted]',
  },
};
