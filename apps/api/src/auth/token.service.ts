import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  sid: string;
  demo: boolean;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * access token อายุสั้น เก็บใน memory ฝั่ง client เท่านั้น (ไม่แตะ localStorage)
   *
   * ส่ง expiresIn เป็น "จำนวนวินาที" ไม่ใช่สตริง "15m" เพราะ type ของ jsonwebtoken
   * รับสตริงเฉพาะรูปแบบที่มันรู้จัก (template literal type) ซึ่ง string ธรรมดาไม่ผ่าน
   * — เราแปลงเองด้วย parseDuration อยู่แล้ว จึงได้ทั้ง type safety และรูปแบบ env ที่คนอ่านง่าย
   */
  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, { expiresIn: this.accessTtlSeconds() });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token);
  }

  /** refresh token เป็น opaque random ไม่ใช่ JWT — เพิกถอนได้ทันทีและไม่พกข้อมูลใด ๆ */
  createRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokenService.hashToken(token) };
  }

  /** เก็บแต่ hash ลง DB — ฐานข้อมูลรั่วก็ใช้ token ไม่ได้ */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** token ใช้ครั้งเดียวสำหรับยืนยันอีเมล / รีเซ็ตรหัสผ่าน */
  static createOneTimeToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokenService.hashToken(token) };
  }

  accessTtlSeconds(): number {
    return parseDuration(this.config.JWT_ACCESS_TTL);
  }

  refreshTtlSeconds(): number {
    return parseDuration(this.config.JWT_REFRESH_TTL);
  }
}

/** "15m" → 900 — รองรับ s, m, h, d */
export function parseDuration(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) throw new Error(`รูปแบบระยะเวลาไม่ถูกต้อง: ${input}`);
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[unit];
  return value * multiplier;
}
