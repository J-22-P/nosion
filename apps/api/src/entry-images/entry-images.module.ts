import { Module } from '@nestjs/common';
import { EntryImagesController } from './entry-images.controller';
import { EntryImagesService } from './entry-images.service';

/** รูปย่อของรูปในรายละเอียดงาน (รูปแนบ GitHub ของ repo ส่วนตัว) — เก็บใน attachments.data */
@Module({
  controllers: [EntryImagesController],
  providers: [EntryImagesService],
})
export class EntryImagesModule {}
