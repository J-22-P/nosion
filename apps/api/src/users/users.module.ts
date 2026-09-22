import { Module } from '@nestjs/common';
import { UserContextService } from './user-context.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserContextService],
  exports: [UsersService, UserContextService],
})
export class UsersModule {}
