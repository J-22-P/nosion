import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * validate ที่ boundary ด้วย schema ชุดเดียวกับที่ frontend ใช้ (packages/contracts)
 * ZodError ที่โยนออกไปถูกแปลงเป็น RFC 9457 โดย ProblemDetailsFilter
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    return this.schema.parse(value);
  }
}

/** น้ำตาลไวยากรณ์: `@Body(zodBody(createEntrySchema)) dto: CreateEntryInput` */
export const zodBody = <T>(schema: ZodType<T>) => new ZodValidationPipe(schema);
export const zodQuery = <T>(schema: ZodType<T>) => new ZodValidationPipe(schema);
