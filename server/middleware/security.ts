import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ServerConfig } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseOriginFromHeader(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'null') {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function buildAllowedOrigins(config: ServerConfig): Set<string> {
  const allowed = new Set<string>();
  if (config.appOrigin) {
    allowed.add(config.appOrigin);
  }
  for (const origin of config.trustedOrigins ?? []) {
    if (origin) {
      allowed.add(origin);
    }
  }
  return allowed;
}

function sendOriginForbidden(
  req: Request,
  res: Response,
  code: 'ORIGIN_FORBIDDEN' | 'CSRF_ORIGIN_REQUIRED',
  message: string,
): void {
  res.status(403).json({
    error: {
      code,
      message,
      requestId: req.requestId,
    },
  });
}

export function createSecurityMiddleware(
  config: ServerConfig,
  logger?: Logger,
): RequestHandler {
  const allowedOrigins = buildAllowedOrigins(config);

  const isAllowedOrigin = (
    origin: string | undefined,
    req: Request,
  ): boolean => {
    if (!origin) {
      return false;
    }
    if (allowedOrigins.has(origin)) {
      return true;
    }
    if (!config.allowSameHostOrigin) {
      return false;
    }
    const rawHost =
      req.header('x-forwarded-host')?.split(',')[0]?.trim() ||
      req.header('host')?.trim() ||
      '';
    if (!rawHost) {
      return false;
    }
    try {
      return new URL(origin).host.toLowerCase() === rawHost.toLowerCase();
    } catch {
      return false;
    }
  };

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
    const normalizedOrigin = rawOrigin
      ? parseOriginFromHeader(rawOrigin) ?? rawOrigin
      : undefined;
    const secFetchSite = req.header('sec-fetch-site')?.trim().toLowerCase();
    const refererOrigin = parseOriginFromHeader(req.header('referer'));
    const hasCookieHeader = Boolean(req.header('cookie')?.trim());

    if (normalizedOrigin) {
      if (isAllowedOrigin(normalizedOrigin, req)) {
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
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
      } else if (req.method === 'OPTIONS' || MUTATING_METHODS.has(req.method)) {
        logger?.warn('origin_forbidden', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          reason: 'ORIGIN_NOT_IN_ALLOWLIST',
          receivedOrigin: normalizedOrigin,
          allowedOrigins: [...allowedOrigins],
        });
        sendOriginForbidden(
          req,
          res,
          'ORIGIN_FORBIDDEN',
          'Origin is not allowed.',
        );
        return;
      }
    }

    if (MUTATING_METHODS.has(req.method)) {
      if (secFetchSite === 'cross-site') {
        logger?.warn('origin_forbidden', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          reason: 'CROSS_SITE_FETCH',
          secFetchSite,
        });
        sendOriginForbidden(
          req,
          res,
          'ORIGIN_FORBIDDEN',
          'Cross-site mutating requests are not allowed.',
        );
        return;
      }

      if (refererOrigin && !isAllowedOrigin(refererOrigin, req)) {
        logger?.warn('origin_forbidden', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          reason: 'REFERER_NOT_IN_ALLOWLIST',
          receivedRefererOrigin: refererOrigin,
          allowedOrigins: [...allowedOrigins],
        });
        sendOriginForbidden(
          req,
          res,
          'ORIGIN_FORBIDDEN',
          'Referer origin is not allowed.',
        );
        return;
      }

      if (hasCookieHeader) {
        const originMatches = isAllowedOrigin(normalizedOrigin, req);
        const refererMatches = isAllowedOrigin(refererOrigin ?? undefined, req);
        const fetchSiteMatches = secFetchSite === 'same-origin';

        if (!originMatches && !refererMatches && !fetchSiteMatches) {
          logger?.warn('origin_forbidden', {
            requestId: req.requestId,
            method: req.method,
            path: req.path,
            reason: 'CSRF_ORIGIN_REQUIRED',
            receivedOrigin: normalizedOrigin ?? null,
            receivedRefererOrigin: refererOrigin ?? null,
            secFetchSite: secFetchSite ?? null,
          });
          sendOriginForbidden(
            req,
            res,
            'CSRF_ORIGIN_REQUIRED',
            'Trusted same-origin header is required for cookie-authenticated mutations.',
          );
          return;
        }
      }
    }

    next();
  };
}

export function createRequestSizeGuard(maxBytes: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawContentLength = req.header('content-length');
    if (rawContentLength) {
      const parsedLength = Number.parseInt(rawContentLength, 10);
      if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
        res.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request body exceeds the allowed size limit.',
            requestId: req.requestId,
          },
        });
        return;
      }
    }

    next();
  };
}
