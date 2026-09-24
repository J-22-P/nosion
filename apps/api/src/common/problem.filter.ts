import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ProblemType, type FieldError, type ProblemDetails } from '@nosion/contracts';
import {
  DomainError,
  EntryNotFoundError,
  PayloadValidationError,
  UnknownModuleError,
  VersionConflictError,
} from '@nosion/core';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { requestContext } from './request-context';

/** แปลง ZodError เป็นรายการ error ราย field ที่ frontend ผูกกับฟอร์มได้ทันที */
export function zodIssuesToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * `instanceof` พังได้เมื่อ zod ถูกติดตั้งสองชุด (เช่น ของ packages/contracts กับของ apps/api)
 * เพราะเป็นคนละคลาสกันในหน่วยความจำ — ตรวจจากรูปร่างของ error แทนจึงทนกว่าที่ boundary
 */
export function isZodError(error: unknown): error is ZodError {
  return (
    error instanceof ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'ZodError' &&
      Array.isArray((error as { issues?: unknown }).issues))
  );
}

/**
 * ทุก error ที่ออกจาก API มีรูปแบบเดียว: RFC 9457 Problem Details
 * — ไม่มี error shape แปลก ๆ หลุดออกไปให้ frontend ต้องเดา
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const problem = this.toProblem(exception, req.originalUrl ?? req.url);

    if (problem.status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${problem.status}: ${problem.detail ?? problem.title}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    const traceId = requestContext.traceId();

    if (isZodError(exception)) {
      return {
        type: ProblemType.validationFailed,
        title: 'Validation failed',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: exception.issues[0]?.message,
        instance,
        traceId,
        errors: zodIssuesToFieldErrors(exception),
      };
    }

    if (exception instanceof VersionConflictError) {
      return {
        type: ProblemType.versionConflict,
        title: 'Version conflict',
        status: HttpStatus.CONFLICT,
        detail: exception.message,
        instance,
        traceId,
      };
    }

    if (exception instanceof PayloadValidationError) {
      return {
        type: ProblemType.validationFailed,
        title: 'Validation failed',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: exception.message,
        instance,
        traceId,
        errors: exception.issues,
      };
    }

    if (exception instanceof EntryNotFoundError) {
      return {
        type: ProblemType.notFound,
        title: 'Not found',
        status: HttpStatus.NOT_FOUND,
        detail: exception.message,
        instance,
        traceId,
      };
    }

    if (exception instanceof UnknownModuleError) {
      return {
        type: ProblemType.validationFailed,
        title: 'Unknown module',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: exception.message,
        instance,
        traceId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      const partial =
        typeof body === 'object' && body !== null ? (body as Partial<ProblemDetails>) : {};
      return {
        type: partial.type ?? this.typeForStatus(status),
        title: partial.title ?? exception.name.replace(/Exception$/, ''),
        status,
        detail: Array.isArray(detail) ? detail.join(', ') : detail,
        instance,
        traceId,
        ...(partial.errors ? { errors: partial.errors } : {}),
      };
    }

    if (exception instanceof DomainError) {
      return {
        type: `https://nosion.dev/errors/${exception.code.replace(/_/g, '-')}`,
        title: 'Domain error',
        status: HttpStatus.BAD_REQUEST,
        detail: exception.message,
        instance,
        traceId,
      };
    }

    // ไม่รู้จัก = ไม่เปิดเผยรายละเอียดภายในให้ client
    return {
      type: ProblemType.internal,
      title: 'Internal server error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง',
      instance,
      traceId,
    };
  }

  private typeForStatus(status: number): string {
    switch (status) {
      case 401:
        return ProblemType.unauthorized;
      case 403:
        return ProblemType.forbidden;
      case 404:
        return ProblemType.notFound;
      case 409:
        return ProblemType.conflict;
      case 422:
        return ProblemType.validationFailed;
      case 429:
        return ProblemType.rateLimited;
      default:
        return ProblemType.internal;
    }
  }
}
