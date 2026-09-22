import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { PasswordService } from './password.service';
import { SessionRevocationService } from './session-revocation.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: { issuer: 'nosion', audience: 'nosion-web' },
        verifyOptions: { issuer: 'nosion', audience: 'nosion-web' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    SessionRevocationService,
    JwtAuthGuard,
    RateLimitGuard,
  ],
  exports: [AuthService, TokenService, SessionRevocationService, JwtAuthGuard, RateLimitGuard],
})
export class AuthModule {}
