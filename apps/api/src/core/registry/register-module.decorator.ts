import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common';

export const REGISTER_MODULE_KEY = 'nosion:trackable-module';

/**
 * ติดบนคลาสที่ implement TrackableModule
 *
 * ผลลัพธ์: ModuleRegistry เก็บ provider ตัวนี้เข้าทะเบียนตอน bootstrap โดยอัตโนมัติ
 * → เพิ่มโมดูลใหม่ไม่ต้องแก้ไฟล์ registry, Today, Calendar หรือ Parser เลยสักบรรทัด
 */
export const RegisterModule = () =>
  applyDecorators(Injectable(), SetMetadata(REGISTER_MODULE_KEY, true));
