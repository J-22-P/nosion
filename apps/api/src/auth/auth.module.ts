import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { ApiKeysController } from './api-keys/api-keys.controller';
import { ApiKeysService } from './api-keys/api-keys.service';
import { AuthController } from './auth.controller';
import { OAuthAccountsController, OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
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
  controllers: [AuthController, ApiKeysController, OAuthController, OAuthAccountsController],
  providers: [
    AuthService,
    ApiKeysService,
    OAuthService,
    TokenService,
    PasswordService,
    SessionRevocationService,
    JwtAuthGuard,
    RateLimitGuard,
  ],
  exports: [
    AuthService,
    ApiKeysService,
    OAuthService,
    TokenService,
    SessionRevocationService,
    JwtAuthGuard,
    RateLimitGuard,
  ],
})
export class AuthModule {}
