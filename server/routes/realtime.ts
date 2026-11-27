import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  canUserReceiveRealtimeEvent,
  type RealtimeEventBroker,
} from '../realtime/realtimeEvents.js';

export interface RealtimeRouterDeps {
  realtimeEvents: RealtimeEventBroker;
  requireAuth: RequestHandler;
}

function readLastEventId(req: Request): string | undefined {
  const headerVal = req.get('last-event-id');
  if (typeof headerVal === 'string' && headerVal.trim()) {
    return headerVal.trim();
  }
  const queryVal = req.query.lastEventId;
  if (typeof queryVal === 'string' && queryVal.trim()) {
    return queryVal.trim();
  }
  return undefined;
}

export function createRealtimeRouter({
  realtimeEvents,
  requireAuth,
}: RealtimeRouterDeps): Router {
  const router = Router();

  router.get(
    '/realtime/stream',
    requireAuth,
    (req: Request, res: Response) => {
      const authUser = req.authContext!.user;

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const writeEvent = (
        eventName: string,
        payload: unknown,
        eventId?: string,
      ) => {
        if (res.writableEnded) return;
        const idLine = eventId ? `id: ${eventId}\n` : '';
        res.write(`${idLine}event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      if (!res.writableEnded) {
        res.write('retry: 3000\n\n');
      }

      writeEvent('ready', {
        connectedAt: new Date().toISOString(),
        role: authUser.role,
        streamEpoch: realtimeEvents.epoch,
        latestEventId: realtimeEvents.latestEventId,
      });

      const replay = realtimeEvents.getReplaySince(readLastEventId(req));
      if (replay.status === 'resync_required') {
        writeEvent('resync_required', {
          reason: replay.reason,
          streamEpoch: realtimeEvents.epoch,
          latestEventId: realtimeEvents.latestEventId,
        });
      } else if (replay.status === 'replay') {
        for (const envelope of replay.events) {
          if (!canUserReceiveRealtimeEvent(envelope.audience, authUser)) {
            continue;
          }
          writeEvent(envelope.event.type, envelope.event, envelope.eventId);
        }
      }

      const unsubscribe = realtimeEvents.subscribe((envelope) => {
        if (!canUserReceiveRealtimeEvent(envelope.audience, authUser)) {
          return;
        }
        writeEvent(envelope.event.type, envelope.event, envelope.eventId);
      });

      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 15_000);
      heartbeat.unref?.();

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeat);
        unsubscribe();
      };

      req.on('close', cleanup);
      res.on('close', cleanup);
    },
  );

  return router;
}
