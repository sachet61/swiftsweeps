import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from '../logging/logger.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export function createRequestContextMiddleware(logger: Logger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startNs = process.hrtime.bigint();
    const trustProxyEnabled = Boolean(req.app.get('trust proxy'));
    const incomingId = req.header('x-request-id')?.trim();

    const requestId =
      trustProxyEnabled && incomingId && SAFE_REQUEST_ID_PATTERN.test(incomingId)
        ? incomingId
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startNs) / 1_000_000;
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  };
}
