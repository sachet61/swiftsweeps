import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import type { Logger } from '../logging/logger.js';

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly safeMessage: string;
  public readonly details?: Record<string, string>;

  constructor(
    statusCode: number,
    code: string,
    safeMessage: string,
    details?: Record<string, string>,
  ) {
    super(safeMessage);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.safeMessage = safeMessage;
    this.details = details;
  }
}

export function validateRequestBody<T>(
  validator: (body: unknown) => T,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = validator(req.body);
      next();
    } catch (err) {
      if (err instanceof HttpError) {
        next(err);
        return;
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Invalid request body.';
      next(new HttpError(400, 'VALIDATION_ERROR', message));
    }
  };
}

export const notFoundHandler: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new HttpError(404, 'ENDPOINT_NOT_FOUND', 'Endpoint not found.'));
};

interface BodyParserLikeError {
  type?: string;
  status?: number;
  statusCode?: number;
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const requestId = req.requestId;
    const parserErr = err as BodyParserLikeError | undefined;

    if (
      parserErr?.type === 'entity.too.large' ||
      parserErr?.status === 413 ||
      parserErr?.statusCode === 413
    ) {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the allowed size limit.',
          requestId,
        },
      });
      return;
    }

    if (
      err instanceof SyntaxError &&
      (parserErr?.status === 400 || parserErr?.statusCode === 400)
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON request body.',
          requestId,
        },
      });
      return;
    }

    if (err instanceof HttpError) {
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.safeMessage,
          ...(err.details ? { details: err.details } : {}),
          requestId,
        },
      });
      return;
    }

    logger.error('unhandled_request_error', {
      requestId,
      method: req.method,
      path: req.path,
      error: err,
    });

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred.',
        requestId,
      },
    });
  };
}
