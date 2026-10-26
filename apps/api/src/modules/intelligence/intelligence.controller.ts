import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  CreateRecommendationDto,
  DigestQueryDto,
  ExplainConflictDto,
  GenerateDigestDto,
  RecommendationQueryDto,
  ReviewDigestDto,
  ReviewRecommendationDto,
} from './dto/intelligence.dto.js';
import { IntelligenceService } from './intelligence.service.js';

@ApiTags('intelligence')
@ApiBearerAuth()
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Post('digests/generate')
  @RequirePermissions(PERMISSIONS.INTELLIGENCE_MANAGE)
  generateDigest(@Body() dto?: GenerateDigestDto) {
    return this.intelligence.generateDailyDigest(dto);
  }

  @Get('digests')
  @RequirePermissions(PERMISSIONS.INTELLIGENCE_READ)
  listDigests(@Query() query: DigestQueryDto) {
    return this.intelligence.listDailyDigests(query);
  }

  @Post('digests/:id/review')
  @RequirePermissions(PERMISSIONS.INTELLIGENCE_MANAGE)
  reviewDigest(
    @Param('id') id: string,
    @Body() dto: ReviewDigestDto,
  ) {
    return this.intelligence.reviewDailyDigest(id, dto);
  }

  @Post('recommendations')
  @RequirePermissions(PERMISSIONS.INTELLIGENCE_MANAGE)
  createRecommendation(@Body() dto: CreateRecommendationDto) {
    return this.intelligence.createRecommendation(dto);
  }

  @Get('recommendations')
  @RequirePermissions(PERMISSIONS.INTELLIGENCE_READ)
  listRecommendations(@Query() query: RecommendationQueryDto) {
    return this.intelligence.listRecommendations(query);
  }

  @Post('recommendations/:id/review')
  @RequirePermissions(PERMISSIONS.INTELLIGENCE_MANAGE)
  reviewRecommendation(
    @Param('id') id: string,
    @Body() dto: ReviewRecommendationDto,
  ) {
    return this.intelligence.reviewRecommendation(id, dto);
  }

  @Post('conflicts/explain')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  explainConflict(@Body() dto: ExplainConflictDto) {
    return this.intelligence.explainConflict(dto);
  }
}
