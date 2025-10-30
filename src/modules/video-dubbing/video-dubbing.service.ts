import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@db/prisma.service';
import { S3Service } from '@utils/s3/s3.service';
import { VideoStatus, JobStatus } from '@prisma/client';
import {
  VideoProcessingOptions,
  VideoDubbingJobData,
  VideoDubbingJobStatus,
} from './interfaces/video-dubbing.interface';
import {
  ProcessVideoResponseDto,
  VideoStatusResponseDto,
  VideoDubbingJobListResponseDto,
} from './dto/process-video.dto';
import { getErrorMessage } from '@common/utils/error.utils';

@Injectable()
export class VideoDubbingService {
  private readonly logger = new Logger(VideoDubbingService.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    @InjectQueue('video-dubbing') private videoDubbingQueue: Queue,
  ) {}

  /**
   * Queue video processing job
   */
  async queueVideoProcessing(
    product1688Id: string,
    options?: VideoProcessingOptions,
  ): Promise<ProcessVideoResponseDto> {
    this.logger.log(`Queuing video processing for product1688: ${product1688Id}`);

    // Check if product exists
    const product = await this.prisma.product1688.findUnique({
      where: { id: product1688Id },
    });

    if (!product) {
      throw new NotFoundException(`Product1688 with ID ${product1688Id} not found`);
    }

    // Check if product has video URL
    if (!product.originalVideoUrl) {
      throw new BadRequestException('Product does not have a video URL');
    }

    // Check if video is already being processed
    if (product.videoStatus === VideoStatus.PROCESSING || product.videoStatus === VideoStatus.QUEUED) {
      throw new ConflictException('Video is already being processed');
    }

    // Create job record in database
    const job = await this.prisma.videoDubbingJob.create({
      data: {
        product1688Id,
        originalVideoUrl: product.originalVideoUrl,
        sourceLang: 'zh',
        targetLang: options?.targetLang || 'vi',
        options: (options || {}) as Record<string, any>,
        status: JobStatus.QUEUED,
        progress: 0,
      },
    });

    // Update product status
    await this.prisma.product1688.update({
      where: { id: product1688Id },
      data: {
        videoStatus: VideoStatus.QUEUED,
      },
    });

    // Add job to BullMQ queue
    const jobData: VideoDubbingJobData = {
      jobId: job.id,
      product1688Id,
      originalVideoUrl: product.originalVideoUrl,
      options: {
        keepBGM: options?.keepBGM || false,
        ttsVoice: options?.ttsVoice || 'vi-female-1',
        quality: options?.quality || '720p',
        generateSubtitles: options?.generateSubtitles || false,
        generateHLS: options?.generateHLS || false,
        targetLang: options?.targetLang || 'vi',
      },
    };

    await this.videoDubbingQueue.add('dub-video', jobData, {
      attempts: 3, // Retry 3 times on failure
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 seconds
      },
      removeOnComplete: false, // Keep completed jobs for 24h
      removeOnFail: false, // Keep failed jobs for debugging
    });

    this.logger.log(`Video dubbing job queued: ${job.id}`);

    // Estimate processing time based on video duration (rough estimate)
    const estimatedTime = 300; // 5 minutes default

    return {
      jobId: job.id,
      status: 'QUEUED',
      estimatedTime,
      message: 'Video processing job queued successfully',
    };
  }

  /**
   * Get video processing status
   */
  async getVideoStatus(product1688Id: string): Promise<VideoStatusResponseDto> {
    const product = await this.prisma.product1688.findUnique({
      where: { id: product1688Id },
      include: {
        videoDubbingJobs: {
          orderBy: { queuedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product1688 with ID ${product1688Id} not found`);
    }

    const latestJob = product.videoDubbingJobs[0];

    if (!latestJob) {
      throw new NotFoundException('No video processing job found for this product');
    }

    // Calculate estimated completion time
    let estimatedCompletion: Date | undefined;
    const isProcessing = latestJob.status !== JobStatus.QUEUED &&
                        latestJob.status !== JobStatus.COMPLETED &&
                        latestJob.status !== JobStatus.FAILED;
    if (isProcessing && latestJob.startedAt) {
      const elapsedSeconds = (Date.now() - latestJob.startedAt.getTime()) / 1000;
      const totalEstimatedSeconds = 300; // 5 minutes
      const remainingSeconds = Math.max(0, totalEstimatedSeconds - elapsedSeconds);
      estimatedCompletion = new Date(Date.now() + remainingSeconds * 1000);
    }

    return {
      status: latestJob.status,
      progress: latestJob.progress,
      currentStep: latestJob.currentStep || latestJob.status,
      startedAt: latestJob.startedAt ?? undefined,
      estimatedCompletion,
      dubbedVideoUrl: latestJob.dubbedVideoUrl ?? undefined,
      hlsPlaylistUrl: latestJob.hlsPlaylistUrl ?? undefined,
      subtitlesUrl: latestJob.subtitlesUrl ?? undefined,
      errorMessage: latestJob.errorMessage ?? undefined,
      retryCount: latestJob.retryCount,
    };
  }

  /**
   * Delete video and cancel job
   */
  async deleteVideo(product1688Id: string): Promise<void> {
    const product = await this.prisma.product1688.findUnique({
      where: { id: product1688Id },
      include: {
        videoDubbingJobs: {
          orderBy: { queuedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product1688 with ID ${product1688Id} not found`);
    }

    // Cancel active job if any
    const activeJob = product.videoDubbingJobs[0];
    const isJobActive = activeJob && activeJob.status !== JobStatus.COMPLETED && activeJob.status !== JobStatus.FAILED;
    if (isJobActive) {
      await this.prisma.videoDubbingJob.update({
        where: { id: activeJob.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage: 'Job cancelled by user',
          failedAt: new Date(),
        },
      });

      // Remove from queue
      const jobs = await this.videoDubbingQueue.getJobs(['waiting', 'active']);
      for (const job of jobs) {
        if (job.data.jobId === activeJob.id) {
          await job.remove();
        }
      }
    }

    // Delete video files from S3
    if (product.dubbedVideoUrl) {
      try {
        const key = this.extractS3Key(product.dubbedVideoUrl);
        await this.s3Service.delete(key);
      } catch (error) {
        this.logger.warn(`Failed to delete dubbed video: ${getErrorMessage(error)}`);
      }
    }

    if (product.hlsPlaylistUrl) {
      try {
        const key = this.extractS3Key(product.hlsPlaylistUrl);
        await this.s3Service.delete(key);
        // TODO: Delete HLS segments
      } catch (error) {
        this.logger.warn(`Failed to delete HLS playlist: ${getErrorMessage(error)}`);
      }
    }

    if (product.thumbnailUrl) {
      try {
        const key = this.extractS3Key(product.thumbnailUrl);
        await this.s3Service.delete(key);
      } catch (error) {
        this.logger.warn(`Failed to delete thumbnail: ${getErrorMessage(error)}`);
      }
    }

    // Update product
    await this.prisma.product1688.update({
      where: { id: product1688Id },
      data: {
        dubbedVideoUrl: null,
        hlsPlaylistUrl: null,
        thumbnailUrl: null,
        videoStatus: VideoStatus.CANCELLED,
        videoMeta: null as any, // Prisma Json type accepts null
      },
    });

    this.logger.log(`Video deleted for product1688: ${product1688Id}`);
  }

  /**
   * Regenerate video with different settings
   */
  async regenerateVideo(
    product1688Id: string,
    options?: VideoProcessingOptions,
  ): Promise<ProcessVideoResponseDto> {
    // Delete existing video
    try {
      await this.deleteVideo(product1688Id);
    } catch (error) {
      // Ignore errors if no video exists
      this.logger.warn(`No existing video to delete: ${getErrorMessage(error)}`);
    }

    // Queue new processing job
    return this.queueVideoProcessing(product1688Id, options);
  }

  /**
   * List all jobs
   */
  async listJobs(
    status?: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<VideoDubbingJobListResponseDto> {
    const where = status ? { status: status as JobStatus } : {};

    const [jobs, total] = await Promise.all([
      this.prisma.videoDubbingJob.findMany({
        where,
        orderBy: { queuedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.videoDubbingJob.count({ where }),
    ]);

    return {
      total,
      jobs: jobs.map((job) => ({
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep || job.status,
        startedAt: job.startedAt ?? undefined,
        estimatedCompletion: undefined, // TODO: Calculate
        dubbedVideoUrl: job.dubbedVideoUrl ?? undefined,
        hlsPlaylistUrl: job.hlsPlaylistUrl ?? undefined,
        subtitlesUrl: job.subtitlesUrl ?? undefined,
        errorMessage: job.errorMessage ?? undefined,
        retryCount: job.retryCount,
      })),
    };
  }

  /**
   * Get job details by job ID
   */
  async getJobDetails(jobId: string): Promise<VideoStatusResponseDto> {
    const job = await this.prisma.videoDubbingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    return {
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep || job.status,
      startedAt: job.startedAt ?? undefined,
      estimatedCompletion: undefined,
      dubbedVideoUrl: job.dubbedVideoUrl ?? undefined,
      hlsPlaylistUrl: job.hlsPlaylistUrl ?? undefined,
      subtitlesUrl: job.subtitlesUrl ?? undefined,
      errorMessage: job.errorMessage ?? undefined,
      retryCount: job.retryCount,
    };
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId: string): Promise<ProcessVideoResponseDto> {
    const job = await this.prisma.videoDubbingJob.findUnique({
      where: { id: jobId },
      include: { product1688: true },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    if (job.status !== JobStatus.FAILED) {
      throw new ConflictException('Job is not in FAILED status');
    }

    // Reset job status
    await this.prisma.videoDubbingJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.QUEUED,
        progress: 0,
        currentStep: null,
        startedAt: null,
        failedAt: null,
        errorMessage: null,
        errorStack: null,
        retryCount: job.retryCount + 1,
      },
    });

    // Re-queue job
    const jobData: VideoDubbingJobData = {
      jobId: job.id,
      product1688Id: job.product1688Id,
      originalVideoUrl: job.originalVideoUrl,
      options: (job.options as VideoProcessingOptions) || {},
    };

    await this.videoDubbingQueue.add('dub-video', jobData, {
      attempts: 1, // No auto-retry for manual retry
    });

    this.logger.log(`Job re-queued: ${jobId}`);

    return {
      jobId: job.id,
      status: 'QUEUED',
      estimatedTime: 300,
      message: 'Job re-queued successfully',
    };
  }

  /**
   * Extract S3 key from full URL
   */
  private extractS3Key(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.slice(1); // Remove leading slash
    } catch (error) {
      this.logger.error(`Failed to parse S3 URL: ${url}`);
      return url;
    }
  }
}
