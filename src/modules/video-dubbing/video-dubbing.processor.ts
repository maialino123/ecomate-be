import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@db/prisma.service';
import { S3Service } from '@utils/s3/s3.service';
import { TranslationService } from '@modules/translation/translation.service';
import { VideoDownloaderEngine } from './engines/video-downloader.engine';
import { AudioProcessorEngine } from './engines/audio-processor.engine';
import { WhisperEngine } from './engines/whisper.engine';
import { TTSEngine } from './engines/tts.engine';
import { VideoEncoderEngine } from './engines/video-encoder.engine';
import { VideoDubbingJobData } from './interfaces/video-dubbing.interface';
import { JobStatus, VideoStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import { getErrorMessage, getErrorStack } from '@common/utils/error.utils';

@Processor('video-dubbing')
export class VideoDubbingProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoDubbingProcessor.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private translationService: TranslationService,
    private videoDownloader: VideoDownloaderEngine,
    private audioProcessor: AudioProcessorEngine,
    private whisperEngine: WhisperEngine,
    private ttsEngine: TTSEngine,
    private videoEncoder: VideoEncoderEngine,
  ) {
    super();
  }

  async process(job: Job<VideoDubbingJobData>): Promise<void> {
    const { jobId, product1688Id, originalVideoUrl, options } = job.data;

    this.logger.log(`🎬 Starting video dubbing job: ${jobId}`);
    this.logger.log(`Product: ${product1688Id}, Video: ${originalVideoUrl}`);

    const startTime = Date.now();
    const tempFiles: string[] = [];

    try {
      // Update job status to DOWNLOADING (first step)
      await this.updateJobStatus(jobId, JobStatus.DOWNLOADING, 0, {
        startedAt: new Date(),
      });
      await this.updateProductStatus(product1688Id, VideoStatus.PROCESSING);

      // ===================================================================
      // Step 1: Download video from 1688
      // ===================================================================
      this.logger.log(`📥 [1/8] Downloading video...`);
      await this.updateJobStatus(jobId, JobStatus.DOWNLOADING, 10);

      const downloadResult = await this.videoDownloader.download(
        originalVideoUrl,
        `video_${product1688Id}`,
      );
      tempFiles.push(downloadResult.filePath);

      this.logger.log(`✅ Video downloaded: ${downloadResult.filePath}`);

      // ===================================================================
      // Step 2: Extract audio from video
      // ===================================================================
      this.logger.log(`🎵 [2/8] Extracting audio...`);
      await this.updateJobStatus(jobId, JobStatus.EXTRACTING_AUDIO, 20);

      const audioResult = await this.audioProcessor.extractAudio(
        downloadResult.filePath,
        `audio_${product1688Id}`,
      );
      tempFiles.push(audioResult.audioPath);

      this.logger.log(`✅ Audio extracted: ${audioResult.audioPath}`);

      // ===================================================================
      // Step 3: Separate audio (Phase 2 - skip for MVP)
      // ===================================================================
      let voicePath = audioResult.audioPath;
      let musicPath: string | null = null;

      if (options.keepBGM) {
        this.logger.log(`🎼 [3/8] Separating audio (Demucs)...`);
        await this.updateJobStatus(jobId, JobStatus.SEPARATING_AUDIO, 25);

        const separationResult = await this.audioProcessor.separateAudio(
          audioResult.audioPath,
          `separated_${product1688Id}`,
        );
        voicePath = separationResult.voicePath;
        musicPath = separationResult.musicPath;

        this.logger.log(`✅ Audio separated`);
      } else {
        this.logger.log(`⏭️  [3/8] Skipping audio separation`);
      }

      // ===================================================================
      // Step 4: Transcribe audio with Whisper (Chinese)
      // ===================================================================
      this.logger.log(`🎤 [4/8] Transcribing audio (Whisper)...`);
      await this.updateJobStatus(jobId, JobStatus.TRANSCRIBING, 30);

      const transcription = await this.whisperEngine.transcribe(voicePath, 'zh');

      this.logger.log(`✅ Transcription: ${transcription.text.slice(0, 100)}...`);
      this.logger.log(`Duration: ${transcription.duration}s, Segments: ${transcription.segments.length}`);

      // ===================================================================
      // Step 5: Translate text (Chinese → Vietnamese)
      // ===================================================================
      this.logger.log(`🌐 [5/8] Translating text...`);
      await this.updateJobStatus(jobId, JobStatus.TRANSLATING, 50);

      const translation = await this.translationService.translateText(
        transcription.text,
        'zh',
        options.targetLang || 'vi',
        false, // Use cache
      );

      this.logger.log(`✅ Translation: ${translation.text.slice(0, 100)}...`);

      // ===================================================================
      // Step 6: Generate Vietnamese voiceover (TTS)
      // ===================================================================
      this.logger.log(`🗣️  [6/8] Generating voiceover (TTS)...`);
      await this.updateJobStatus(jobId, JobStatus.GENERATING_VOICE, 60);

      const ttsResult = await this.ttsEngine.synthesize(
        translation.text,
        options.ttsVoice || 'vi-female-1',
        transcription.segments,
      );
      tempFiles.push(ttsResult.audioPath);

      this.logger.log(`✅ TTS audio generated: ${ttsResult.audioPath}`);

      // ===================================================================
      // Step 7: Mix audio (voiceover + background music)
      // ===================================================================
      this.logger.log(`🎚️  [7/8] Mixing audio...`);
      await this.updateJobStatus(jobId, JobStatus.MIXING_AUDIO, 70);

      const mixedAudioPath = await this.audioProcessor.mixAudio(
        ttsResult.audioPath,
        musicPath,
        { duckingLevel: -6 }, // Lower BGM by 6dB when voice is present
      );
      tempFiles.push(mixedAudioPath);

      this.logger.log(`✅ Audio mixed: ${mixedAudioPath}`);

      // ===================================================================
      // Step 8: Encode video with new audio
      // ===================================================================
      this.logger.log(`🎞️  [8/8] Encoding video...`);
      await this.updateJobStatus(jobId, JobStatus.ENCODING_VIDEO, 80);

      const encodingResult = await this.videoEncoder.replaceAudio(
        downloadResult.filePath,
        mixedAudioPath,
        options.quality || '720p',
      );
      tempFiles.push(encodingResult.videoPath);

      this.logger.log(`✅ Video encoded: ${encodingResult.videoPath}`);

      // ===================================================================
      // Step 9: Generate HLS (Phase 2 - optional)
      // ===================================================================
      let hlsPlaylistUrl: string | null = null;

      if (options.generateHLS) {
        this.logger.log(`📡 Generating HLS playlist...`);
        await this.updateJobStatus(jobId, JobStatus.GENERATING_HLS, 85);

        const hlsResult = await this.videoEncoder.generateHLS(encodingResult.videoPath);

        // Upload HLS playlist and segments
        hlsPlaylistUrl = await this.uploadHLS(
          hlsResult.playlistPath,
          hlsResult.segmentPaths,
          product1688Id,
        );

        this.logger.log(`✅ HLS playlist uploaded: ${hlsPlaylistUrl}`);
      }

      // ===================================================================
      // Step 10: Generate thumbnail
      // ===================================================================
      this.logger.log(`📸 Generating thumbnail...`);

      const thumbnailPath = await this.videoEncoder.generateThumbnail(
        encodingResult.videoPath,
        1, // 1 second into video
      );
      tempFiles.push(thumbnailPath);

      // ===================================================================
      // Step 11: Upload to R2 CDN
      // ===================================================================
      this.logger.log(`☁️  Uploading to R2 CDN...`);
      await this.updateJobStatus(jobId, JobStatus.UPLOADING, 90);

      // Upload dubbed video
      const videoKey = this.s3Service.generateKey('videos/dubbed', `${product1688Id}.mp4`);
      const videoBuffer = await fs.readFile(encodingResult.videoPath);
      const dubbedVideoUrl = await this.s3Service.upload(
        videoKey,
        videoBuffer,
        'video/mp4',
        {
          'Cache-Control': 'public, max-age=31536000', // 1 year
        },
      );

      // Upload thumbnail
      const thumbnailKey = this.s3Service.generateKey('videos/thumbnails', `${product1688Id}.jpg`);
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      const thumbnailUrl = await this.s3Service.upload(
        thumbnailKey,
        thumbnailBuffer,
        'image/jpeg',
      );

      this.logger.log(`✅ Files uploaded to CDN`);
      this.logger.log(`Video: ${dubbedVideoUrl}`);
      this.logger.log(`Thumbnail: ${thumbnailUrl}`);

      // ===================================================================
      // Step 12: Update database
      // ===================================================================
      const processingTime = Math.floor((Date.now() - startTime) / 1000);

      this.logger.log(`💾 Updating database...`);

      // Update Product1688
      await this.prisma.product1688.update({
        where: { id: product1688Id },
        data: {
          dubbedVideoUrl,
          hlsPlaylistUrl,
          thumbnailUrl,
          videoStatus: VideoStatus.COMPLETED,
          videoProcessedAt: new Date(),
          videoMeta: {
            duration: downloadResult.duration,
            resolution: options.quality || '720p',
            size: encodingResult.size,
            format: encodingResult.format,
          },
        },
      });

      // Update job
      await this.prisma.videoDubbingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          currentStep: 'COMPLETED',
          completedAt: new Date(),
          dubbedVideoUrl,
          hlsPlaylistUrl,
          subtitlesUrl: null, // Phase 2
          thumbnailUrl,
          processingTime,
          videoMeta: {
            duration: downloadResult.duration,
            resolution: encodingResult.resolution,
            size: encodingResult.size,
            format: encodingResult.format,
          },
          audioMeta: {
            transcription: transcription.text,
            translation: translation.text,
            ttsConfig: {
              voice: options.ttsVoice || 'vi-female-1',
              speed: 1.0,
              pitch: 1.0,
            },
            timings: transcription.segments,
          },
        },
      });

      // ===================================================================
      // Step 13: Cleanup temp files
      // ===================================================================
      this.logger.log(`🧹 Cleaning up temp files...`);
      await this.cleanup(tempFiles);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`✨ Video dubbing completed successfully in ${totalTime}s!`);
      this.logger.log(`Job ID: ${jobId}`);
      this.logger.log(`Product ID: ${product1688Id}`);
      this.logger.log(`Dubbed video: ${dubbedVideoUrl}`);

    } catch (error) {
      this.logger.error(`❌ Video dubbing failed: ${getErrorMessage(error)}`);
      this.logger.error(getErrorStack(error));

      await this.handleError(jobId, product1688Id, error as Error);

      // Cleanup temp files
      await this.cleanup(tempFiles);

      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  /**
   * Update job status and progress
   */
  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress: number,
    data: any = {},
  ): Promise<void> {
    await this.prisma.videoDubbingJob.update({
      where: { id: jobId },
      data: {
        status,
        progress,
        currentStep: status,
        ...data,
      },
    });
  }

  /**
   * Update product video status
   */
  private async updateProductStatus(
    product1688Id: string,
    videoStatus: VideoStatus,
  ): Promise<void> {
    await this.prisma.product1688.update({
      where: { id: product1688Id },
      data: { videoStatus },
    });
  }

  /**
   * Handle processing error
   */
  private async handleError(
    jobId: string,
    product1688Id: string,
    error: Error,
  ): Promise<void> {
    const job = await this.prisma.videoDubbingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) return;

    if (job.retryCount >= job.maxRetries) {
      // Max retries reached - mark as FAILED
      await this.prisma.videoDubbingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          failedAt: new Date(),
          errorMessage: getErrorMessage(error),
          errorStack: getErrorStack(error),
        },
      });

      await this.prisma.product1688.update({
        where: { id: product1688Id },
        data: { videoStatus: VideoStatus.FAILED },
      });

      this.logger.error(`Job ${jobId} failed after ${job.retryCount} retries`);
    } else {
      // Will retry
      await this.prisma.videoDubbingJob.update({
        where: { id: jobId },
        data: {
          retryCount: job.retryCount + 1,
          errorMessage: getErrorMessage(error),
        },
      });

      this.logger.warn(`Job ${jobId} will retry (attempt ${job.retryCount + 1}/${job.maxRetries})`);
    }
  }

  /**
   * Upload HLS playlist and segments to R2
   */
  private async uploadHLS(
    playlistPath: string,
    segmentPaths: string[],
    product1688Id: string,
  ): Promise<string> {
    // Upload playlist
    const playlistKey = this.s3Service.generateKey('videos/hls', `${product1688Id}/playlist.m3u8`);
    const playlistBuffer = await fs.readFile(playlistPath);
    const playlistUrl = await this.s3Service.upload(
      playlistKey,
      playlistBuffer,
      'application/vnd.apple.mpegurl',
    );

    // Upload segments
    for (const segmentPath of segmentPaths) {
      const segmentName = segmentPath.split('/').pop();
      const segmentKey = this.s3Service.generateKey('videos/hls', `${product1688Id}/${segmentName}`);
      const segmentBuffer = await fs.readFile(segmentPath);
      await this.s3Service.upload(segmentKey, segmentBuffer, 'video/mp2t');
    }

    return playlistUrl;
  }

  /**
   * Cleanup temp files
   */
  private async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        this.logger.debug(`Deleted temp file: ${filePath}`);
      } catch (error) {
        this.logger.warn(`Failed to delete ${filePath}: ${getErrorMessage(error)}`);
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`❌ Job ${job.id} failed: ${getErrorMessage(error)}`);
  }
}
