import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ServerConfig } from '../config/env.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createSecurityMiddleware(config: ServerConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader('Cache-Control', 'no-store');

    const rawOrigin = req.header('origin')?.trim();
    if (!rawOrigin) {
      next();
      return;
    }

    if (rawOrigin === config.appOrigin) {
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Origin', config.appOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Request-Id',
      );

      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
      return;
    }

    if (req.method === 'OPTIONS' || MUTATING_METHODS.has(req.method)) {
      res.status(403).json({
        error: {
          code: 'ORIGIN_FORBIDDEN',
          message: 'Origin is not allowed.',
          requestId: req.requestId,
        },
      });
      return;
    }

    next();
  };
}
