import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { reviewQuerySchema, type ReviewQuery, type WeeklyReviewDto } from '@nosion/contracts';
import { CurrentUser, PublicApi } from '../../common/decorators';
import { zodQuery } from '../../common/zod-validation.pipe';
import { ReviewService } from './review.service';

@ApiTags('review')
@Controller('review')
@PublicApi()
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  /** สรุปรายสัปดาห์รวมทุกโมดูล — `?week=2026-W42` (ไม่ส่ง = สัปดาห์นี้) */
  @Get('weekly')
  weekly(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(reviewQuerySchema)) query: ReviewQuery,
  ): Promise<WeeklyReviewDto> {
    return this.review.weekly(userId, query.week);
  }
}
