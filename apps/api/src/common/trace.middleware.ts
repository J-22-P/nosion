import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ulid } from 'ulid';
import { requestContext } from './request-context';

/**
 * ทุก request ได้ traceId เดียวกันตลอดสาย (log, error response, audit log)
 * รับ trace id จาก header ของ gateway ได้ เพื่อเชื่อม trace ข้าม service
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id') ?? req.header('x-trace-id');
    const traceId = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : ulid();
    res.setHeader('x-request-id', traceId);
    requestContext.run({ traceId, ip: req.ip }, () => next());
  }
}
