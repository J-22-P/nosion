import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { type TrackableModule } from '@nosion/core';
import { ModuleRegistryService } from './module-registry.service';
import { REGISTER_MODULE_KEY } from './register-module.decorator';

/**
 * ไฟล์เดียวในระบบที่รู้จักทั้ง DI container และ TrackableModule
 *
 * ทำหน้าที่เดียว: กวาดหา provider ที่ติด @RegisterModule() แล้วยัดเข้าทะเบียน
 * โค้ดส่วนอื่นคุยกับ ModuleRegistryService ซึ่งเป็น logic บริสุทธิ์เท่านั้น
 */
@Module({
  imports: [DiscoveryModule],
  providers: [ModuleRegistryService],
  exports: [ModuleRegistryService],
})
export class RegistryModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(RegistryModule.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onApplicationBootstrap(): void {
    const found = this.discovery
      .getProviders()
      .filter((wrapper) => wrapper.instance && wrapper.metatype)
      .filter((wrapper) =>
        Reflect.getMetadata(REGISTER_MODULE_KEY, wrapper.metatype as object) === true,
      )
      .map((wrapper) => wrapper.instance as TrackableModule<unknown>);

    this.registry.registerAll(found);
    this.logger.log(
      `ลงทะเบียนโมดูลแล้ว ${this.registry.size} ตัว: ${this.registry.keys().join(', ') || '(ไม่มี)'}`,
    );
  }
}
