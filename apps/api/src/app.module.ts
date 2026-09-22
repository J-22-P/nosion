import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ProblemDetailsFilter } from './common/problem.filter';
import { TraceMiddleware } from './common/trace.middleware';
import { RegistryModule } from './core/registry/registry.module';
import { EntriesModule } from './entries/entries.module';
import { HealthModule } from './health/health.module';
import { ConfigModule } from './infra/config/config.module';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { TaskModule } from './modules/task/task.module';
import { OrganizationModule } from './organization/organization.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    MailModule,
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    RegistryModule,
    AuthModule,
    UsersModule,
    OrganizationModule,
    EntriesModule,

    // ── โมดูลโดเมน: เพิ่มบรรทัดเดียวต่อโมดูลใหม่ ──
    TaskModule,

    HealthModule,
  ],
  providers: [
    // ปลอดภัยโดยค่าเริ่มต้น: ทุก endpoint ต้องล็อกอิน ยกเว้นที่ติด @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
