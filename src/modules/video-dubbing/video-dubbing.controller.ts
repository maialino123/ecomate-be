import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { VideoDubbingService } from './video-dubbing.service';
import {
  ProcessVideoDto,
  ProcessVideoResponseDto,
  VideoStatusResponseDto,
  VideoDubbingJobListResponseDto,
} from './dto/process-video.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('video-dubbing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('video-dubbing')
export class VideoDubbingController {
  constructor(private readonly videoDubbingService: VideoDubbingService) {}

  @Post('process/:product1688Id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue video dubbing job for a Product1688',
    description:
      'Starts video processing pipeline: download → extract audio → transcribe → translate → TTS → mix → encode → upload',
  })
  @ApiParam({
    name: 'product1688Id',
    description: 'Product1688 ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 202,
    description: 'Video dubbing job queued successfully',
    type: ProcessVideoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Product1688 not found or no video URL',
  })
  @ApiResponse({
    status: 409,
    description: 'Video is already being processed',
  })
  async processVideo(
    @Param('product1688Id') product1688Id: string,
    @Body() dto: ProcessVideoDto,
  ): Promise<ProcessVideoResponseDto> {
    return this.videoDubbingService.queueVideoProcessing(
      product1688Id,
      dto.options,
    );
  }

  @Get('status/:product1688Id')
  @ApiOperation({
    summary: 'Get video processing status',
    description: 'Returns current status, progress, and URLs when completed',
  })
  @ApiParam({
    name: 'product1688Id',
    description: 'Product1688 ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved successfully',
    type: VideoStatusResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No video processing job found for this product',
  })
  async getVideoStatus(
    @Param('product1688Id') product1688Id: string,
  ): Promise<VideoStatusResponseDto> {
    return this.videoDubbingService.getVideoStatus(product1688Id);
  }

  @Delete(':product1688Id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel/delete video dubbing job',
    description:
      'Cancels active job (if running) and deletes video files from CDN',
  })
  @ApiParam({
    name: 'product1688Id',
    description: 'Product1688 ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 204,
    description: 'Video job cancelled/deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'No video found for this product',
  })
  async deleteVideo(
    @Param('product1688Id') product1688Id: string,
  ): Promise<void> {
    await this.videoDubbingService.deleteVideo(product1688Id);
  }

  @Post('regenerate/:product1688Id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Regenerate video with different settings',
    description: 'Deletes existing video and queues new processing job',
  })
  @ApiParam({
    name: 'product1688Id',
    description: 'Product1688 ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 202,
    description: 'Video regeneration job queued successfully',
    type: ProcessVideoResponseDto,
  })
  async regenerateVideo(
    @Param('product1688Id') product1688Id: string,
    @Body() dto: ProcessVideoDto,
  ): Promise<ProcessVideoResponseDto> {
    return this.videoDubbingService.regenerateVideo(
      product1688Id,
      dto.options,
    );
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List all video dubbing jobs',
    description: 'Returns paginated list of all jobs with their statuses',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by job status',
    example: 'PROCESSING',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results per page',
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Pagination offset',
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Jobs list retrieved successfully',
    type: VideoDubbingJobListResponseDto,
  })
  async listJobs(
    @Query('status') status?: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ): Promise<VideoDubbingJobListResponseDto> {
    return this.videoDubbingService.listJobs(status, limit, offset);
  }

  @Get('jobs/:jobId')
  @ApiOperation({
    summary: 'Get job details by job ID',
    description: 'Returns detailed information about a specific job',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Video dubbing job ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 200,
    description: 'Job details retrieved successfully',
    type: VideoStatusResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
  })
  async getJobDetails(@Param('jobId') jobId: string): Promise<VideoStatusResponseDto> {
    return this.videoDubbingService.getJobDetails(jobId);
  }

  @Post('jobs/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Retry failed job',
    description: 'Re-queues a failed job for processing',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Video dubbing job ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 202,
    description: 'Job re-queued successfully',
    type: ProcessVideoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Job is not in FAILED status',
  })
  async retryJob(@Param('jobId') jobId: string): Promise<ProcessVideoResponseDto> {
    return this.videoDubbingService.retryJob(jobId);
  }
}
